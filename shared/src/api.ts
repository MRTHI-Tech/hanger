import type {
  Alternative,
  AlternativesResponse,
  Garment,
  GarmentCategory,
  Health,
  LinkPreview,
  Outfit,
  OutfitSlot,
  Person,
  PersonUploadResult,
  TryOnCategory,
  TryOnResult,
  VideoPose,
} from './types';

/**
 * Where the server is.
 *
 * The side panel runs on the same machine as the server, so localhost is right
 * for it and always will be. A phone is a different machine on the same
 * Wi-Fi — localhost there means the phone itself. So the address is settable,
 * and each client decides its own before making a call.
 */
let apiBase = 'http://localhost:8787';

export function setApiBase(url: string): void {
  apiBase = url.replace(/\/+$/, '');
}

export function getApiBase(): string {
  return apiBase;
}

/**
 * Which device is calling.
 *
 * The side panel never sets one and never needs to: it reaches the server on
 * loopback, and the server takes that as proof of who it is. A phone is a
 * different machine, so it carries the token it earned by pairing.
 */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/**
 * A signed-in session, asked for fresh on every call.
 *
 * Session tokens are short-lived by design — a minute or so — so holding one
 * in a variable would mean every request after the first minute failing. The
 * provider hands back a current one, refreshing it if it has to.
 *
 * Takes precedence over the device token: somebody who has signed in *is* the
 * account holder, and a paired phone is only ever a stand-in for one.
 */
let tokenProvider: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(
  provider: (() => Promise<string | null>) | null,
): void {
  tokenProvider = provider;
}

async function withAuth(init?: RequestInit): Promise<RequestInit | undefined> {
  const token = (tokenProvider ? await tokenProvider() : null) ?? authToken;
  if (!token) return init;
  return {
    ...init,
    headers: {...init?.headers, Authorization: `Bearer ${token}`},
  };
}

/**
 * Called whenever the server says this device isn't paired — including when it
 * was, and has just been revoked from the laptop. Every screen would otherwise
 * have to handle that one code itself, and the right answer is the same
 * everywhere: stop, and ask to be let in again.
 */
export type UnauthorizedReason = 'not_paired' | 'not_signed_in';

let onUnauthorized: ((reason: UnauthorizedReason) => void) | null = null;

export function setUnauthorizedHandler(
  handler: ((reason: UnauthorizedReason) => void) | null,
): void {
  onUnauthorized = handler;
}

/**
 * An error carrying the human sentence from the server's §13 map. Every screen
 * renders `.message` directly — raw codes never reach the user.
 */
export class HangerError extends Error {
  code: string;
  hint?: string;
  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

const OFFLINE_MESSAGE =
  "We can't reach the Hanger server. Start it with npm run dev and try again.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, await withAuth(init));
  } catch {
    throw new HangerError('server_unreachable', OFFLINE_MESSAGE);
  }
  if (!res.ok) {
    let code = 'unknown';
    let message = 'Something went wrong. Try that again.';
    let hint: string | undefined;
    try {
      const body = (await res.json()) as {
        error?: {code: string; message: string; hint?: string};
      };
      if (body.error) {
        code = body.error.code;
        message = body.error.message;
        hint = body.error.hint;
      }
    } catch {
      /* non-JSON error body; keep the generic sentence */
    }
    if (code === 'not_paired' || code === 'not_signed_in') onUnauthorized?.(code);
    throw new HangerError(code, message, hint);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<Health>('/health'),

  getPerson: () => request<Person | null>('/person'),

  uploadPersonPhoto: (blob: Blob, filename: string) => {
    const form = new FormData();
    form.append('photo', blob, filename);
    return request<PersonUploadResult>('/person/photo', {
      method: 'POST',
      body: form,
    });
  },

  deletePerson: () => request<void>('/person', {method: 'DELETE'}),

  listGarments: (category?: GarmentCategory) =>
    request<Garment[]>(
      `/garments${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    ),

  getGarment: (id: string) => request<Garment>(`/garments/${id}`),

  saveGarment: (blob: Blob, meta: SaveGarmentMeta) => {
    const form = new FormData();
    form.append('image', blob, 'garment.jpg');
    form.append('meta', JSON.stringify(meta));
    return request<Garment>('/garments', {method: 'POST', body: form});
  },

  /** Hang something out of your own wardrobe: a photo, a category, a name. */
  saveOwnedGarment: (blob: Blob, meta: OwnedGarmentMeta) => {
    const form = new FormData();
    form.append('image', blob, 'owned.jpg');
    form.append('meta', JSON.stringify(meta));
    return request<Garment>('/garments/owned', {method: 'POST', body: form});
  },

  /**
   * Open a phone handoff. The returned URL goes in a QR code; the phone opens
   * it, takes the photo, and sends it back here.
   */
  createHandoff: (purpose: HandoffPurpose = 'garment') =>
    request<Handoff>('/handoff', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({purpose}),
    }),

  handoffStatus: (token: string) =>
    request<{status: HandoffStatus}>(`/handoff/${token}/status`),

  /**
   * Collect the photo the phone sent. Spends the token, so this is called once
   * and the bytes live in the panel from then on.
   */
  takeHandoffPhoto: async (token: string): Promise<File> => {
    const res = await fetch(`${apiBase}/handoff/${token}/photo`, await withAuth());
    if (!res.ok) {
      throw new HangerError(
        'not_found',
        "That photo isn't there any more. Send it from your phone again.",
      );
    }
    const blob = await res.blob();
    return new File([blob], 'phone.jpg', {
      type: blob.type || 'image/jpeg',
    });
  },

  /**
   * Read a shop link — pasted, or shared in from another app. Comes back for a
   * person to check before anything is kept: the category is a guess made out
   * of words in a title (§9.4), and it decides where a try-on fits.
   */
  readLink: (url: string) =>
    request<LinkPreview>('/links/read', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url}),
    }),

  /** The link, as confirmed. The server fetches the picture and hangs it. */
  hangLink: (preview: LinkPreview & {imageUrl: string}) =>
    request<Garment>('/links/hang', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        productUrl: preview.productUrl,
        imageUrl: preview.imageUrl,
        title: preview.title,
        brand: preview.brand,
        retailer: preview.retailer,
        price: preview.price,
        category: preview.category,
      }),
    }),

  /** "Hang it" — keep this garment in Your Hanger. */
  hangGarment: (id: string) =>
    request<Garment>(`/garments/${id}/hang`, {method: 'POST'}),

  deleteGarment: (id: string) =>
    request<void>(`/garments/${id}`, {method: 'DELETE'}),

  startTryOn: (garmentId: string, changeShoes = false) =>
    request<TryOnResult>('/tryon', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({garmentId, changeShoes}),
    }),

  getTryOn: (id: string) => request<TryOnResult>(`/tryon/${id}`),

  listTryOns: () => request<TryOnResult[]>('/tryon'),

  createOutfit: (items: {garmentId: string; slot: OutfitSlot}[], name?: string) =>
    request<{outfitId: string; status: string}>('/outfits', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({items, name}),
    }),

  getOutfit: (id: string) => request<Outfit>(`/outfits/${id}`),

  /** Start the share video. Poll getOutfit and watch `video` for the result. */
  createOutfitVideo: (id: string, pose?: VideoPose) =>
    request<Outfit>(`/outfits/${id}/video`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pose}),
    }),

  listOutfits: () => request<Outfit[]>('/outfits'),

  deleteOutfit: (id: string) =>
    request<void>(`/outfits/${id}`, {method: 'DELETE'}),

  alternatives: (garmentId: string, refresh = false) =>
    request<AlternativesResponse>(
      `/alternatives?garmentId=${encodeURIComponent(garmentId)}${
        refresh ? '&refresh=1' : ''
      }`,
    ),

  saveAlternative: (id: string) =>
    request<{garment: Garment; tryonId: string | null; note?: string}>(
      `/alternatives/${id}/save`,
      {method: 'POST'},
    ),

  /** Put a code on the laptop's screen. Only the laptop may ask. */
  createPairingCode: () => request<PairingCode>('/pair', {method: 'POST'}),

  /** What the laptop polls while the code is up. */
  pairingStatus: (code: string) =>
    request<PairingStatus>(`/pair/${encodeURIComponent(code)}/status`),

  /**
   * The phone spending the code. Returns the token it should keep and send on
   * everything afterwards — hand it to setAuthToken.
   */
  claimPairingCode: (code: string, name?: string) =>
    request<{token: string; device: Device}>('/pair/claim', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code, name}),
    }),

  /** "Who am I, and what have I got left?" — null device means the laptop. */
  whoAmI: () => request<WhoAmI>('/pair/me'),

  listDevices: () => request<Device[]>('/pair/devices'),

  removeDevice: (id: string) =>
    request<void>(`/pair/devices/${id}`, {method: 'DELETE'}),
};

export interface Device {
  id: string;
  /** Whose hanger this phone was let into. */
  userId: string;
  name: string;
  pairedAt: number;
  lastSeenAt: number | null;
}

export interface WhoAmI {
  local: boolean;
  device: Device | null;
  allowance: Allowance;
}

/**
 * What this person may still spend on real results. Past it, everything still
 * works — the results are samples, with the caption already drawn on them.
 */
export interface Allowance {
  unitsSpent: number;
  /** 0 means no personal limit on this server. */
  unitAllowance: number;
  onSamples: boolean;
}

export interface PairingCode {
  /** Six characters, read off the laptop and typed on the phone. */
  code: string;
  expiresAt: number;
  /** Null when this machine is on no network a phone could reach. */
  url: string | null;
  qrUrl: string | null;
  addresses: string[];
}

export type PairingStatus =
  | {status: 'waiting'}
  | {status: 'expired'}
  | {status: 'paired'; device: Device | null};

export interface SaveGarmentMeta {
  title: string;
  brand: string | null;
  retailer: string;
  productUrl: string;
  price: {amount: number; currency: string} | null;
  category: GarmentCategory;
  sourceImageUrl: string | null;
  /** Keep it in Your Hanger straight away, without a try-on first. */
  hang?: boolean;
}

export interface OwnedGarmentMeta {
  title: string;
  category: TryOnCategory;
}

export type HandoffPurpose = 'garment' | 'person';
export type HandoffStatus = 'waiting' | 'ready' | 'expired';

export interface Handoff {
  token: string;
  /** What the QR encodes — shown as text too, for a camera that won't scan. */
  url: string;
  qrUrl: string;
  expiresAt: number;
  /** Every address a phone might reach this computer on, best guess first. */
  addresses: string[];
}

export function mediaUrl(pathOrUrl: string): string {
  if (/^https?:/.test(pathOrUrl)) return pathOrUrl;
  return `${apiBase}${pathOrUrl}`;
}

export type {Alternative};
