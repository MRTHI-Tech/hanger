import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {db} from '../db.js';
import {validateImage} from '../images.js';
import {
  extForContentType,
  mediaUrl,
  read,
  remove,
  save,
} from '../storage.js';
import {CodedError} from '../youcam/errors.js';
import {currentUser} from '../auth.js';
import type {PersonRow} from '../types.js';

export const personRoutes = new Hono();

/**
 * The photo everything is tried on with — one per person, enforced by a unique
 * index rather than by the hardcoded id this used to keep.
 */
export function getPerson(userId: string): PersonRow | null {
  return (
    (db.prepare('SELECT * FROM person WHERE user_id = ?').get(userId) as
      | PersonRow
      | undefined) ?? null
  );
}

export function requirePerson(userId: string): PersonRow {
  const person = getPerson(userId);
  if (!person) throw new CodedError('no_person');
  return person;
}

export function personPhotoBytes(userId: string): Buffer {
  return read(requirePerson(userId).photo_path);
}

personRoutes.get('/', (c) => {
  const person = getPerson(currentUser(c).id);
  if (!person) {
    return c.json(
      {error: {code: 'not_found', message: 'No photo saved yet.'}},
      404,
    );
  }
  return c.json({
    id: person.id,
    photoUrl: mediaUrl(person.photo_path),
    createdAt: person.created_at,
  });
});

personRoutes.post('/photo', async (c) => {
  const user = currentUser(c);
  const form = await c.req.formData();
  const file = form.get('photo');
  if (!(file instanceof File)) {
    throw new CodedError('invalid_request', 'no photo in the request');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // §5.4: everything checkable gets checked here, before a single unit is spent.
  const {probe, warnings} = validateImage(bytes, 'person');

  const existing = getPerson(user.id);
  const path = save(bytes, extForContentType(file.type || 'image/jpeg'));

  if (existing) {
    // Replacing the photo invalidates every cached result built on the old
    // one. The cache is keyed on image bytes, so old entries simply stop
    // matching — but the stored file is now orphaned, so clean it up.
    db.prepare(
      'UPDATE person SET photo_path = ?, youcam_file_id = NULL, file_id_at = NULL WHERE id = ?',
    ).run(path, existing.id);
    remove(existing.photo_path);
  } else {
    db.prepare(
      'INSERT INTO person (id, user_id, photo_path, created_at) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), user.id, path, Date.now());
  }

  console.log(
    `[hanger] person photo saved: ${probe.width}×${probe.height} ${probe.format}, ${Math.round(
      probe.bytes / 1024,
    )}KB`,
  );

  return c.json({
    personId: requirePerson(user.id).id,
    photoUrl: mediaUrl(path),
    warnings,
  });
});

personRoutes.delete('/', (c) => {
  const person = getPerson(currentUser(c).id);
  if (person) {
    db.prepare('DELETE FROM person WHERE id = ?').run(person.id);
    remove(person.photo_path);
  }
  return c.body(null, 204);
});
