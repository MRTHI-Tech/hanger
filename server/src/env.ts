import {z} from 'zod';
import {config} from './loadEnv.js';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v.toLowerCase() === 'true'));

const schema = z.object({
  YOUCAM_API_KEY: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Sign-in (Clerk). Optional so a fresh clone still runs with no accounts at
   * all: without a secret key the server falls back to the local user, which is
   * how development has always worked.
   */
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  /**
   * Whether reaching the server on loopback counts as being signed in.
   * Unset means "only while there is no sign-in configured" (see auth.ts).
   * Set it true to keep the side panel working locally while it is being
   * taught to sign in; production sets it false.
   */
  TRUST_LOOPBACK: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v.toLowerCase() === 'true')),
  YOUCAM_API_BASE: z.string().default('https://yce-api-01.makeupar.com'),
  PORT: z.coerce.number().default(8787),
  /** Default true so a fresh clone runs with no credentials at all (§12.1). */
  MOCK_MODE: bool(true),
  /**
   * Two-letter market for the alternatives search. Normally left unset — the
   * garment's own currency picks the market, so a ZAR garment searches ZA.
   */
  SEARCH_COUNTRY: z.string().length(2).optional(),
  /**
   * Where the phone app answers, for the pairing QR code only. Unset in
   * development: this machine's LAN address on the app's dev port is right.
   */
  PWA_ORIGIN: z.string().url().optional(),
  /**
   * Serve the built phone app from this server, rather than expecting Vite to
   * be running somewhere. True in production: one origin means the phone makes
   * same-origin requests, so no CORS, and one URL to hand somebody.
   */
  SERVE_PWA: bool(false),
  /** Where the built phone app is, relative to the server's working directory. */
  PWA_DIST: z.string().default('../pwa/dist'),
  UNIT_BUDGET: z.coerce.number().default(600),
  /**
   * What one person may spend before their results become samples. Enough to
   * judge the product properly — several try-ons, an outfit and a video — and
   * not enough for one visitor to empty the account. 0 removes the limit.
   */
  USER_UNIT_CAP: z.coerce.number().default(20),
  DATABASE_PATH: z.string().default('./data/hanger.db'),
  STORAGE_PATH: z.string().default('./storage'),
});

const parsed = schema.safeParse(config);
if (!parsed.success) {
  console.error('Invalid environment:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

/**
 * Live mode needs a key. If MOCK_MODE was turned off without one we fall back
 * to mock rather than failing every request with an auth error.
 */
export const mockMode = env.MOCK_MODE || !env.YOUCAM_API_KEY;

if (!env.MOCK_MODE && !env.YOUCAM_API_KEY) {
  console.warn(
    '[hanger] MOCK_MODE=false but YOUCAM_API_KEY is unset — staying in mock mode.',
  );
}
