import type {ContentfulStatusCode} from 'hono/utils/http-status';

/**
 * §13. Every code maps to a sentence a shopper would understand, plus a next
 * action. A raw code must never reach the UI.
 */
export interface HumanError {
  code: string;
  message: string;
  hint?: string;
  status: ContentfulStatusCode;
}

const MAP: Record<string, {message: string; hint?: string; status?: ContentfulStatusCode}> = {
  error_pose: {
    message:
      "We couldn't work out your pose. Try a photo standing up and facing the camera.",
    hint: 'Replace your photo',
  },
  error_invalid_src: {
    message: "We need a full-body photo for this — yours is cropped too tight.",
    hint: 'Replace your photo',
  },
  error_invalid_ref: {
    message: "This product photo isn't clear enough. Try picking a different image.",
    hint: 'Pick another photo',
  },
  error_apply_region_mismatch: {
    message:
      "This garment doesn't match the area we're fitting. Check the category is right.",
    hint: 'Change the category',
  },
  error_editing_failed: {
    message:
      'The result came out too close to your original photo. Try a different product image.',
    hint: 'Pick another photo',
  },
  error_download_image: {
    // Should be unreachable — if this fires, §2.2 was violated somewhere.
    message: "We couldn't load that product image.",
    hint: 'Pick another photo',
  },
  error_nsfw_content_detected: {
    message: "We couldn't generate this one. Try a different photo.",
    hint: 'Pick another photo',
  },
  exceed_max_filesize: {
    message: 'That image is too large — keep it under 10MB.',
    hint: 'Pick another photo',
    status: 400,
  },
  error_below_min_image_size: {
    message: 'That image is too small. We need at least 512×384.',
    hint: 'Pick another photo',
    status: 400,
  },
  image_too_large: {
    message: "That image is bigger than we can use — keep the longest side under 4096 pixels.",
    hint: 'Pick another photo',
    status: 400,
  },
  error_no_face: {
    message: "We couldn't find a face in your photo.",
    hint: 'Replace your photo',
    status: 400,
  },
  CreditInsufficiency: {
    message: "We're out of API credits for this demo.",
    // "Try again" would be wrong advice here — nothing changes until the
    // account has credit, so point at the thing that does still work.
    hint: 'Switch to sample data',
    status: 402,
  },
  InvalidTaskId: {
    message: "That result expired. Let's run it again.",
    hint: 'Try again',
  },
  rate_limited: {
    message: 'Too many requests right now — try again in a moment.',
    hint: 'Try again',
    status: 429,
  },
  budget_exhausted: {
    message:
      "We've hit the spending cap set for this demo, so nothing new can be generated.",
    hint: 'Raise UNIT_BUDGET in server/.env to keep going',
    status: 402,
  },
  timeout: {
    message: 'That took longer than expected and we stopped waiting.',
    hint: 'Try again',
    status: 504,
  },
  no_person: {
    message: 'Add a photo of yourself first, then you can try things on.',
    hint: 'Add your photo',
    status: 400,
  },
  not_found: {
    message: "We couldn't find that — it may have been removed.",
    hint: 'Go back to Your Hanger',
    status: 404,
  },
  invalid_request: {
    message: "That request didn't look right.",
    hint: 'Try again',
    status: 400,
  },
  category_not_tryonable: {
    message:
      "We can't fit that kind of item onto a photo yet — it stays in Your Hanger.",
    hint: 'Pick a top, bottom, full-body piece or shoes',
    status: 400,
  },
  serpapi_unavailable: {
    message:
      "We couldn't search for alternatives just now. The search service didn't answer.",
    hint: 'Try again',
    status: 502,
  },
  serpapi_key_missing: {
    message:
      'Finding alternatives needs a SerpApi key. Add SERPAPI_KEY to server/.env, or use sample data.',
    hint: 'Add a key',
    status: 400,
  },
  alternative_image_unusable: {
    message:
      "That listing's photo is too small to try on. Open the product page to try it there.",
    hint: 'Open the product page',
    status: 422,
  },
  image_unreadable: {
    message: "We couldn't read that image file. Try a JPG or PNG.",
    hint: 'Pick another photo',
    status: 400,
  },
  no_network: {
    // Handing a photo over from a phone needs an address the phone can reach.
    // On a laptop with no network there is nothing to draw a QR code for.
    message:
      "This computer isn't on a network your phone could reach, so it can't take a photo for you.",
    hint: 'Choose a photo instead',
    status: 503,
  },
  invalid_parameter: {
    // Always our bug, never the shopper's — the request was malformed. They
    // get a plain sentence; the server log carries the `error_message` that
    // names the offending field.
    message: "We couldn't send that off correctly. It's not something you did.",
    hint: 'Try again',
  },
  upstream_error: {
    message: "The try-on service had a problem. Let's try that again.",
    hint: 'Try again',
    status: 502,
  },
};

const FALLBACK = {
  message: "Something went wrong on our side. Let's try that again.",
  hint: 'Try again',
  status: 500 as ContentfulStatusCode,
};

/** An error already carrying a §13 code. */
export class CodedError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function humanize(code: string | undefined): HumanError {
  const entry = (code && MAP[code]) || FALLBACK;
  return {
    code: code ?? 'unknown',
    message: entry.message,
    hint: 'hint' in entry ? entry.hint : undefined,
    // A known code without an explicit status is a task that ran and couldn't
    // produce a usable result — 422, not a bad gateway.
    status: entry.status ?? 422,
  };
}

/** Does this code describe something the user can fix by retrying as-is? */
export function isRetryable(code: string | undefined): boolean {
  return code === 'rate_limited' || code === 'InvalidTaskId' || code === 'timeout';
}

export function toHttpError(err: unknown): {
  status: ContentfulStatusCode;
  body: {error: {code: string; message: string; hint?: string}};
} {
  const code =
    err instanceof CodedError
      ? err.code
      : typeof (err as {code?: unknown})?.code === 'string'
        ? ((err as {code: string}).code)
        : undefined;
  const human = humanize(code);
  return {
    status: human.status,
    body: {error: {code: human.code, message: human.message, hint: human.hint}},
  };
}

export const ERROR_CODES = Object.keys(MAP);
