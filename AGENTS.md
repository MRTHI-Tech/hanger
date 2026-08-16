# AGENTS.md — Hanger

> Chrome extension + backend. Try on any garment from any retail site, save it to a
> cross-retailer wardrobe, combine pieces into complete outfits, and surface cheaper
> alternatives to anything you're looking at.
>
> Built for the **YouCam API Skin AI & Apparel VTO Hackathon** (Devpost, deadline
> **17 Aug 2026, 11:45 EDT**). Track: **Apparel Virtual Try-On**.

---

## 0. How to use this file

This is the complete build specification. Implement **Phases 1–6** in §14 in order.
Phase 7 is a stretch goal — do not start it until 1–6 pass their acceptance checks in §15.

Before writing code, read §2 (constraints). Three of them will silently ruin the build
if you discover them late.

---

## 1. What we are building and why

**The problem.** Online apparel returns run ~25–40%, and the dominant reason is that
the customer couldn't tell how it would actually look on them. Existing virtual try-on
lives inside individual retailers' own sites, which means it can only ever show you
*their* catalogue. Nobody can try an H&M shirt with Zara trousers, because no retailer
has any incentive to build that.

**The product.** A browser extension that sits above every retailer:

1. **Try on** — one saved photo, then try any garment on any site, in place.
2. **Wardrobe** — save garments from anywhere into one cross-retailer closet.
3. **Outfit builder** — combine a top from one retailer with trousers from another and
   shoes from a third, rendered as a single image, with a per-item buy list and total.
4. **Alternatives** — for any garment you're viewing, find visually similar items
   elsewhere, sorted by price, and try those on too.

**The pitch, in one line:** *your wardrobe, not their catalogue.*

**Naming and voice.** The product is **Hanger**. Saving a garment is **"Hang it"** — use
that verb consistently in the UI, never "Save" or "Add to wishlist". The collection is
**"Your Hanger"**, not "wardrobe" or "closet", in button and heading copy (prose in this
spec uses "wardrobe" for readability; the UI should not). Keep copy plain and short —
no exclamation marks, no "Oops!", no emoji in the interface.

**What the judges are scoring** (design to these four, explicitly):

| Criterion | How we win it |
|---|---|
| Technological Implementation | Multi-garment chain composition, in-page image acquisition, reverse-image alternatives loop, aggressive caching. Not a single API call behind a button. |
| Design | A complete product: onboarding, wardrobe, outfit canvas, real empty/loading/error states. **This is our biggest risk — do not skimp.** |
| Potential Impact | Returns reduction + a purchase decision no single retailer can serve. |
| Quality of the Idea | Cross-retailer composition + reverse-image alternatives. Lead with these, never with "try on clothes." |

---

## 2. Non-negotiable constraints — read before writing code

### 2.1 The YouCam API key must never reach the browser

The API is server-to-server (`/s2s/` paths, `Authorization: Bearer`), with no documented
browser CORS support. A Chrome extension is a zip file anyone can unpack.

**Every** YouCam call goes through our backend. The extension never sees the key and
never calls `yce-api-01.makeupar.com` directly. Same rule for `SERPAPI_KEY`.

### 2.2 Retailer CDNs will block YouCam from fetching image URLs

`ref_file_url` requires the URL to be publicly downloadable *by Perfect Corp's servers*.
Many retail CDNs enforce referrer checks and will return 403 → `error_download_image`.

**Therefore: never pass a retailer URL as `ref_file_url`.** The content script fetches
the image bytes inside the page's own origin (where cookies and referrer are correct),
posts the blob to our backend, and the backend uploads it via the File API and uses
`ref_file_id`. This is the only approach that generalises across retailers.

### 2.3 Flat product shots fail for lower-body garments

Straight from the spec:

> "For the lower body, only actual worn outfits are supported, **not standalone product
> images**."
> "Do not use composite images (e.g. top and bottom in one photo)."
> "Must be a front-facing product shot of a **single** garment."

A white-background flat-lay of jeans will fail or produce garbage. Retailers almost
always have an on-model shot on the same product page.

**Therefore:** scrape **all** product images from the page, not just the hero image.
Rank them (§9.3) and show the user a thumbnail strip — *"Which photo shows this best?"* —
with the best on-model candidate preselected.

### 2.4 The AI Bag API is not chain-compatible

Verified against the docs: `/s2s/v2.0/task/bag` takes a **head-to-chest selfie**, requires
`gender` and `style` (`style_parisian_chic`, `style_urban_chic`, `style_mediterranean_chic`,
`style_art_deco_style`), and returns a **restyled 1104×1472 editorial scene**. It does not
composite a bag onto an existing image — it regenerates the whole shot.

**Therefore:** bags are **not** a layer in the outfit chain. If built at all, ship it as a
separate one-off "Editorial shot" feature off the finished outfit. Shoes go through
`cloth-v3` with `garment_category: "shoes"`, which stays in the chain. See §11.

### 2.5 Credits are finite

1,000 units ≈ $179. Units-per-call is not published; assume several, and note that a
3-piece outfit is 3 sequential calls. Obey §12 (mock mode, caching, budget guard) from
the first commit, not as a later optimisation.

### 2.6 Result URLs expire

Results land in a `ttl30` bucket; task IDs are queryable for 24h. **Download every result
into our own storage the moment the task succeeds.** If we store the signed URL, the
wardrobe and the demo video assets will be dead links by the time judges look.

### 2.7 We are not using Skin AI

Decided and closed. The source image for `cloth-v3` is a full-body shot in which the face
occupies a small fraction of the frame — far below what skin/tone analysis needs to be
meaningful. Shipping a low-confidence skin reading would be worse than not shipping one.
Do not add it back.

---

## 3. Stack and repo layout

Local-first. The backend runs on `localhost:8787` for the demo; deployment is optional
and must not be a prerequisite for anything working.

```
hanger/
├── AGENTS.md                 ← this file
├── PWA.md                    ← the phone app: what it is and its build order
├── README.md                 ← setup, run, demo script (write this, judges read it)
├── .env.example
├── shared/                   one copy of everything more than one app needs
│   ├── src/types.ts          the wire contract — server, panel and phone
│   ├── src/api.ts            typed client for the backend (settable base URL)
│   ├── src/format.ts         prices, for anything that shows one
│   ├── src/theme/            the butter theme (§3.1)
│   └── scripts/icon.mjs      the hanger glyph, rasterised to PNG
├── server/
│   ├── package.json          Node 20+, ESM, Hono, better-sqlite3, zod
│   ├── src/
│   │   ├── index.ts          Hono app, CORS for chrome-extension://* and the LAN
│   │   ├── auth.ts           one seam: whose wardrobe is this request?
│   │   ├── users.ts          the user table; every row of clothing has an owner
│   │   ├── pairing.ts        pairing codes (memory) and device tokens (SQLite)
│   │   ├── env.ts            zod-validated env
│   │   ├── db.ts             better-sqlite3, migrations run on boot
│   │   ├── storage.ts        local disk ./storage/, served at /media/:id
│   │   ├── youcam/
│   │   │   ├── client.ts     file upload, task create, poll
│   │   │   ├── tryon.ts      single-garment try-on
│   │   │   ├── chain.ts      multi-garment outfit composition
│   │   │   └── errors.ts     error-code → human message map (§13)
│   │   ├── alternatives.ts   SerpApi Google Lens
│   │   ├── cache.ts          content-hash cache (§12.2)
│   │   ├── budget.ts         unit spend guard (§12.3)
│   │   ├── mock.ts           MOCK_MODE fixtures (§12.1)
│   │   └── routes/           person, garments, tryon, outfits, alternatives, pairing
│   ├── fixtures/             sample images for MOCK_MODE
│   └── storage/              gitignored; generated results
├── extension/
│   ├── package.json          Vite + React 18 + TypeScript + Tailwind
│   ├── manifest.json         MV3
│   ├── src/
│   │   ├── content/
│   │   │   ├── index.ts      PDP detection, floating badge injection
│   │   │   ├── scrape.ts     product data + image extraction (§9)
│   │   │   └── fetchImage.ts same-origin blob fetch (§2.2)
│   │   ├── background/
│   │   │   └── index.ts      service worker, side panel open, task polling relay
│   │   └── sidepanel/
│   │       ├── App.tsx       router
│   │       ├── screens/      Onboarding, TryOn, Wardrobe, OutfitBuilder, Alternatives
│   │       └── components/   GarmentCard, OutfitSlot, ImageStrip, BeforeAfter, Spinner
│   └── public/icons/
└── pwa/                      the phone app (PWA.md) — read-only as of Phase 2
    ├── index.html            web manifest, theme colour, safe-area viewport
    ├── public/               manifest and service worker; icons and fonts generated
    ├── scripts/make-assets.mjs
    └── src/
        ├── App.tsx           header, one scrolling region, bottom tab bar
        ├── server.ts         works out where the server is (PWA.md)
        ├── device.ts         this phone's pairing token
        ├── screens/          Hanger, Outfits, OutfitDetail, Me, AddSheet, Pair
        └── components/       GarmentCard, Sheet, TabBar, FilterChip, ErrorNote, Later
```

### 3.1 Design system — do this before building any UI

Every UI in this repo uses the **butter** theme from Astryx. It was installed with:

```bash
npx @astryxdesign/cli theme add butter
```

and now lives at `shared/src/theme/`, imported as `@hanger/shared/theme`. One copy: the
side panel and the phone wear the same theme, and a change to it changes both. **Do not
run the CLI again** in a new package — import the shared one.

Then:

- **Build every screen from those tokens** (CSS variables, Tailwind extensions,
  component primitives). Do not hand-roll colours, radii, spacing or type scales
  alongside them.
- Use the Astryx component primitives rather than writing new equivalents. Where one
  genuinely doesn't exist — a chip, a bottom tab bar — build it from tokens, and only
  from tokens.
- If the theme can't be resolved, **stop and report it** rather than substituting your
  own design system. The theme is a fixed requirement.

Layout constraints the theme has to live inside differ by app, and neither one's layout
is the other's:

- **Side panel:** roughly **320–480px wide**, full viewport height, on a desktop. Single
  column, no horizontal scrolling, and the user's own photo is the largest element.
- **Phone:** a whole device. Safe-area insets, a thumb-reachable bottom bar, one-handed
  use as the default posture, and touch targets no smaller than 44pt.

---

## 4. Environment variables — what the human must supply

Create `server/.env` from `.env.example`.

| Variable | Required | Where to get it | Notes |
|---|---|---|---|
| `YOUCAM_API_KEY` | **Yes** | Register on [Devpost](https://youcam-api.devpost.com/) → redeem code by email → sign up at [yce.perfectcorp.com/api-console](https://yce.perfectcorp.com/api-console/en/) → Account → Redeem Code → then **API Keys** page | Grants the 1,000 free units. If the console shows an **API ID + Secret pair** rather than a single bearer key, stop and flag it — the auth flow differs from what's specced here. |
| `SERPAPI_KEY` | **Yes** (for §10) | [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key) | Free tier is 100 searches. Enough for a demo; cache results per garment. |
| `YOUCAM_API_BASE` | No | — | Defaults to `https://yce-api-01.makeupar.com` |
| `PORT` | No | — | Defaults to `8787` |
| `MOCK_MODE` | No | — | `true` = return fixtures, spend zero units. **Default to `true`** so a fresh clone runs without credentials. |
| `UNIT_BUDGET` | No | — | Soft cap on calls per run. Default `600`. |
| `DATABASE_PATH` | No | — | Defaults to `./data/hanger.db` |
| `ANTHROPIC_API_KEY` | Optional | [console.anthropic.com](https://console.anthropic.com) | Only for §10.4 (better search queries from messy product titles). Skip in the first pass; the heuristic version works. |

**No key is needed for the extension itself** — the Chrome extension ID is assigned when
it's loaded unpacked. The backend must allow CORS from `chrome-extension://*` in dev.

**Nothing else is required.** No cloud account, no database server, no image host.

---

## 5. External API contracts

### 5.1 YouCam — upload a file

Two steps: register the file, then PUT the bytes to the returned presigned URL.

```http
POST https://yce-api-01.makeupar.com/s2s/v2.0/file
Authorization: Bearer $YOUCAM_API_KEY
Content-Type: application/json

{ "files": [ { "content_type": "image/jpeg",
               "file_name": "photo.jpg",
               "file_size": 547541 } ] }
```

Response → `data.files[0].file_id` and `data.files[0].requests[0]` (`method`, `url`,
`headers`). Then:

```http
PUT <requests[0].url>
Content-Type: image/jpeg
Content-Length: 547541
<raw bytes>
```

`file_size` must be the exact byte length or the PUT will be rejected.

### 5.2 YouCam — create a try-on task

```http
POST https://yce-api-01.makeupar.com/s2s/v2.0/task/cloth-v3
Authorization: Bearer $YOUCAM_API_KEY
Content-Type: application/json

{
  "src_file_id": "<person image>",
  "ref_file_id": "<garment image>",
  "garment_category": "upper_body",
  "change_shoes": false
}
```

- `src_*` / `ref_*` each accept either `_file_id` or `_file_url`. **Always use `_file_id`
  for the garment** (§2.2).
- `garment_category`: `"full_body" | "upper_body" | "lower_body" | "shoes" | "auto"` — required.
- `change_shoes`: boolean, only meaningful for `full_body` / `lower_body`.

Response → `data.task_id`.

### 5.3 YouCam — poll

```http
GET https://yce-api-01.makeupar.com/s2s/v2.0/task/cloth-v3/{task_id}
Authorization: Bearer $YOUCAM_API_KEY
```

→ `data.task_status` is `"running" | "success" | "error"`; on success
`data.results.url` holds the signed result URL. On error, `data.error` holds a code
from §13.

**Polling rules:** interval 2s, timeout 120s, exponential-ish backoff after 30s. Never
abandon a running task early — an unpolled task can expire into `InvalidTaskId` while
still having consumed units.

### 5.4 Input specifications — validate before spending a unit

**Person image** (`src`):
- 1024×768 recommended, 512×384 minimum, max side 4096px, <10MB, jpg/png
- Exactly one person, standing, facing forward, face fully visible and unobstructed
- Subject should fill ~80% of the frame
- Full body required for `lower_body` / `full_body` / `shoes`

**Garment image** (`ref`):
- Same dimension/size/format limits
- Product shot: front-facing, **one garment only**, no composites
- On-model shot: one person, standing, front-facing, face visible, garment fully visible
  and unobstructed, and it must cover the whole try-on region
- **Lower body: on-model only** (§2.3)

Validate client-side (dimensions, file size, format, face count via a lightweight check)
and reject with a helpful message *before* calling the API.

### 5.5 SerpApi — Google Lens reverse image search

```http
GET https://serpapi.com/search.json
      ?engine=google_lens
      &url=<publicly-accessible garment image URL>
      &type=visual_matches
      &country=gb
      &api_key=$SERPAPI_KEY
```

Returns `visual_matches[]` with (approximately) `title`, `link`, `source`, `thumbnail`,
`price` (object with `value` / `extracted_value` / `currency`), `in_stock`.

**Verify the exact response shape with one live call before writing the parser** — build
around what you observe, and save that response into `server/fixtures/` as the mock.

`url` must be reachable by SerpApi, so pass the **retailer's own CDN URL** here (those are
generally public to a plain GET without a referrer — this is different from §2.2, where
the problem is Perfect Corp's fetcher specifically). If a lookup returns nothing, fall
back to a text search on the product title.

---

## 6. Data model (SQLite)

```sql
CREATE TABLE person (
  id             TEXT PRIMARY KEY,        -- 'default' for the single local user
  photo_path     TEXT NOT NULL,           -- local storage path of the base photo
  youcam_file_id TEXT,                    -- cached; re-upload if >20h old
  file_id_at     INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE TABLE garment (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  brand         TEXT,
  retailer      TEXT NOT NULL,            -- hostname
  product_url   TEXT NOT NULL,
  price_amount  REAL,
  price_currency TEXT,
  category      TEXT NOT NULL,            -- upper_body|lower_body|full_body|shoes|bag|hat|scarf
  image_path    TEXT NOT NULL,            -- our copy of the chosen ref image
  source_image_url TEXT,                  -- original CDN url (used for §5.5 lookups)
  youcam_file_id TEXT,
  file_id_at    INTEGER,
  saved_at      INTEGER NOT NULL
);

CREATE TABLE tryon (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL,
  garment_id    TEXT NOT NULL,
  base_hash     TEXT NOT NULL,            -- hash of the src image used
  cache_key     TEXT NOT NULL UNIQUE,     -- §12.2
  status        TEXT NOT NULL,            -- pending|running|success|error
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
  slot          TEXT NOT NULL,            -- top|bottom|shoes|outer
  position      INTEGER NOT NULL,         -- chain order
  PRIMARY KEY (outfit_id, slot)
);

CREATE TABLE alternative (
  id            TEXT PRIMARY KEY,
  garment_id    TEXT NOT NULL,            -- the garment we searched from
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
```

---

## 7. Backend routes

All JSON unless noted. All errors return `{ error: { code, message, hint? } }` where
`message` is human-readable (§13).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | `{ ok, mockMode, unitsSpent, unitBudget }` |
| `POST` | `/person/photo` | multipart. Validates, stores, returns `{ personId, photoUrl, warnings[] }`. Rejects bad input per §5.4 **before** any API call. |
| `GET` | `/person` | Current person + photo URL, or 404. |
| `POST` | `/garments` | multipart: image blob + JSON metadata (`title`, `brand`, `retailer`, `productUrl`, `price`, `category`, `sourceImageUrl`). Stores and returns the garment. |
| `GET` | `/garments` | Wardrobe list. Supports `?category=`. |
| `DELETE` | `/garments/:id` | Remove from wardrobe. |
| `POST` | `/tryon` | `{ garmentId, changeShoes? }` → `{ tryonId, status, cached }`. Returns immediately; poll. Cache hit returns `status: "success"` with the result. |
| `GET` | `/tryon/:id` | `{ status, resultUrl?, errorCode?, message? }` |
| `POST` | `/outfits` | `{ name?, items: [{ garmentId, slot }] }` → `{ outfitId, status }`. Kicks off the chain (§8). |
| `GET` | `/outfits/:id` | `{ status, resultUrl?, progress: { step, of, label }, items[], total: { amount, currency } }` |
| `GET` | `/outfits` | Saved outfits. |
| `DELETE` | `/outfits/:id` | |
| `GET` | `/alternatives?garmentId=` | Cached-then-live SerpApi lookup (§10). Returns items sorted cheapest-first, with `savingsVsOriginal`. |
| `POST` | `/alternatives/:id/save` | Save an alternative into the wardrobe as a real garment (downloads its image, uploads to YouCam). Enables "try on the cheaper one". |
| `POST` | `/links/read` | `{ url }` → what a product page says about itself, read server-side (§9.2, no DOM). Creates nothing; the answer is for a person to check. |
| `POST` | `/links/hang` | The confirmed reading. Downloads the shop's picture and stores it as a garment. |
| `GET` | `/media/:path` | Serve stored images. |

---

## 8. The chain engine — outfit composition

The API composites one garment at a time. Multi-garment outfits are built by feeding
each result back in as the next source.

```
base photo
   └─[cloth-v3 · upper_body · H&M shirt]──▶ step 1 result
        └─[cloth-v3 · lower_body · Zara trousers]──▶ step 2 result
             └─[cloth-v3 · shoes · Nike trainers]──▶ final outfit
```

**Rules:**

1. **Fixed slot order:** `top → bottom → shoes`. If a `full_body` garment is present it
   occupies the whole chain and top/bottom are ignored — surface that in the UI.
   Treat `outer` (jacket/coat) as an `upper_body` pass applied *after* `top`.
2. **Always re-run from the original base photo.** Never mutate a stored outfit
   incrementally. Every generative pass re-encodes the whole image, so the face drifts;
   editing an existing composite compounds it. Changing one slot = full chain re-run.
3. **Reuse the cache per prefix.** The result of `[base + top]` is identical whether the
   user later adds trousers or not — cache on the prefix (§12.2) so swapping only the
   shoes costs one call, not three.
4. **Upload each intermediate result** to the File API and pass the resulting `file_id`
   as the next `src_file_id`. Do not pass the signed S3 URL forward — it expires and the
   fetch may fail.
5. **Fail soft.** If step 2 fails, keep and show step 1's result with a clear note
   ("we couldn't fit the trousers — here's the look so far"). Never discard completed work.
6. **Report progress.** `GET /outfits/:id` returns `{ step: 2, of: 3, label: "Fitting the
   trousers…" }`. The UI shows this. A 3-piece outfit takes 30–90 seconds and the user
   must never be staring at an undifferentiated spinner.

---

## 9. Content script — product page detection and scraping

### 9.1 Detection

A page is a PDP if **two or more** of these hold:
- JSON-LD `<script type="application/ld+json">` with `"@type": "Product"`
- OpenGraph `og:type` = `product`, or `product:price:amount` meta present
- A `<meta itemprop="price">` / microdata `itemtype` containing `schema.org/Product`
- URL matches common PDP patterns (`/product/`, `/p/`, `/productpage.`, `/dp/`, `/item/`)

On detection, inject a floating badge (bottom-right, high z-index, shadow DOM to avoid
style collisions) reading **"Try this on"**. Clicking it opens the side panel with the
scraped payload.

### 9.2 Extraction — prefer structured data, fall back to DOM

Order of preference for each field:

| Field | Source order |
|---|---|
| title | JSON-LD `name` → `og:title` → `<h1>` |
| brand | JSON-LD `brand.name` → `og:site_name` → hostname |
| price | JSON-LD `offers.price` + `priceCurrency` → `product:price:*` meta → first `[class*=price]` text parsed |
| images | JSON-LD `image[]` → `og:image` → all `<img>` inside the main gallery container, deduped by base URL with size params stripped |
| category | infer per §9.4 |

Do not build per-retailer scrapers. The structured-data path covers the large retailers;
the DOM fallback covers the rest. Test against **at least five different retailers** and
list them in the README.

### 9.3 Image ranking — the on-model heuristic (important, see §2.3)

Score every candidate image and preselect the highest:

- `+3` aspect ratio between 0.6 and 0.85 (portrait, typical of on-model shots)
- `+2` URL or `alt` text contains `model`, `worn`, `outfit`, `look`, `onmodel`
- `+2` larger natural dimensions (normalised)
- `-3` URL or `alt` contains `flat`, `still`, `packshot`, `detail`, `swatch`, `back`
- `-2` near-square with a near-white uniform border (sample the corner pixels)

**If the inferred category is `lower_body`, hard-require an on-model candidate.** If the
top score is below threshold, show the strip with a visible warning: *"Trousers need a
photo of someone wearing them — pick one showing the full leg."*

Always render the thumbnail strip so the user can override. Two lines of UI; saves the
entire feature.

### 9.4 Category inference

Keyword-match over `title + breadcrumbs + url`, in this precedence:

- `full_body` — dress, jumpsuit, gown, romper, playsuit, overall, co-ord, suit
- `lower_body` — trouser, pant, jean, short, skirt, legging, chino, cargo, joggers
- `shoes` — shoe, sneaker, trainer, boot, heel, sandal, loafer, derby
- `bag` — bag, tote, backpack, clutch, purse, satchel
- `hat` — hat, cap, beanie, beret
- `scarf` — scarf, shawl, wrap
- `upper_body` — everything else (default)

Always show the inferred category as an editable dropdown. Never silently guess.

---

## 10. The alternatives engine

The differentiator that turns a try-on tool into a shopping tool. For any garment:
find visually similar items elsewhere, cheaper first, and let the user try those on too.

### 10.1 Flow

1. User is viewing (or has saved) a garment → clicks **"Find alternatives."**
2. Backend calls SerpApi Google Lens with the garment's original CDN image URL (§5.5).
3. Filter results: must have a parseable price, must have a resolvable `link`, drop
   results from the same retailer as the original, dedupe by `source` + normalised title.
4. Sort ascending by price. Compute `savingsVsOriginal` for each.
5. Cache into `alternative` for 24h keyed on `garment_id` — SerpApi's free tier is 100
   searches total and must not be burned by re-renders.
6. Render as cards: thumbnail, title, retailer, price, **"£24 cheaper"** badge, and two
   actions — **Try this on** and **View**.

### 10.2 "Try this on" from an alternative

This is the loop that makes the feature real rather than a list of links:

`POST /alternatives/:id/save` → backend downloads the alternative's thumbnail →
uploads via File API → creates a `garment` row → immediately fires a try-on.

Caveat to handle: Lens thumbnails are often small (a few hundred px). If the downloaded
image is below the 512×384 floor, upscale it via **AI Photo Enhance**
(`/s2s/v2.0/task/...`, same async pattern — check
[docs](https://docs.perfectcorp.com/reference/ai_photo_enhance) for the exact path) before
using it as a `ref`. If it's still unusable, show *"Open the product page to try this on"*
and deep-link — do not fail silently.

### 10.3 Fallback when Lens returns nothing

Retry as a text search using `brand + category + dominant colour + material` derived from
the title. Better to return five decent text matches than an empty state.

### 10.4 Optional: LLM query cleanup

If `ANTHROPIC_API_KEY` is set, use `claude-haiku-4-5-20251001` to turn a messy product
title ("Oversized Boxy Fit Biker Jacket - 1236612001") into clean structured attributes
`{ garmentType, colour, material, fit }` for the fallback search and for the savings copy.
**Skip this in the first pass** — the heuristic is fine and this is not on the critical path.

---

## 11. Accessory layering

Read §2.4 first. The three accessory APIs behave very differently and only one is a true
layer.

| Accessory | Endpoint | Chain-compatible? | Do this |
|---|---|---|---|
| **Shoes** | `cloth-v3`, `garment_category: "shoes"` | **Yes** — confirmed | Ship it. Final step of the chain. Also expose `change_shoes` on `full_body`/`lower_body` garments. |
| **Hat** | `/s2s/v2.0/task/hat` *(unverified)* | Probably | Phase 7. Verify the endpoint and parameters against a live call before building. |
| **Scarf** | `/s2s/v2.0/task/scarf` *(unverified)* | Probably | Phase 7. Same. |
| **Bag** | `/s2s/v2.0/task/bag` | **No** | Regenerates a styled editorial scene from a head-to-chest selfie; requires `gender` + `style`. Do **not** put it in the chain. |

**If you build the bag feature**, present it honestly as its own thing: a **"Make an
editorial shot"** button on a finished outfit that produces a styled lookbook image with
the bag. Distinct screen, distinct framing, clearly separate from the outfit composite.
It's a nice final beat in the demo video — but it is Phase 7, and shipping without it is
completely fine.

**Before building any Phase 7 accessory:** make one live call, save the response to
`fixtures/`, and build the parser around what you actually observed.

---

## 12. Credits discipline

### 12.1 Mock mode

`MOCK_MODE=true` is the **default**. In mock mode, every YouCam and SerpApi call returns a
fixture from `server/fixtures/` after a realistic artificial delay (try-on 8s, chain step
8s each), including a deterministic failure path so error states can be developed without
spending anything. A fresh `git clone` must run end-to-end with no credentials at all.

All UI work happens in mock mode. Switch to live only to verify integration and to
generate demo assets.

### 12.2 Cache keys

```
tryon:  sha256(base_image_bytes + garment_image_bytes + category + changeShoes)
chain:  sha256(base_image_bytes + ordered list of (garment_hash, category) for the prefix)
```

Hash the **bytes**, not IDs or URLs — the same garment saved twice from different pages
must hit the same cache entry. Cache prefixes for chains (§8.3) so swapping the last slot
costs one call.

Every cache hit is logged to stdout as `CACHE HIT tryon <key> (saved ~1 unit)`. Judges and
you both benefit from seeing that.

### 12.3 Budget guard

Count every live call in `spend_log`. At 80% of `UNIT_BUDGET`, log a prominent warning.
At 100%, refuse new live calls with a clear error rather than silently draining the
account. `GET /health` exposes the running total.

### 12.4 Demo assets

Before recording: pre-generate every shot the video needs, with caching on, and verify
each result file exists locally in `./storage`. Record against the warm cache so nothing
is slow or fails live. Reserve ~200 units for this.

---

## 13. Error handling

Map every code to a sentence a shopper would understand. Never surface a raw code.

| Code | Message to show |
|---|---|
| `error_pose` | "We couldn't work out your pose. Try a photo standing up and facing the camera." |
| `error_invalid_src` | "We need a full-body photo for this — yours is cropped too tight." |
| `error_invalid_ref` | "This product photo isn't clear enough. Try picking a different image." |
| `error_apply_region_mismatch` | "This garment doesn't match the area we're fitting. Check the category is right." |
| `error_editing_failed` | "The result came out too close to your original photo. Try a different product image." |
| `error_download_image` | "We couldn't load that product image." *(Should be unreachable — if you see this, §2.2 was violated.)* |
| `error_nsfw_content_detected` | "We couldn't generate this one. Try a different photo." |
| `exceed_max_filesize` | "That image is too large — keep it under 10MB." |
| `error_below_min_image_size` | "That image is too small. We need at least 512×384." |
| `error_no_face` | "We couldn't find a face in your photo." |
| `CreditInsufficiency` (400) | "We're out of API credits for this demo." *(Log loudly.)* |
| `429` | Retry once after 5s, then: "Too many requests right now — try again in a moment." |
| `InvalidTaskId` | "That result expired. Let's run it again." |

Every error state in the UI must offer a next action — retry, pick another image, or
change the category. Never a dead end.

---

## 14. Build order

**Phases 1–6 are the one-shot target.** Phase 7 only after §15 passes.

### Phase 1 — Skeleton
Both packages scaffolded. **Run the butter theme install (§3.1) before writing any UI.**
Server boots, `/health` responds, migrations run, extension loads unpacked with a side
panel that fetches `/health` and displays it using theme tokens. `MOCK_MODE=true`.

### Phase 2 — YouCam client + mock harness
`youcam/client.ts`: file upload (register + PUT), task create, poll with backoff, result
download to local storage. Full mock implementation with fixtures. Error map wired.
Cache and budget modules in place from the start.

### Phase 3 — Person onboarding
`POST /person/photo` with real validation per §5.4. Onboarding screen: good/bad example
graphic showing the pose requirements, upload or webcam capture, client-side checks,
clear pass/fail feedback, "You're ready" confirmation.

### Phase 4 — Single-garment try-on (the core loop)
Content script: PDP detection, scraping, image ranking, same-origin blob fetch, floating
badge. Side panel: image strip picker, category dropdown, Try On, progress state,
before/after result, Save to wardrobe. **Verify on at least five different retailers.**

### Phase 5 — Wardrobe + outfit builder (the differentiator)
Wardrobe grid with garment cards. Outfit canvas with top/bottom/shoes/outer slots and
drag-in from the wardrobe. Chain engine per §8, with prefix caching, per-step progress,
and fail-soft. Outfit view shows the composite, the per-item buy list with retailer and
price, and the total.

### Phase 6 — Alternatives
SerpApi integration, filtering, cheapest-first sort, savings badges, 24h cache,
"Try this on" round-trip per §10.2, text-search fallback.

### Phase 7 — Stretch (only if 1–6 are solid)
Shoes as a chain step is already in Phase 5. Beyond that: hat/scarf layering (verify
endpoints first), the bag "editorial shot" as a separate feature, outfit sharing.

### Then, before submitting
- **A full design pass.** Empty states, loading copy, error copy, spacing, transitions.
  Budget a full day. This is the criterion most likely to cost us a placing.
- README with setup, run instructions, architecture diagram, and which retailers are tested.
- Pre-generate demo assets, record the video (§16), take screenshots.
- Submit early — the deadline is **11:45 EDT**, not end of day.

---

## 15. Definition of done

A build is only complete when all of these pass:

1. `git clone && npm i && npm run dev` works **with no credentials** — mock mode, full UI walkthrough.
2. With a real `YOUCAM_API_KEY`: upload a photo, try on a garment from H&M, save it.
3. Try on a garment from a **second, different retailer** and save it.
4. Combine both into one outfit → a single composite image showing both garments.
5. Swapping one slot in a saved outfit triggers **one** live call, not three (prefix cache).
6. Alternatives returns priced, cheaper-first results for a saved garment, and
   "Try this on" on an alternative produces a real try-on image.
7. Every error path in §13 renders a human sentence and an action — verify by forcing each.
8. Every result image is served from **our** storage, not a signed YouCam URL. No expiry.
9. `GET /health` reports units spent, and the budget guard actually blocks at the cap.
10. The `YOUCAM_API_KEY` string appears **nowhere** in the built extension bundle. Grep to confirm.

---

## 16. Demo video — build toward this shot list

3 minutes maximum; judges aren't required to watch past it. Front-load the differentiator.

| Time | Shot |
|---|---|
| 0:00–0:15 | The problem, one sentence. "You can't tell how it'll look, so you buy two and return one." |
| 0:15–0:30 | Onboarding: one photo, done. |
| 0:30–0:55 | H&M product page → badge → try on a jacket → result. Name the API on screen: *AI Clothes Virtual Try-On (cloth-v3)*. |
| 0:55–1:20 | **Navigate to a different retailer.** Try on trousers. Keep the URL bar visible during the cut — this is the shot that wins it. |
| 1:20–1:50 | Outfit canvas: combine both → composite → per-item buy list and total. |
| 1:50–2:20 | Alternatives: same jacket, cheaper elsewhere → try the cheaper one on → compare. |
| 2:20–2:40 | Wardrobe of saved looks across retailers. |
| 2:40–3:00 | The line: *your wardrobe, not their catalogue.* |

No copyrighted music. No third-party trademarks beyond incidental retailer pages.

---

## 17. Out of scope

Do not build these. They cost time and win nothing here.

- Any Skin AI or facial analysis feature (§2.7 — closed)
- User accounts, auth, multi-user support (single local person record)
- Size/fit recommendation from measurements — we show appearance, not fit; don't overclaim
- Real-time video or camera-feed try-on
- Price tracking, alerts, or scheduled re-checks
- Firefox/Safari ports
- **Publishing to the Chrome Web Store.** Judges test from the repo with the extension
  loaded unpacked; Devpost asks for a repo URL, not a store listing. The README must
  document the unpacked-install steps clearly. (Listing it later costs a one-time $5
  developer registration, but it is not needed for this submission and store review
  would not clear in time anyway.)
- Cloud deployment as a prerequisite (optional extra only)
- Per-retailer bespoke scrapers (structured data + fallback only)

---

## 18. Reference

- [AI Clothes Virtual Try-On docs](https://docs.perfectcorp.com/reference/ai_clothes)
- [cloth-v3 request spec](https://docs.perfectcorp.com/reference/ai_clothes/v3.0/paths/~1s2s~1v2.0~1task~1cloth-v3/post.md)
- [AI Bag docs](https://docs.perfectcorp.com/reference/ai_bag) — read before touching bags (§2.4)
- [YouCam API index](https://yce.perfectcorp.com/ai-api) · [API console](https://yce.perfectcorp.com/api-console/en/)
- [SerpApi Google Lens](https://serpapi.com/google-lens-api) · [visual matches](https://serpapi.com/google-lens-visual-matches-api)
- [Hackathon page](https://youcam-api.devpost.com/)
