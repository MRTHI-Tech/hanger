/**
 * The wire contract: what the server sends, and the vocabulary both ends speak.
 *
 * One copy, imported by the server, the extension and the phone. The server
 * layers its own private row types on top in server/src/types.ts — those
 * describe the database, not the wire, and stay there.
 */

/** Categories we can store. Only the first four are try-on-able via cloth-v3. */
export type GarmentCategory =
  | 'upper_body'
  | 'lower_body'
  | 'full_body'
  | 'shoes'
  | 'bag'
  | 'hat'
  | 'scarf';

/** Categories cloth-v3 accepts as `garment_category`. */
export type TryOnCategory = 'upper_body' | 'lower_body' | 'full_body' | 'shoes';

export const TRYONABLE: TryOnCategory[] = [
  'upper_body',
  'lower_body',
  'full_body',
  'shoes',
];

/** Takes a plain string: the server checks values straight off a request. */
export function isTryOnable(c: string): c is TryOnCategory {
  return (TRYONABLE as string[]).includes(c);
}

export const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  upper_body: 'Top',
  lower_body: 'Bottom',
  full_body: 'Full body',
  shoes: 'Shoes',
  bag: 'Bag',
  hat: 'Hat',
  scarf: 'Scarf',
};

/** Outfit canvas slots, in chain order. */
export type OutfitSlot = 'top' | 'outer' | 'bottom' | 'shoes';

/** Chain order (§8.1): top, then any outer layer, then bottom, then shoes. */
export const SLOT_ORDER: OutfitSlot[] = ['top', 'outer', 'bottom', 'shoes'];

export const SLOT_LABELS: Record<OutfitSlot, string> = {
  top: 'Top',
  outer: 'Layer',
  bottom: 'Bottom',
  shoes: 'Shoes',
};

/** Which categories may occupy which slot. */
export const SLOT_CATEGORIES: Record<OutfitSlot, GarmentCategory[]> = {
  top: ['upper_body', 'full_body'],
  outer: ['upper_body'],
  bottom: ['lower_body'],
  shoes: ['shoes'],
};

export type TaskStatus = 'pending' | 'running' | 'success' | 'error';

export interface Health {
  ok: boolean;
  mockMode: boolean;
  unitsSpent: number;
  unitBudget: number;
  budgetExhausted: boolean;
}

export interface Person {
  id: string;
  photoUrl: string;
  createdAt: number;
}

export interface PersonUploadResult {
  personId: string;
  photoUrl: string;
  warnings: string[];
}

/** Where a garment came from: a shop's product page, or your own wardrobe. */
export type GarmentSource = 'shop' | 'owned';

/** Categories you can photograph off your own floor — the try-on-able four. */
export const OWNABLE: TryOnCategory[] = TRYONABLE;

export interface Garment {
  id: string;
  title: string;
  brand: string | null;
  /** Null for a piece you already own — it didn't come from a shop. */
  retailer: string | null;
  productUrl: string | null;
  price: Price | null;
  category: GarmentCategory;
  imageUrl: string;
  sourceImageUrl: string | null;
  /** True once the person chose to keep it in Your Hanger. */
  hung: boolean;
  source: GarmentSource;
  savedAt: number;
}

/** Reads better than `g.source === 'owned'` at every call site. */
export function isOwned(garment: Garment): boolean {
  return garment.source === 'owned';
}

export interface Price {
  amount: number;
  currency: string;
}

export interface TryOnResult {
  id: string;
  status: TaskStatus;
  resultUrl?: string;
  baseUrl?: string;
  garmentId: string;
  errorCode?: string;
  message?: string;
  hint?: string;
  cached?: boolean;
}

export interface OutfitProgress {
  step: number;
  of: number;
  label: string;
}

export interface OutfitItem {
  garment: Garment;
  slot: OutfitSlot;
  position: number;
  /** Set when this step failed but earlier steps succeeded (fail-soft, §8.5). */
  skipped?: boolean;
}

/**
 * How the person moves in the share video.
 *
 * Image-to-video animates outward from the still it's given, so these are
 * motions a standing figure can plausibly start: nothing here asks for a pose
 * the source photo isn't already close to.
 */
export type VideoPose = 'lookbook' | 'turn' | 'walk' | 'pose';

export const VIDEO_POSES: {
  value: VideoPose;
  label: string;
  /** Shown under the picker — what you'll actually get. */
  description: string;
}[] = [
  {
    value: 'lookbook',
    label: 'Lookbook',
    description: 'Stands still, turns slightly. The safe one.',
  },
  {value: 'turn', label: 'Turn around', description: 'Turns to show the back.'},
  {value: 'walk', label: 'Catwalk', description: 'Walks towards the camera.'},
  {value: 'pose', label: 'Pose', description: 'Hand on hip, shifts their weight.'},
];

export const DEFAULT_VIDEO_POSE: VideoPose = 'lookbook';

/** Takes a plain string: the server checks values straight off a request. */
export function isVideoPose(v: string): v is VideoPose {
  return VIDEO_POSES.some((p) => p.value === v);
}

export function videoPoseLabel(pose: VideoPose): string {
  return VIDEO_POSES.find((p) => p.value === pose)?.label ?? 'Lookbook';
}

/**
 * The optional share video built from a finished outfit. Separate from the
 * outfit's own status — a video that failed says nothing about the outfit.
 */
export interface OutfitVideo {
  status: 'idle' | TaskStatus;
  url?: string;
  /** Which motion this one was rendered with, so the panel can say so. */
  pose?: VideoPose;
  /** 'unknown' when the service failed in a way we don't have copy for. */
  code?: string;
  message?: string;
  hint?: string;
}

export interface Outfit {
  id: string;
  name: string | null;
  status: TaskStatus;
  resultUrl?: string;
  baseUrl?: string;
  progress: OutfitProgress;
  items: OutfitItem[];
  total: Price | null;
  errorCode?: string;
  message?: string;
  hint?: string;
  /** Human note when we fell back to a partial result. */
  partialNote?: string;
  video?: OutfitVideo;
  createdAt: number;
}

export interface Alternative {
  id: string;
  garmentId: string;
  title: string;
  source: string;
  link: string;
  thumbnailUrl: string | null;
  price: Price | null;
  savingsVsOriginal: number | null;
  /** False when both prices exist but sit in different currencies (§10.1). */
  priceComparable: boolean;
  /** Null when the search result didn't say. */
  inStock: boolean | null;
  fetchedAt: number;
}

export interface AlternativesResponse {
  items: Alternative[];
  original: {garmentId: string; price: Price | null};
  fromCache: boolean;
  /** True when Lens gave nothing and we fell back to a text search (§10.3). */
  usedTextFallback: boolean;
  note?: string;
}

/** A candidate product image found on the page, with its ranking score (§9.3). */
export interface ScoredImage {
  url: string;
  score: number;
  width: number;
  height: number;
  alt: string;
  onModel: boolean;
  reasons: string[];
}

/** What the content script hands to the side panel. */
export interface ScrapedProduct {
  title: string;
  brand: string | null;
  /** Null when this isn't from a shop at all — a piece you already own. */
  retailer: string | null;
  productUrl: string | null;
  price: Price | null;
  category: GarmentCategory;
  /**
   * Set when this stands for a garment that's already in Your Hanger, rather
   * than something just scraped off a page. The try-on reuses that row instead
   * of storing a second copy — and for an owned piece there's no retailer or
   * product URL to store a copy with.
   */
  existingGarmentId?: string;
  images: ScoredImage[];
  /** Index into images of the best candidate. */
  suggestedIndex: number;
  /** Set when the category needs an on-model shot and we didn't find one (§9.3). */
  lowerBodyWarning: boolean;
}

/**
 * What the server could read off a product page it was only handed a link to.
 *
 * The thinner cousin of `ScrapedProduct`, and thinner on purpose: the content
 * script has a rendered page, so it can measure every image and rank them on
 * model (§9.3). The server has markup and no browser, so it takes the picture
 * the shop nominated for sharing and offers nothing it cannot stand behind.
 */
export interface LinkPreview {
  title: string;
  brand: string | null;
  retailer: string;
  /** Where the link landed after redirects — the address that was actually read. */
  productUrl: string;
  price: Price | null;
  /** A guess (§9.4). Always shown as editable; never applied silently. */
  category: GarmentCategory;
  /** The shop's own picture of it. Null when the page had none we could use. */
  imageUrl: string | null;
  /**
   * False when the page had none of the §9.1 marks of a product page — a
   * homepage, a category listing, an article. Worth saying out loud rather
   * than refusing: shops publish stranger markup than any rule allows for.
   */
  looksLikeProduct: boolean;
}

export interface ApiError {
  error: {code: string; message: string; hint?: string};
}
