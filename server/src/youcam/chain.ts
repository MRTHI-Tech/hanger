import {db} from '../db.js';
import {
  chainCacheKey,
  fileIdIsFresh,
  getChainStep,
  logCacheHit,
  putChainStep,
  setChainStepFileId,
} from '../cache.js';
import {contentTypeForExt, hashBytes, read} from '../storage.js';
import {runCloth, uploadImage} from './engine.js';
import {CodedError} from './errors.js';
import {garmentFileId, personFileId} from './tryon.js';
import type {
  GarmentRow,
  OutfitSlot,
  PersonRow,
  TryOnCategory,
} from '../types.js';

/**
 * The chain engine (§8).
 *
 * cloth-v3 fits one garment at a time, so an outfit is built by feeding each
 * result back in as the next source. Three rules matter more than the rest:
 *
 *  - Always start from the original photo. Every pass re-encodes the whole
 *    image and the face drifts; editing a finished composite compounds that.
 *  - Cache on the prefix, not the outfit. `[base + top]` is the same image
 *    whether trousers get added later or not, so changing only the shoes costs
 *    one call rather than three (§8.3).
 *  - Fail soft. If step 2 fails, step 1's result is still a real answer and
 *    the person still sees it (§8.5).
 */

export interface ChainItem {
  garment: GarmentRow;
  slot: OutfitSlot;
  category: TryOnCategory;
  /** An outer layer is an upper_body pass applied after the top (§8.1). */
  outerPass: boolean;
  changeShoes: boolean;
}

export interface ChainProgress {
  step: number;
  of: number;
  label: string;
}

export interface ChainOutcome {
  resultPath: string | null;
  /** Items that failed and were left out of the finished image. */
  skipped: {slot: OutfitSlot; code: string}[];
  /** Set when nothing at all could be produced. */
  errorCode?: string;
}

/** "Fitting the trousers…" reads better than "step 2 of 3". */
const SLOT_VERBS: Record<OutfitSlot, string> = {
  top: 'Fitting the top',
  outer: 'Adding the layer on top',
  bottom: 'Fitting the bottom',
  shoes: 'Putting the shoes on',
};

export async function runChain(
  person: PersonRow,
  items: ChainItem[],
  onProgress: (progress: ChainProgress) => void,
): Promise<ChainOutcome> {
  if (items.length === 0) {
    return {resultPath: null, skipped: [], errorCode: 'invalid_request'};
  }

  const baseBytes = read(person.photo_path);
  const prefix: {garmentHash: string; category: TryOnCategory; changeShoes: boolean}[] =
    [];

  // §8.2: the chain always starts from the original photo.
  let currentPath: string | null = null;
  let currentFileId: string | null = null;
  const skipped: ChainOutcome['skipped'] = [];

  for (const [index, item] of items.entries()) {
    const garmentBytes = read(item.garment.image_path);
    prefix.push({
      garmentHash: hashBytes(garmentBytes),
      category: item.category,
      changeShoes: item.changeShoes,
    });
    const key = chainCacheKey(baseBytes, prefix);

    onProgress({
      step: index + 1,
      of: items.length,
      label: `${SLOT_VERBS[item.slot]}…`,
    });

    const cachedStep = getChainStep(key);
    if (cachedStep) {
      logCacheHit('chain', key);
      currentPath = cachedStep.resultPath;
      currentFileId =
        cachedStep.youcamFileId && fileIdIsFresh(cachedStep.fileIdAt)
          ? cachedStep.youcamFileId
          : null;
      continue;
    }

    try {
      // §8.4: each intermediate result is uploaded and passed forward as a
      // file id — never as a signed URL, which expires.
      const srcFileId =
        currentFileId ??
        (currentPath
          ? await uploadStep(key, currentPath)
          : await personFileId(person));

      const refFileId = await garmentFileId(item.garment);

      const {resultPath} = await runCloth({
        srcFileId,
        refFileId,
        category: item.category,
        changeShoes: item.changeShoes,
        refLabel: item.garment.title,
        outerPass: item.outerPass,
      });

      putChainStep(key, resultPath);
      currentPath = resultPath;
      currentFileId = null;
    } catch (error) {
      const code = error instanceof CodedError ? error.code : 'upstream_error';
      console.warn(
        `[hanger] chain step ${index + 1}/${items.length} failed (${code}): ${
          item.garment.title
        }`,
      );
      skipped.push({slot: item.slot, code});
      // Drop this garment from the prefix so later steps keep a truthful key.
      prefix.pop();

      if (skipped.length === items.length) {
        return {resultPath: null, skipped, errorCode: code};
      }
    }
  }

  return {resultPath: currentPath, skipped};
}

/** Uploads an intermediate result and remembers its file id for reuse. */
async function uploadStep(cacheKey: string, path: string): Promise<string> {
  const bytes = read(path);
  const fileId = await uploadImage(bytes, contentTypeForExt(path), 'step.jpg');
  setChainStepFileId(cacheKey, fileId);
  return fileId;
}

/**
 * §8.1 — fixed slot order, and a full_body garment takes the whole chain.
 * Returns the items to run plus anything the UI should explain away.
 */
export function planChain(
  entries: {garment: GarmentRow; slot: OutfitSlot; changeShoes?: boolean}[],
): {items: ChainItem[]; ignored: OutfitSlot[]} {
  const order: OutfitSlot[] = ['top', 'outer', 'bottom', 'shoes'];
  const sorted = [...entries].sort(
    (a, b) => order.indexOf(a.slot) - order.indexOf(b.slot),
  );

  const fullBody = sorted.find(
    (entry) => entry.garment.category === 'full_body',
  );

  if (fullBody) {
    // A dress or a jumpsuit covers the whole body: top and bottom are moot.
    const ignored = sorted
      .filter(
        (entry) =>
          entry !== fullBody && (entry.slot === 'top' || entry.slot === 'bottom'),
      )
      .map((entry) => entry.slot);

    const items: ChainItem[] = [
      {
        garment: fullBody.garment,
        slot: fullBody.slot,
        category: 'full_body',
        outerPass: false,
        changeShoes: Boolean(fullBody.changeShoes),
      },
    ];
    for (const entry of sorted) {
      if (entry === fullBody) continue;
      if (entry.slot === 'shoes') {
        items.push({
          garment: entry.garment,
          slot: 'shoes',
          category: 'shoes',
          outerPass: false,
          changeShoes: false,
        });
      } else if (entry.slot === 'outer') {
        items.push({
          garment: entry.garment,
          slot: 'outer',
          category: 'upper_body',
          outerPass: true,
          changeShoes: false,
        });
      }
    }
    return {items, ignored};
  }

  const items: ChainItem[] = sorted.map((entry) => ({
    garment: entry.garment,
    slot: entry.slot,
    category: categoryForSlot(entry.slot),
    outerPass: entry.slot === 'outer',
    changeShoes: Boolean(entry.changeShoes),
  }));

  return {items, ignored: []};
}

function categoryForSlot(slot: OutfitSlot): TryOnCategory {
  switch (slot) {
    case 'bottom':
      return 'lower_body';
    case 'shoes':
      return 'shoes';
    default:
      return 'upper_body';
  }
}

/** Handy for tests and for the log line when a chain finishes. */
export function describeChain(items: ChainItem[]): string {
  return items.map((i) => `${i.slot}:${i.garment.title}`).join(' → ');
}

export function outfitTotal(items: {garment: GarmentRow}[]): {
  amount: number;
  currency: string;
} | null {
  const priced = items.filter((i) => i.garment.price_amount != null);
  if (priced.length === 0) return null;
  const currency = priced[0].garment.price_currency ?? 'GBP';
  // Mixing currencies would be a lie; only total what shares one.
  const sameCurrency = priced.filter(
    (i) => (i.garment.price_currency ?? 'GBP') === currency,
  );
  const amount = sameCurrency.reduce(
    (sum, i) => sum + (i.garment.price_amount ?? 0),
    0,
  );
  return {amount: Math.round(amount * 100) / 100, currency};
}

export {db};
