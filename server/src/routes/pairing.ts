import {Hono} from 'hono';
import {z} from 'zod';
import qrcode from 'qrcode';
import {env} from '../env.js';
import {lanAddresses} from '../handoff.js';
import {
  claimPairingCode,
  createPairingCode,
  getPairingCode,
  listDevices,
  removeDevice,
} from '../pairing.js';
import {callerDevice, currentUser, isLocalRequest, requireLocal} from '../auth.js';
import {allowanceSnapshot} from '../budget.js';
import {CodedError} from '../youcam/errors.js';

export const pairingRoutes = new Hono();

/**
 * Where the phone app answers. Only needed for the QR code — a phone that
 * already has the app open types the code instead and never touches this.
 *
 * Set PWA_ORIGIN when the app isn't on this machine's LAN address at the dev
 * port: a deployed build, a tunnel, a different port.
 */
const PWA_DEV_PORT = 5174;

function pwaOrigin(): string | null {
  if (env.PWA_ORIGIN) return env.PWA_ORIGIN.replace(/\/+$/, '');
  const host = lanAddresses()[0];
  return host ? `http://${host}:${PWA_DEV_PORT}` : null;
}

/** What the QR encodes: the app, already carrying the code. */
function pairUrl(code: string): string | null {
  const origin = pwaOrigin();
  return origin ? `${origin}/?pair=${encodeURIComponent(code)}` : null;
}

/** The laptop putting a code on screen. */
pairingRoutes.post('/', requireLocal, (c) => {
  const entry = createPairingCode(currentUser(c).id);
  const url = pairUrl(entry.code);

  console.log(`[hanger] pairing code ${entry.code} — ${url ?? 'no QR (offline)'}`);

  return c.json({
    code: entry.code,
    expiresAt: entry.expiresAt,
    // Null when this machine is on no network a phone could join. The code
    // still works if the phone can reach us some other way, so this is a
    // missing convenience rather than a failure.
    url,
    qrUrl: url ? `/pair/${entry.code}/qr.svg` : null,
    addresses: lanAddresses(),
  });
});

/** The QR itself. Drawn here so the panel doesn't carry an encoder. */
pairingRoutes.get('/:code/qr.svg', requireLocal, async (c) => {
  const code = c.req.param('code');
  if (!getPairingCode(code)) throw new CodedError('pairing_code_expired');

  const url = pairUrl(code);
  if (!url) throw new CodedError('no_network');

  const svg = await qrcode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {dark: '#1D1C11', light: '#FFFFFF'},
  });

  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'no-store',
  });
});

/** What the panel polls while the code is on screen. */
pairingRoutes.get('/:code/status', requireLocal, (c) => {
  const entry = getPairingCode(c.req.param('code'));
  if (!entry) return c.json({status: 'expired' as const});
  if (!entry.claimedBy) return c.json({status: 'waiting' as const});

  const device = listDevices(entry.userId).find((d) => d.id === entry.claimedBy);
  return c.json({status: 'paired' as const, device: device ?? null});
});

const claimSchema = z.object({
  code: z.string().min(1),
  /** What to call this device in the panel's list. */
  name: z.string().max(60).optional(),
});

/**
 * The phone spending the code. The one route here a stranger may call — it has
 * to be, since a phone with no token is exactly what's pairing.
 */
pairingRoutes.post('/claim', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) throw new CodedError('invalid_request');

  const result = claimPairingCode(parsed.data.code, parsed.data.name ?? 'A phone');
  if (!result.ok) {
    if (result.reason === 'already_used') throw new CodedError('pairing_code_used');
    if (result.reason === 'wrong') throw new CodedError('pairing_code_wrong');
    throw new CodedError('pairing_code_expired');
  }

  console.log(`[hanger] paired "${result.device.name}"`);
  return c.json({token: result.token, device: result.device});
});

/**
 * "Who am I, and what have I got left?"
 *
 * The phone's first call on every launch. It answers the pairing question —
 * and notices a token revoked from the laptop while the phone was away — and
 * carries the person's remaining allowance, because the app has to be able to
 * say "these are samples now" before somebody wonders why their try-on came
 * back with a watermark.
 */
pairingRoutes.get('/me', (c) => {
  const device = callerDevice(c);
  const user = currentUser(c);
  return c.json({
    local: device === null,
    device,
    allowance: allowanceSnapshot(user.id),
  });
});

/** The panel's list of what has been let in. */
pairingRoutes.get('/devices', requireLocal, (c) =>
  c.json(listDevices(currentUser(c).id)),
);

/**
 * Revoking. The laptop may remove anything; a phone may remove only itself,
 * which is the "forget this phone" button on its own settings screen.
 */
pairingRoutes.delete('/devices/:id', (c) => {
  const id = c.req.param('id');
  const user = currentUser(c);
  if (!isLocalRequest(c)) {
    const device = callerDevice(c);
    if (device?.id !== id) throw new CodedError('local_only');
  }
  if (!removeDevice(user.id, id)) throw new CodedError('not_found');
  return c.body(null, 204);
});
