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
import type {PersonRow} from '../types.js';

export const personRoutes = new Hono();

/** Single local user — no accounts, no auth (§17). */
export const PERSON_ID = 'default';

export function getPerson(): PersonRow | null {
  return (
    (db.prepare('SELECT * FROM person WHERE id = ?').get(PERSON_ID) as
      | PersonRow
      | undefined) ?? null
  );
}

export function requirePerson(): PersonRow {
  const person = getPerson();
  if (!person) throw new CodedError('no_person');
  return person;
}

export function personPhotoBytes(): Buffer {
  return read(requirePerson().photo_path);
}

personRoutes.get('/', (c) => {
  const person = getPerson();
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
  const form = await c.req.formData();
  const file = form.get('photo');
  if (!(file instanceof File)) {
    throw new CodedError('invalid_request', 'no photo in the request');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // §5.4: everything checkable gets checked here, before a single unit is spent.
  const {probe, warnings} = validateImage(bytes, 'person');

  const existing = getPerson();
  const path = save(bytes, extForContentType(file.type || 'image/jpeg'));

  if (existing) {
    // Replacing the photo invalidates every cached result built on the old
    // one. The cache is keyed on image bytes, so old entries simply stop
    // matching — but the stored file is now orphaned, so clean it up.
    db.prepare(
      'UPDATE person SET photo_path = ?, youcam_file_id = NULL, file_id_at = NULL WHERE id = ?',
    ).run(path, PERSON_ID);
    remove(existing.photo_path);
  } else {
    db.prepare(
      'INSERT INTO person (id, photo_path, created_at) VALUES (?, ?, ?)',
    ).run(PERSON_ID, path, Date.now());
  }

  console.log(
    `[hanger] person photo saved: ${probe.width}×${probe.height} ${probe.format}, ${Math.round(
      probe.bytes / 1024,
    )}KB`,
  );

  return c.json({
    personId: PERSON_ID,
    photoUrl: mediaUrl(path),
    warnings,
  });
});

personRoutes.delete('/', (c) => {
  const person = getPerson();
  if (person) {
    db.prepare('DELETE FROM person WHERE id = ?').run(PERSON_ID);
    remove(person.photo_path);
  }
  return c.body(null, 204);
});
