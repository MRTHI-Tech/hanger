# Hanger

Try on any garment from any shop, keep it in one cross-retailer wardrobe, and
combine pieces from different shops into a single outfit image.

**Your wardrobe, not their catalogue.**

Built for the YouCam API Skin AI & Apparel VTO Hackathon (Apparel Virtual
Try-On track). The full specification lives in [AGENTS.md](AGENTS.md); this
file is how to run it.

---

## What it does

1. **Try on** — one saved photo, then any garment on any shop, in place.
2. **Your Hanger** — keep garments from anywhere in one place.
3. **Outfits** — a top from one shop, trousers from another, shoes from a third,
   composed into one image with a per-item buy list and a total.
4. **Alternatives** — reverse-image search for the same garment elsewhere,
   cheapest first, and try those on too.

---

## Setup

Requires **Node 20+** and Chrome 114+.

```bash
git clone <this repo> && cd hanger
npm install
npm run dev
```

That's the whole setup. **No credentials are needed.** `MOCK_MODE` defaults to
`true`, so a fresh clone runs end to end on sample data and spends nothing.

`npm run dev` starts two things:

- the backend on `http://localhost:8787`
- a watch build of the extension into `extension/dist/`

### Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Choose the **`extension/dist`** folder (not `extension/`).
5. Pin Hanger to the toolbar, then open any shop's product page. A **Try this
   on** button appears at the bottom right.

The extension ID is assigned by Chrome at load time; nothing needs configuring
for it. Reloading after a rebuild is the circular-arrow button on the card in
`chrome://extensions`.

### Going live

Copy `.env.example` to `server/.env` and fill in what you have:

| Variable | Needed for | Where |
|---|---|---|
| `YOUCAM_API_KEY` | Real try-on | [yce.perfectcorp.com/api-console](https://yce.perfectcorp.com/api-console/en/) → Account → Redeem Code → API Keys |
| `SERPAPI_KEY` | Alternatives | [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key) |
| `MOCK_MODE` | Set `false` to spend real units | — |
| `UNIT_BUDGET` | Spend cap, default 600 | — |
| `MOCK_DELAY_MS` | Mock latency, default 8000 | — |

Without `YOUCAM_API_KEY` the server stays in mock mode even if `MOCK_MODE=false`,
rather than failing every request with an auth error.

---

## Architecture

```
Chrome                                  localhost:8787
┌───────────────────────────┐           ┌────────────────────────────────┐
│ content script            │           │ Hono + SQLite + local storage  │
│  · PDP detection          │           │                                │
│  · scrape + rank photos   │           │  /person   /garments  /tryon   │
│  · fetch image BYTES ─────┼──bytes───▶│  /outfits  /alternatives       │
│    from inside the page   │           │                                │
├───────────────────────────┤           │   youcam/client.ts ────────────┼──▶ YouCam
│ service worker            │           │   alternatives.ts  ────────────┼──▶ SerpApi
│  · opens the side panel   │           │   cache.ts · budget.ts         │
├───────────────────────────┤           │                                │
│ side panel (React)        │◀──JSON────│  every result downloaded into  │
│  · butter theme (Astryx)  │  /media/  │  ./storage and served by us    │
└───────────────────────────┘           └────────────────────────────────┘
```

Four decisions shape most of the code:

**The API key never reaches the browser.** Every YouCam and SerpApi call goes
through the backend. An unpacked extension is a zip file anyone can read.

**Retailer image URLs are never handed to the try-on API.** Many retail CDNs
403 an anonymous fetch, which the API reports as `error_download_image`. Instead
the content script fetches the bytes *inside the page*, where the cookies and
referrer are the ones the CDN expects, posts them to the backend, and the
backend uploads via the File API and passes `ref_file_id`. This is the only
approach that generalises across shops.

**Outfits are a chain, cached by prefix.** `cloth-v3` fits one garment at a
time, so each result is uploaded and fed back in as the next source, always
starting from the original photo. Steps are cached on the whole prefix that
produced them, so swapping only the shoes in a three-piece outfit costs one
call instead of three.

**Every result is downloaded immediately.** YouCam results land in a 30-day
bucket behind signed URLs. Storing the URL would leave a wardrobe full of dead
images, so the bytes are pulled into `./storage` the moment a task succeeds and
the panel only ever sees a `/media/` URL.

### Layout

```
server/
  src/
    index.ts          Hono app, CORS for chrome-extension://*
    env.ts db.ts      zod-validated env; migrations run on boot
    storage.ts        local disk, served at /media/:name
    images.ts         header-only dimension probe + §5.4 validation
    cache.ts          content-hash cache, chain prefixes
    budget.ts         unit spend guard
    mock.ts           MOCK_MODE, and mock/figure.ts draws the sample results
    alternatives.ts   SerpApi Google Lens + filtering
    youcam/
      client.ts       file upload, task create, poll, download
      engine.ts       the one seam between mock and live
      tryon.ts        single garment
      chain.ts        multi-garment composition
      errors.ts       error code → human sentence
    routes/           person, garments, tryon, outfits, alternatives, dev
  fixtures/           sample data — a fresh clone runs on these
extension/
  src/
    content/          detection, scraping, image ranking, same-origin fetch
    background/       service worker
    sidepanel/        React app, screens and components
    themes/butter/    the Astryx butter theme
  scripts/pages/      saved product pages from real shops, for the scraper test
```

### About the sample data

Mock results are **drawings, not photographs** — an SVG figure that gains one
garment layer per chain step, so mock mode genuinely demonstrates composition
(three steps really do produce an image wearing three garments) and nobody can
mistake a fixture for a real try-on. Every mock result carries a "Sample
result — no API credits used" caption.

---

## Retailers the scraper is tested against

There are no per-retailer scrapers. The same code — structured data first, DOM
fallback second — runs everywhere. It is checked against pages saved from real
shops:

```bash
npm run test:scrape --workspace extension
```

| Shop | Platform | What the saved page exercises |
|---|---|---|
| Uniqlo (t-shirt + trousers) | Custom SPA | og-only metadata, URL aspect-ratio hints, lower-body category |
| Nike | Custom | JSON-LD Product as the *only* recognisable signal |
| Gap | Next.js SPA | An empty app shell — nothing extractable outside a browser |
| Everlane | Shopify | JSON-LD + OpenGraph + buy control |
| Passenger | Shopify | Full structured data |
| Percival (t-shirt + trousers) | Shopify | Lower-body on-model requirement |
| Allbirds | Shopify | Shoes category inference |

Two caveats worth stating plainly:

- The harness runs under jsdom, which has no layout and no network. Natural
  image dimensions and corner-pixel sampling — two inputs to the §9.3 ranking —
  score zero there. Keyword, structured-data and URL signals are fully
  exercised; the size-based ones only work in a real browser.
- Gap and Uniqlo build their product pages client-side, so their *saved* HTML
  carries little. Their fixtures assert only what the served HTML really
  contains, and say so in the output.

---

## Development

```bash
npm run dev                              # server + extension watch build
npm run typecheck                        # both packages
npm run test:scrape --workspace extension  # scraper against saved shop pages
npm run build --workspace extension      # production extension build
```

To preview the side panel as an ordinary web page (handy for design work):

```bash
npx serve -l 5599 extension/dist
```

then open `http://localhost:5599/sidepanel.html`. Outside the extension there is
no scraped product to show, so put a `ScrapedProduct` in
`sessionStorage['hanger.previewProduct']` to see the try-on screen.

### Forcing error states

Every error in the §13 table renders a human sentence and a next action. In
mock mode you can trigger any of them:

```bash
curl -s localhost:8787/dev/errors | python3 -m json.tool          # list them
curl -s -X POST localhost:8787/dev/force-error \
  -H 'Content-Type: application/json' -d '{"code":"error_pose"}'   # arm one
```

The next try-on then fails with that code. `{"code":null}` disarms it.

### Credits discipline

- `MOCK_MODE=true` by default; all UI work happens on fixtures.
- Cache hits are logged: `CACHE HIT tryon <key> (saved ~1 unit)`.
- `GET /health` reports units spent against the budget.
- At 80% of `UNIT_BUDGET` the server warns loudly; at 100% it refuses new live
  calls rather than silently draining the account.

---

## Known gaps

- **Not verified against the live YouCam API.** This build had no
  `YOUCAM_API_KEY`. The live client is written to §5 of the spec and exercised
  through the same code path as mock mode, but no live call has been made.
- **The SerpApi parser is built from SerpApi's published example response**,
  not a live call, for the same reason. The first live response logs its
  top-level and per-match keys so a shape mismatch announces itself instead of
  quietly returning an empty list. See the `_provenance` block in
  `server/fixtures/serpapi-google-lens.json`.
- **AI Photo Enhance is stubbed for live mode.** Rescuing an undersized
  alternative thumbnail needs the real endpoint path verified first, so live
  mode returns "open the product page to try this on" rather than guessing a
  URL. Mock mode exercises the code path.
- React 19 and Tailwind v4, where the spec said 18 and (implicitly) v3 — the
  butter theme's runtime requires React ≥19, and its Tailwind bridge is v4-only.
  The theme is a fixed requirement, so the versions gave way.
- Phase 7 (hat/scarf layering, the bag editorial shot) is not built.
