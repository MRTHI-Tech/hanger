import {Hono} from 'hono';
import {z} from 'zod';
import qrcode from 'qrcode';
import {
  createHandoff,
  getHandoff,
  handoffUrl,
  lanAddresses,
  MAX_HANDOFF_BYTES,
  putHandoffPhoto,
  takeHandoffPhoto,
} from '../handoff.js';
import {CodedError} from '../youcam/errors.js';
import {phonePage} from './handoffPage.js';

export const handoffRoutes = new Hono();

const createSchema = z.object({
  purpose: z.enum(['garment', 'person']).default('garment'),
});

/** Open a session. The panel turns the returned URL into a QR code. */
handoffRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw new CodedError('invalid_request', 'meta did not match the expected shape');
  }

  const session = createHandoff(parsed.data.purpose);
  const url = handoffUrl(session.token);

  if (!url) {
    // No non-internal interface: the laptop is offline, or on nothing a phone
    // could join. Better to say so now than to draw a QR that goes nowhere.
    throw new CodedError('no_network');
  }

  console.log(`[hanger] handoff open (${parsed.data.purpose}) — ${url}`);

  return c.json({
    token: session.token,
    url,
    qrUrl: `/handoff/${session.token}/qr.svg`,
    expiresAt: session.expiresAt,
    addresses: lanAddresses(),
  });
});

/** The QR itself. Drawn here so the panel doesn't carry an encoder. */
handoffRoutes.get('/:token/qr.svg', async (c) => {
  const token = c.req.param('token');
  const session = getHandoff(token);
  if (!session) throw new CodedError('not_found');

  const url = handoffUrl(token);
  if (!url) throw new CodedError('not_found');

  const svg = await qrcode.toString(url, {
    type: 'svg',
    margin: 1,
    // The panel is 320–480px and the QR sits inside it. Medium correction
    // survives a phone camera at arm's length without inflating the modules.
    errorCorrectionLevel: 'M',
    color: {dark: '#1D1C11', light: '#FFFFFF'},
  });

  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'no-store',
  });
});

/** What the panel polls while it waits. */
handoffRoutes.get('/:token/status', (c) => {
  const session = getHandoff(c.req.param('token'));
  if (!session) return c.json({status: 'expired'});
  return c.json({status: session.photo ? 'ready' : 'waiting'});
});

/**
 * The panel collecting the photo. Spends the token: from here the bytes live
 * in the panel, and the QR on screen is inert.
 */
handoffRoutes.get('/:token/photo', (c) => {
  const photo = takeHandoffPhoto(c.req.param('token'));
  if (!photo) throw new CodedError('not_found');
  return c.body(photo.bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': photo.contentType,
    'Cache-Control': 'no-store',
  });
});

/** The phone sending it. Same origin as the page, so no CORS involved. */
handoffRoutes.post('/:token/photo', async (c) => {
  const token = c.req.param('token');
  if (!getHandoff(token)) {
    return c.json(
      {error: {code: 'expired', message: 'That code has expired. Start again on your laptop.'}},
      404,
    );
  }

  const form = await c.req.formData();
  const image = form.get('photo');
  if (!(image instanceof File)) {
    return c.json(
      {error: {code: 'invalid_request', message: 'No photo arrived. Try again.'}},
      400,
    );
  }
  if (image.size > MAX_HANDOFF_BYTES) {
    return c.json(
      {error: {code: 'too_large', message: 'That photo is too big to send.'}},
      413,
    );
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  const stored = putHandoffPhoto(token, {
    bytes,
    contentType: image.type || 'image/jpeg',
  });
  if (!stored) {
    return c.json(
      {error: {code: 'expired', message: 'That code has expired. Start again on your laptop.'}},
      404,
    );
  }

  console.log(`[hanger] handoff received ${(bytes.length / 1024).toFixed(0)}KB from a phone`);
  return c.json({ok: true});
});

/**
 * The page the QR opens. Served last so it doesn't shadow the routes above.
 */
handoffRoutes.get('/:token', (c) => {
  const token = c.req.param('token');
  const session = getHandoff(token);
  return c.html(phonePage({token, expired: !session}));
});
