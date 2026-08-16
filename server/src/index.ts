import {existsSync, watch} from 'node:fs';
import {relative, resolve} from 'node:path';
import {serve} from '@hono/node-server';
import {serveStatic} from '@hono/node-server/serve-static';
import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {env, mockMode} from './env.js';
import './db.js';
import {budgetSnapshot} from './budget.js';
import {contentTypeForExt, exists, read} from './storage.js';
import {toHttpError} from './youcam/errors.js';
import {personRoutes} from './routes/person.js';
import {garmentRoutes} from './routes/garments.js';
import {tryonRoutes} from './routes/tryon.js';
import {outfitRoutes} from './routes/outfits.js';
import {alternativeRoutes} from './routes/alternatives.js';
import {linkRoutes} from './routes/links.js';
import {handoffRoutes} from './routes/handoff.js';
import {pairingRoutes} from './routes/pairing.js';
import {devRoutes} from './routes/dev.js';
import {lanAddresses} from './handoff.js';
import {attachUser, isLocalRequest, requireUser, trustsLoopbackNow} from './auth.js';
import {clerkConfigured} from './clerk.js';
import {checkMediaSignature} from './media.js';

const app = new Hono();

/**
 * Addresses a phone might load the app from: this machine, on the same Wi-Fi.
 * The private ranges only — a public origin has no business here in dev.
 */
const LAN_ORIGIN =
  /^https?:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.local)(?::\d+)?$/i;

/**
 * The extension's origin is chrome-extension://<id>, and the id is only
 * assigned when it's loaded unpacked — so we allow any extension origin in dev.
 *
 * The phone app is a plain web origin, which the extension never was: it loads
 * from this machine's LAN address and calls back to the same address on this
 * port. Different origin, so it needs saying out loud here or every request
 * from the phone fails before it arrives.
 */
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (origin.startsWith('chrome-extension://')) return origin;
      // Handy while previewing the panel as a plain page during development.
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      if (LAN_ORIGIN.test(origin)) return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    // Authorization is how a paired phone says which device it is (auth.ts).
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Before every route: work out who is calling, if anyone. Never refuses —
// that decision belongs to the routes below (auth.ts).
app.use('*', attachUser);

app.get('/health', (c) =>
  c.json({ok: true, mockMode, ...budgetSnapshot()}),
);

/**
 * Stored images and videos.
 *
 * Not behind requireUser, and it can't be: an <img> tag sends no Authorization
 * header. The link itself is the proof instead — signed by us, and expiring
 * (media.ts). A loopback caller is waved through, on the same reasoning as
 * everywhere else in auth.ts: only this machine can reach loopback, and it is
 * what generated the link in the first place.
 */
app.get('/media/:name', (c) => {
  const name = c.req.param('name');

  if (!isLocalRequest(c)) {
    const check = checkMediaSignature(name, c.req.query('e'), c.req.query('s'));
    if (check === 'expired') {
      return c.json(
        {
          error: {
            code: 'media_link_expired',
            message: 'That picture link has expired.',
            hint: 'Reload the page',
          },
        },
        403,
      );
    }
    if (check === 'bad') {
      // Deliberately the same answer as a file that isn't there. A forged link
      // learns nothing about which names exist.
      return c.json(
        {error: {code: 'not_found', message: 'That image is no longer here.'}},
        404,
      );
    }
  }

  if (!exists(name)) return c.json({error: {code: 'not_found', message: 'That image is no longer here.'}}, 404);
  const bytes = read(name);
  return c.body(bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': contentTypeForExt(name),
    // Private: a signed link is one person's, and a shared cache holding it
    // would hand it to the next person through the same proxy.
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
});

// Open, and deliberately so — see the note at the top of auth.ts. /pair is the
// way in for a phone that has nothing yet, and guards its own routes.
app.route('/pair', pairingRoutes);
app.route('/handoff', handoffRoutes);

// Everything that touches somebody's wardrobe. Each of these resolves to
// exactly one user in auth.ts, and every query underneath is scoped to them.
app.use('/person/*', requireUser);
app.use('/person', requireUser);
app.use('/garments/*', requireUser);
app.use('/garments', requireUser);
app.use('/tryon/*', requireUser);
app.use('/tryon', requireUser);
app.use('/outfits/*', requireUser);
app.use('/outfits', requireUser);
app.use('/alternatives/*', requireUser);
app.use('/alternatives', requireUser);
app.use('/links/*', requireUser);

app.route('/person', personRoutes);
app.route('/garments', garmentRoutes);
app.route('/tryon', tryonRoutes);
app.route('/outfits', outfitRoutes);
app.route('/alternatives', alternativeRoutes);
app.route('/links', linkRoutes);
if (mockMode) app.route('/dev', devRoutes);

/**
 * The phone app, served by the same process in production.
 *
 * Mounted last so it can never shadow an API route: everything above has
 * already had its chance, and only what's left reaches the static files.
 *
 * The fallback to index.html is what makes a deep link work. The app keeps its
 * routes in memory rather than the URL, but a QR code lands on `/?pair=CODE`,
 * and a reload of anything that isn't `/` has to return the app rather than a
 * 404 from a file that was never on disk.
 */
if (env.SERVE_PWA) {
  const pwaRoot = resolve(process.cwd(), env.PWA_DIST);
  if (existsSync(pwaRoot)) {
    app.use('/*', serveStatic({root: relative(process.cwd(), pwaRoot)}));
    app.get('/*', serveStatic({path: `${relative(process.cwd(), pwaRoot)}/index.html`}));
    console.log(`[hanger] serving the phone app from ${pwaRoot}`);
  } else {
    console.warn(
      `[hanger] SERVE_PWA is on but ${pwaRoot} does not exist — run npm run build:pwa`,
    );
  }
}

app.notFound((c) =>
  c.json(
    {error: {code: 'not_found', message: 'That page does not exist here.'}},
    404,
  ),
);

app.onError((err, c) => {
  const {status, body} = toHttpError(err);
  if (status >= 500) console.error('[hanger] unhandled:', err);
  return c.json(body, status);
});

serve({fetch: app.fetch, port: env.PORT}, (info) => {
  console.log(`[hanger] server on http://localhost:${info.port}`);
  console.log(
    `[hanger] mode: ${mockMode ? 'MOCK (sample data, no units spent)' : 'LIVE'}`,
  );
  const {unitsSpent, unitBudget} = budgetSnapshot();
  console.log(`[hanger] units: ${unitsSpent}/${unitBudget}`);
  console.log(
    clerkConfigured
      ? `[hanger] sign-in: Clerk${trustsLoopbackNow() ? ' (loopback still trusted — TRUST_LOOPBACK)' : ''}`
      : '[hanger] sign-in: none — everything belongs to the local user',
  );
  if (clerkConfigured && trustsLoopbackNow()) {
    console.warn(
      '[hanger] ⚠ TRUST_LOOPBACK is on. Fine on your own machine; never set it in production.',
    );
  }
  // Handing a photo over from a phone needs an address the phone can reach.
  // Saying it here makes "same Wi-Fi?" answerable without a network tool.
  const lan = lanAddresses()[0];
  console.log(
    lan
      ? `[hanger] phone handoff: reachable on http://${lan}:${info.port}`
      : '[hanger] phone handoff: unavailable — no network interface a phone could reach',
  );
  watchEnvFile();
});

/**
 * The dev watcher only reloads on source changes, so editing .env does nothing
 * until the server is restarted — and the symptom is confusing: the panel keeps
 * saying "Sample data" long after MOCK_MODE was set to false. Say so out loud.
 */
function watchEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  try {
    let warned = false;
    watch(envPath, () => {
      if (warned) return;
      warned = true;
      console.warn(
        '\n[hanger] ⚠ server/.env changed — restart the server for it to take effect.\n',
      );
      setTimeout(() => {
        warned = false;
      }, 2000);
    });
  } catch {
    /* watching .env is a convenience, never a requirement */
  }
}
