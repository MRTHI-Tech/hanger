import {existsSync, watch} from 'node:fs';
import {resolve} from 'node:path';
import {serve} from '@hono/node-server';
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
import {handoffRoutes} from './routes/handoff.js';
import {devRoutes} from './routes/dev.js';
import {lanAddresses} from './handoff.js';

const app = new Hono();

/**
 * The extension's origin is chrome-extension://<id>, and the id is only
 * assigned when it's loaded unpacked — so we allow any extension origin in dev.
 */
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (origin.startsWith('chrome-extension://')) return origin;
      // Handy while previewing the panel as a plain page during development.
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

app.get('/health', (c) =>
  c.json({ok: true, mockMode, ...budgetSnapshot()}),
);

app.get('/media/:name', (c) => {
  const name = c.req.param('name');
  if (!exists(name)) return c.json({error: {code: 'not_found', message: 'That image is no longer here.'}}, 404);
  const bytes = read(name);
  return c.body(bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': contentTypeForExt(name),
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
});

app.route('/person', personRoutes);
app.route('/garments', garmentRoutes);
app.route('/tryon', tryonRoutes);
app.route('/outfits', outfitRoutes);
app.route('/alternatives', alternativeRoutes);
app.route('/handoff', handoffRoutes);
if (mockMode) app.route('/dev', devRoutes);

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
