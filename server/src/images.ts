import {CodedError} from './youcam/errors.js';

/**
 * Image inspection and the §5.4 input rules.
 *
 * We read dimensions straight out of the file header rather than pulling in a
 * decoder: every format we accept states its size in the first few bytes, and
 * validating before a call is the whole point (§5.4 — reject *before* spending
 * a unit on a call that will fail).
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'svg' | 'unknown';

export interface Probe {
  format: ImageFormat;
  width: number;
  height: number;
  bytes: number;
}

export function probeImage(buf: Buffer): Probe {
  const base = {bytes: buf.byteLength};

  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) {
    // PNG: IHDR is always the first chunk.
    return {
      ...base,
      format: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    return {...base, format: 'jpeg', ...jpegSize(buf)};
  }

  if (
    buf.length > 30 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return {...base, format: 'webp', ...webpSize(buf)};
  }

  const head = buf.subarray(0, 2048).toString('utf8');
  if (head.includes('<svg')) {
    return {...base, format: 'svg', ...svgSize(head)};
  }

  return {...base, format: 'unknown', width: 0, height: 0};
}

function jpegSize(buf: Buffer): {width: number; height: number} {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0-SOF15, excluding the non-frame markers in that range.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7)};
    }
    const length = buf.readUInt16BE(i + 2);
    if (length < 2) break;
    i += 2 + length;
  }
  return {width: 0, height: 0};
}

function webpSize(buf: Buffer): {width: number; height: number} {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return {width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1};
  }
  if (chunk === 'VP8X') {
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return {width: w + 1, height: h + 1};
  }
  return {width: 0, height: 0};
}

function svgSize(head: string): {width: number; height: number} {
  const w = head.match(/\bwidth="(\d+(?:\.\d+)?)/);
  const h = head.match(/\bheight="(\d+(?:\.\d+)?)/);
  if (w && h) return {width: Math.round(+w[1]), height: Math.round(+h[1])};
  const vb = head.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/);
  if (vb) return {width: Math.round(+vb[1]), height: Math.round(+vb[2])};
  return {width: 0, height: 0};
}

export const MAX_BYTES = 10 * 1024 * 1024;
export const MIN_WIDTH = 512;
export const MIN_HEIGHT = 384;
export const MAX_SIDE = 4096;

export interface ValidationOutcome {
  probe: Probe;
  warnings: string[];
}

/**
 * The hard rules from §5.4. Anything we can prove is wrong throws a §13 code;
 * anything that merely looks risky comes back as a warning the UI can show
 * without blocking the person.
 */
export function validateImage(
  buf: Buffer,
  kind: 'person' | 'garment',
): ValidationOutcome {
  const probe = probeImage(buf);
  const warnings: string[] = [];

  if (probe.bytes > MAX_BYTES) throw new CodedError('exceed_max_filesize');

  if (probe.format === 'unknown') {
    throw new CodedError('image_unreadable');
  }

  // SVG has no pixel grid to check; it's only ever our own sample data.
  if (probe.format !== 'svg') {
    if (!probe.width || !probe.height) {
      throw new CodedError('image_unreadable');
    }
    if (probe.width < MIN_WIDTH || probe.height < MIN_HEIGHT) {
      throw new CodedError('error_below_min_image_size');
    }
    if (Math.max(probe.width, probe.height) > MAX_SIDE) {
      throw new CodedError('image_too_large');
    }
  }

  if (kind === 'person') {
    const ratio = probe.width / (probe.height || 1);
    // A full-body shot is portrait. A wide or square frame is usually a crop
    // that stops at the waist, which is exactly what error_invalid_src is.
    if (probe.format !== 'svg' && ratio > 0.9) {
      warnings.push(
        'This looks cropped or wide. A head-to-toe photo works best, especially for trousers and shoes.',
      );
    }
    if (probe.format !== 'svg' && probe.height < 768) {
      warnings.push('A larger photo will give a sharper result.');
    }
  }

  return {probe, warnings};
}
