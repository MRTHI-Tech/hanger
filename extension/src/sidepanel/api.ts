import type {
  Alternative,
  AlternativesResponse,
  Garment,
  GarmentCategory,
  Health,
  Outfit,
  OutfitSlot,
  Person,
  PersonUploadResult,
  TryOnResult,
} from '../shared/types';

export const API_BASE = 'http://localhost:8787';

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
    res = await fetch(`${API_BASE}${path}`, init);
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
};

export interface SaveGarmentMeta {
  title: string;
  brand: string | null;
  retailer: string;
  productUrl: string;
  price: {amount: number; currency: string} | null;
  category: GarmentCategory;
  sourceImageUrl: string | null;
}

export function mediaUrl(pathOrUrl: string): string {
  if (/^https?:/.test(pathOrUrl)) return pathOrUrl;
  return `${API_BASE}${pathOrUrl}`;
}

export type {Alternative};
