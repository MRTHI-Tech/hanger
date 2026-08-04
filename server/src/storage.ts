import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync} from 'node:fs';
import {resolve, extname, basename} from 'node:path';
import {env} from './env.js';

const root = resolve(process.cwd(), env.STORAGE_PATH);
mkdirSync(root, {recursive: true});

export function storagePathFor(name: string): string {
  return resolve(root, basename(name));
}

/**
 * Everything we generate or download lands here. §2.6: result URLs expire, so
 * we keep our own copy and only ever hand the extension a /media/ URL.
 */
export function save(bytes: Buffer, ext = '.jpg'): string {
  const name = `${randomUUID()}${ext}`;
  writeFileSync(storagePathFor(name), bytes);
  return name;
}

export function read(name: string): Buffer {
  return readFileSync(storagePathFor(name));
}

export function exists(name: string): boolean {
  return existsSync(storagePathFor(name));
}

export function remove(name: string): void {
  try {
    unlinkSync(storagePathFor(name));
  } catch {
    /* already gone */
  }
}

export function mediaUrl(name: string): string {
  return `/media/${name}`;
}

export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function extForContentType(contentType: string): string {
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('avif')) return '.avif';
  return '.jpg';
}

export function contentTypeForExt(name: string): string {
  switch (extname(name).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}
