/**
 * Types shared between the extension and the server.
 * Mirrored at server/src/types.ts — keep the two in sync.
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

export function isTryOnable(c: GarmentCategory): c is TryOnCategory {
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
 * The optional share video built from a finished outfit. Separate from the
 * outfit's own status — a video that failed says nothing about the outfit.
 */
export interface OutfitVideo {
  status: 'idle' | TaskStatus;
  url?: string;
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

export interface ApiError {
  error: {code: string; message: string; hint?: string};
}
