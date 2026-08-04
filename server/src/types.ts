/**
 * Types shared with the extension.
 * Mirrored at extension/src/shared/types.ts — keep the two in sync.
 */

export type GarmentCategory =
  | 'upper_body'
  | 'lower_body'
  | 'full_body'
  | 'shoes'
  | 'bag'
  | 'hat'
  | 'scarf';

export type TryOnCategory = 'upper_body' | 'lower_body' | 'full_body' | 'shoes';

export const TRYONABLE: TryOnCategory[] = [
  'upper_body',
  'lower_body',
  'full_body',
  'shoes',
];

export function isTryOnable(c: string): c is TryOnCategory {
  return (TRYONABLE as string[]).includes(c);
}

export type OutfitSlot = 'top' | 'outer' | 'bottom' | 'shoes';

/** Chain order (§8.1): top, then any outer layer, then bottom, then shoes. */
export const SLOT_ORDER: OutfitSlot[] = ['top', 'outer', 'bottom', 'shoes'];

export type TaskStatus = 'pending' | 'running' | 'success' | 'error';

export interface Price {
  amount: number;
  currency: string;
}

export interface GarmentRow {
  id: string;
  title: string;
  brand: string | null;
  retailer: string;
  product_url: string;
  price_amount: number | null;
  price_currency: string | null;
  category: GarmentCategory;
  image_path: string;
  source_image_url: string | null;
  youcam_file_id: string | null;
  file_id_at: number | null;
  saved_at: number;
}

export interface PersonRow {
  id: string;
  photo_path: string;
  youcam_file_id: string | null;
  file_id_at: number | null;
  created_at: number;
}
