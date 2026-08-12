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
  {
    name: '006_outfit_video',
    sql: `
      -- A finished outfit can be turned into a short video to show someone
      -- else. It's a second, optional task on top of an outfit that already
      -- succeeded, so it carries its own status rather than reusing the
      -- outfit's — a failed video must not make a good outfit look broken.
      ALTER TABLE outfit ADD COLUMN video_status TEXT;
      ALTER TABLE outfit ADD COLUMN video_path TEXT;
      ALTER TABLE outfit ADD COLUMN video_error_code TEXT;
    `,
  },
  {
    name: '007_video_cache',
    sql: `
      -- Building the same outfit twice produces two outfit rows pointing at one
      -- cached result image (§8.3) — and, before this, two separately paid
      -- videos of byte-identical input. Keyed on the source image bytes per
      -- §12.2, so the second row is free no matter which outfit asks.
      CREATE TABLE video_cache (
        cache_key   TEXT PRIMARY KEY,
        result_path TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
    `,
  },
  {
    name: '008_owned_garments',
    sql: `
      -- A garment can come off a product page or out of your own wardrobe.
      -- An owned piece has no retailer and no product page, and both columns
      -- were NOT NULL, so this rebuilds the table rather than storing a
      -- sentinel URL that every reader downstream would have to un-fake.
      -- Nothing declares a foreign key onto garment, so the copy is safe.
      CREATE TABLE garment_new (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        brand         TEXT,
        retailer      TEXT,
        product_url   TEXT,
        price_amount  REAL,
        price_currency TEXT,
        category      TEXT NOT NULL,
        image_path    TEXT NOT NULL,
        source_image_url TEXT,
        youcam_file_id TEXT,
        file_id_at    INTEGER,
        hung          INTEGER DEFAULT 0,
        source        TEXT NOT NULL DEFAULT 'shop',
        saved_at      INTEGER NOT NULL
      );

      INSERT INTO garment_new
        (id, title, brand, retailer, product_url, price_amount, price_currency,
         category, image_path, source_image_url, youcam_file_id, file_id_at,
         hung, source, saved_at)
      SELECT
         id, title, brand, retailer, product_url, price_amount, price_currency,
         category, image_path, source_image_url, youcam_file_id, file_id_at,
         hung, 'shop', saved_at
      FROM garment;

      DROP TABLE garment;
      ALTER TABLE garment_new RENAME TO garment;
    `,
  },
  {
    name: '009_paired_devices',
    sql: `
      -- A phone that has been let in. Until now the only client was the side
      -- panel, running on this machine, and reaching localhost was proof
      -- enough of who you were. A phone is a different machine, so it has to
      -- carry something instead: a token it got by proving, once, that it had
      -- physical sight of a code on the laptop's screen.
      --
      -- This is not accounts. There is still one hanger, and this table only
      -- says which devices may look at it.
      CREATE TABLE device (
        id           TEXT PRIMARY KEY,
        token        TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        paired_at    INTEGER NOT NULL,
        last_seen_at INTEGER
      );
    `,
  },
  {
    name: '010_users',
    sql: `
      -- Until now there was one wardrobe, belonging to whoever was sitting at
      -- this machine. That works exactly as long as the server is your laptop.
      -- On a public URL it means every visitor shares one hanger, sees one
      -- another's clothes, and spends one budget.
      --
      -- So everything that is somebody's now says whose it is. The wardrobe,
      -- the photo of them, the outfits built from it, and the phones let in.
      CREATE TABLE user (
        id          TEXT PRIMARY KEY,
        -- The id our sign-in provider knows them by. Null for the local user a
        -- development machine runs as, which never signs in to anything.
        auth_id     TEXT UNIQUE,
        email       TEXT,
        name        TEXT,
        -- Per-person spend, so one enthusiastic visitor can't empty the budget
        -- before the next one arrives. Null cap means "use the server default".
        units_spent INTEGER NOT NULL DEFAULT 0,
        unit_cap    INTEGER,
        created_at  INTEGER NOT NULL
      );

      -- Added nullable because SQLite cannot add a NOT NULL column to a table
      -- with rows in it. Every write sets it; every read filters on it. The
      -- backfill below leaves nothing null, and the indexes make the filter
      -- free rather than a full scan.
      ALTER TABLE person  ADD COLUMN user_id TEXT;
      ALTER TABLE garment ADD COLUMN user_id TEXT;
      ALTER TABLE outfit  ADD COLUMN user_id TEXT;
      ALTER TABLE tryon   ADD COLUMN user_id TEXT;
      ALTER TABLE device  ADD COLUMN user_id TEXT;

      -- Whatever is already here belongs to the person whose laptop this is.
      INSERT INTO user (id, auth_id, email, name, created_at)
        VALUES ('local', NULL, NULL, 'This computer', unixepoch() * 1000);

      UPDATE person  SET user_id = 'local' WHERE user_id IS NULL;
      UPDATE garment SET user_id = 'local' WHERE user_id IS NULL;
      UPDATE outfit  SET user_id = 'local' WHERE user_id IS NULL;
      UPDATE tryon   SET user_id = 'local' WHERE user_id IS NULL;
      UPDATE device  SET user_id = 'local' WHERE user_id IS NULL;

      CREATE INDEX idx_garment_user ON garment (user_id);
      CREATE INDEX idx_outfit_user  ON outfit (user_id);
      CREATE INDEX idx_tryon_user   ON tryon (user_id);
      CREATE INDEX idx_device_user  ON device (user_id);

      -- One photo per person, enforced rather than assumed: the old code kept a
      -- single row at a hardcoded id, and that assumption is exactly what stops
      -- being true here.
      CREATE UNIQUE INDEX idx_person_user ON person (user_id);
    `,
  },
  {
    name: '011_media_signing_and_user_spend',
    sql: `
      -- Somewhere to keep a secret that has to survive a restart but isn't
      -- worth asking anyone to configure. Today that's the key media URLs are
      -- signed with: generated on first use, and stable afterwards so a link
      -- handed out this morning still works this afternoon.
      CREATE TABLE app_setting (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Spend was one number for the whole server, which is the right shape
      -- for one person's laptop and the wrong one for a public URL: the first
      -- visitor could empty the budget before the second arrived.
      ALTER TABLE spend_log ADD COLUMN user_id TEXT;
      UPDATE spend_log SET user_id = 'local' WHERE user_id IS NULL;
      CREATE INDEX idx_spend_user ON spend_log (user_id);
    `,
  },
  {
    name: '012_local_user_has_no_allowance',
    sql: `
      -- Per-person allowances exist to stop a visitor draining somebody else's
      -- account. The local user is that somebody else: it's whoever is sitting
      -- at the machine, paying for the key, and their limit is the server's own
      -- UNIT_BUDGET — which they set.
      --
      -- Without this they inherit the default visitor allowance and, if they
      -- have ever used the thing, are over it immediately: their own spend from
      -- before allowances existed gets counted against them.
      UPDATE user SET unit_cap = 0 WHERE id = 'local';
    `,
  },
  {
    name: '013_outfit_video_pose',
    sql: `
      -- Which motion the video was rendered with. Stored rather than derived
      -- because it's the only way to tell "you already have this video" from
      -- "you have a different one of the same outfit" — asking for the catwalk
      -- when the row holds the lookbook has to be a new render, not a no-op.
      --
      -- Existing rows were all made before there was a choice, and the prompt
      -- they used is the one 'lookbook' still sends.
      ALTER TABLE outfit ADD COLUMN video_pose TEXT;
      UPDATE outfit SET video_pose = 'lookbook' WHERE video_path IS NOT NULL;
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
