import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {env} from './env.js';

const dbPath = resolve(process.cwd(), env.DATABASE_PATH);
mkdirSync(dirname(dbPath), {recursive: true});

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Migrations run on boot. Append-only: add a new entry, never edit an old one.
 */
const MIGRATIONS: {name: string; sql: string}[] = [
  {
    name: '001_initial',
    sql: `
      CREATE TABLE person (
        id             TEXT PRIMARY KEY,
        photo_path     TEXT NOT NULL,
        youcam_file_id TEXT,
        file_id_at     INTEGER,
        created_at     INTEGER NOT NULL
      );

      CREATE TABLE garment (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        brand         TEXT,
        retailer      TEXT NOT NULL,
        product_url   TEXT NOT NULL,
        price_amount  REAL,
        price_currency TEXT,
        category      TEXT NOT NULL,
        image_path    TEXT NOT NULL,
        source_image_url TEXT,
        youcam_file_id TEXT,
        file_id_at    INTEGER,
        saved_at      INTEGER NOT NULL
      );

      CREATE TABLE tryon (
        id            TEXT PRIMARY KEY,
        person_id     TEXT NOT NULL,
        garment_id    TEXT NOT NULL,
        base_hash     TEXT NOT NULL,
        cache_key     TEXT NOT NULL UNIQUE,
        status        TEXT NOT NULL,
        result_path   TEXT,
        error_code    TEXT,
        units_est     INTEGER DEFAULT 1,
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE outfit (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        person_id     TEXT NOT NULL,
        status        TEXT NOT NULL,
        result_path   TEXT,
        error_code    TEXT,
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE outfit_item (
        outfit_id     TEXT NOT NULL,
        garment_id    TEXT NOT NULL,
        slot          TEXT NOT NULL,
        position      INTEGER NOT NULL,
        PRIMARY KEY (outfit_id, slot)
      );

      CREATE TABLE alternative (
        id            TEXT PRIMARY KEY,
        garment_id    TEXT NOT NULL,
        title         TEXT,
        source        TEXT,
        link          TEXT,
        thumbnail_url TEXT,
        price_amount  REAL,
        price_currency TEXT,
        fetched_at    INTEGER NOT NULL
      );

      CREATE TABLE spend_log (
        id         TEXT PRIMARY KEY,
        endpoint   TEXT NOT NULL,
        units_est  INTEGER NOT NULL,
        at         INTEGER NOT NULL
      );

      CREATE INDEX idx_garment_category ON garment(category);
      CREATE INDEX idx_alternative_garment ON alternative(garment_id);
      CREATE INDEX idx_outfit_item_outfit ON outfit_item(outfit_id);
    `,
  },
  {
    name: '002_chain_cache',
    sql: `
      -- Cached results for a chain *prefix* (§8.3, §12.2), so swapping the last
      -- slot in an outfit costs one call instead of re-running every step.
      CREATE TABLE chain_step (
        cache_key    TEXT PRIMARY KEY,
        result_path  TEXT NOT NULL,
        youcam_file_id TEXT,
        file_id_at   INTEGER,
        created_at   INTEGER NOT NULL
      );
    `,
  },
  {
    name: '003_outfit_progress',
    sql: `
      ALTER TABLE outfit ADD COLUMN progress_step INTEGER DEFAULT 0;
      ALTER TABLE outfit ADD COLUMN progress_of INTEGER DEFAULT 0;
      ALTER TABLE outfit ADD COLUMN progress_label TEXT;
      ALTER TABLE outfit ADD COLUMN partial_note TEXT;
      ALTER TABLE outfit_item ADD COLUMN skipped INTEGER DEFAULT 0;
    `,
  },
  {
    name: '004_hung_flag',
    sql: `
      -- Trying something on has to create a garment row (the API needs an id
      -- for it), but Your Hanger should only hold what the person chose to
      -- keep. "Hang it" sets this.
      ALTER TABLE garment ADD COLUMN hung INTEGER DEFAULT 0;
    `,
  },
  {
    name: '005_alternative_images',
    sql: `
      -- Lens returns both a small thumbnail and the retailer's own full-size
      -- image. The big one is what makes "try this on" work (§10.2), so keep
      -- it and its dimensions.
      ALTER TABLE alternative ADD COLUMN image_url TEXT;
      ALTER TABLE alternative ADD COLUMN image_width INTEGER;
      ALTER TABLE alternative ADD COLUMN image_height INTEGER;
      ALTER TABLE alternative ADD COLUMN in_stock INTEGER;
      ALTER TABLE alternative ADD COLUMN position INTEGER;
    `,
  },
];

function migrate() {
  db.exec(
    `CREATE TABLE IF NOT EXISTS migration (
       name TEXT PRIMARY KEY,
       at   INTEGER NOT NULL
     )`,
  );
  const applied = new Set(
    db
      .prepare('SELECT name FROM migration')
      .all()
      .map((r) => (r as {name: string}).name),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO migration (name, at) VALUES (?, ?)').run(
        m.name,
        Date.now(),
      );
    })();
    console.log(`[hanger] migration applied: ${m.name}`);
  }
}

migrate();
