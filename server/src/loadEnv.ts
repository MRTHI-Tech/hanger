import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

/**
 * Minimal .env reader. Avoids a dependency and works on any Node 20+.
 * Real process env always wins over the file.
 */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const envPath = resolve(process.cwd(), '.env');
const fromFile = existsSync(envPath)
  ? parseEnvFile(readFileSync(envPath, 'utf8'))
  : {};

export const config: Record<string, string | undefined> = {
  ...fromFile,
  ...Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
  ),
};
