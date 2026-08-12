/**
 * Server-side types.
 *
 * The vocabulary and the wire shapes live in @hanger/shared, one copy for the
 * server, the extension and the phone. What's left here is the part no client
 * ever sees: the database rows, snake_case, straight out of SQLite.
 *
 * Re-exported so `./types.js` stays the one import the rest of the server
 * reaches for.
 */

export type {
  GarmentCategory,
  TryOnCategory,
  OutfitSlot,
  TaskStatus,
  Price,
  GarmentSource,
  VideoPose,
} from '@hanger/shared/types';

export {
  TRYONABLE,
  SLOT_ORDER,
  isTryOnable,
  DEFAULT_VIDEO_POSE,
  isVideoPose,
} from '@hanger/shared/types';

import type {GarmentCategory, GarmentSource} from '@hanger/shared/types';

export interface GarmentRow {
  id: string;
  title: string;
  brand: string | null;
  /** Null for an owned piece — it didn't come from a shop. */
  retailer: string | null;
  product_url: string | null;
  price_amount: number | null;
  price_currency: string | null;
  category: GarmentCategory;
  image_path: string;
  source_image_url: string | null;
  youcam_file_id: string | null;
  file_id_at: number | null;
  hung: number;
  source: GarmentSource;
  saved_at: number;
}

export interface PersonRow {
  id: string;
  photo_path: string;
  youcam_file_id: string | null;
  file_id_at: number | null;
  created_at: number;
}
