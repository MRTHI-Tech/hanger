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
  YOUCAM_API_BASE: z.string().default('https://yce-api-01.makeupar.com'),
  PORT: z.coerce.number().default(8787),
  /** Default true so a fresh clone runs with no credentials at all (§12.1). */
  MOCK_MODE: bool(true),
  UNIT_BUDGET: z.coerce.number().default(600),
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
