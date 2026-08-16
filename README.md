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

For the phone app instead, `npm run dev:phone` starts the backend and the phone
app together — see [On your phone](#on-your-phone).

### Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Choose the **`extension/dist`** folder (not `extension/`).
5. Pin Hanger to the toolbar, then open any shop's product page. A **Try this
   on** button appears at the bottom right.

The extension ID is assigned by Chrome at load time. Reloading after a rebuild
is the circular-arrow button on the card in `chrome://extensions`.

If Clerk sign-in is enabled, add `chrome-extension://<that-id>` to the Clerk
instance's allowed origins. Keep that ID stable once the extension is shared.

### Going live

Copy `.env.example` to `server/.env` and fill in what you have:

| Variable | Needed for | Where |
|---|---|---|
| `YOUCAM_API_KEY` | Real try-on | [yce.perfectcorp.com/api-console](https://yce.perfectcorp.com/api-console/en/) → Account → Redeem Code → API Keys |
| `SERPAPI_KEY` | Alternatives | [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key) |
| `CLERK_SECRET_KEY` | Account verification on the server | Clerk dashboard → API keys |
| `CLERK_PUBLISHABLE_KEY` | Sign-in in the extension | Clerk dashboard → API keys |
| `MOCK_MODE` | Set `false` to spend real units | — |
| `UNIT_BUDGET` | Spend cap for the whole server, default 600 | — |
| `USER_UNIT_CAP` | What one visitor may spend before their results become samples, default 20. `0` removes the limit | — |
| `MOCK_DELAY_MS` | Mock latency, default 8000 | — |

Without `YOUCAM_API_KEY` the server stays in mock mode even if `MOCK_MODE=false`,
rather than failing every request with an auth error.

With both Clerk keys present, the extension shows sign-in before opening the
hanger and sends a fresh session token with every API request. The exit icon in
the panel header signs out only that extension session. With no Clerk keys, the
credential-free local-user mode is unchanged.

First-time account creation opens Clerk's hosted sign-up page in a normal tab.
This keeps CAPTCHA and other browser security checks out of the MV3 side panel;
after creating the account, return to the panel and sign in there.

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
    index.ts          Hono app, CORS for chrome-extension://* and the LAN
    auth.ts           one seam: whose wardrobe is this request?
    users.ts          the user table; every row of clothing has an owner
    media.ts          signed, expiring image links (an <img> sends no headers)
    pairing.ts        pairing codes (memory) and device tokens (SQLite)
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
    routes/           person, garments, tryon, outfits, alternatives, pairing, dev
  fixtures/           sample data — a fresh clone runs on these
extension/
  src/
    content/          detection, scraping, image ranking, same-origin fetch
    background/       service worker
    sidepanel/        React app, screens and components
  scripts/pages/      saved product pages from real shops, for the scraper test
shared/               one copy of whatever more than one app needs
  src/
    types.ts          the wire contract — server, panel and phone
    api.ts            typed client for the backend, with a settable base URL
    format.ts         prices
    theme/            the Astryx butter theme
  assets/logo/        the hanger mark, one drawing every icon comes from
  scripts/icon.mjs    that mark, rasterised to PNG
pwa/                  the phone app — see PWA.md
  src/
    App.tsx           header, one scrolling region, bottom tab bar
    server.ts         works out which machine the server is on
    device.ts         this phone's pairing token
    screens/          Hanger, Outfits, OutfitDetail, Me, AddSheet, Pair
    components/       GarmentCard, Sheet, TabBar, FilterChip, ErrorNote, Later
```

### About the sample data

Mock results are **drawings, not photographs** — an SVG figure that gains one
garment layer per chain step, so mock mode genuinely demonstrates composition
(three steps really do produce an image wearing three garments) and nobody can
mistake a fixture for a real try-on. Every mock result carries a "Sample
result — no API credits used" caption.

---

## On your phone

There is a second app in `pwa/`: the same hanger, on a phone. It talks to the
same server and the same database, so anything kept from the side panel is
already there. [PWA.md](PWA.md) is its specification and build order.

It shows Your Hanger, your outfits and their buy lists. It photographs: your own
photo, and any piece you own or find on a shop floor — camera or photo roll,
straight onto the hanger. It tries things on, builds an outfit and makes the
video. And it sends what you're looking at — the mp4, the outfit still, or you
in the one thing you just tried on — to WhatsApp, Instagram or Messages through
the phone's own share sheet, which is the one thing the side panel cannot do at
all.

Things get *in* from other apps too. On Android, Hanger is a share target:
screenshot something in Instagram, tap Share, tap Hanger, and it lands on the
"what is it?" screen. Share a shop link from anywhere and the server reads the
page the extension would have read. iOS allows neither — Apple's share sheet is
closed to web apps — so the same two routes sit on the Add sheet as "From your
photos" and "Paste a link", which is one extra tap and the only way in on an
iPhone.

```bash
npm run dev:phone
```

That starts the backend and serves the app on `http://localhost:5174`, bound to
every network interface. Two ways to look at it:

- **On the laptop** — open `http://localhost:5174` and make the window
  phone-shaped, or use the browser's device toolbar.
- **On your actual phone** — same Wi-Fi as the laptop, then open
  `http://<your-laptop's-LAN-IP>:5174`. The server prints the address it can be
  reached on at startup (`[hanger] phone handoff: reachable on …`) — same host,
  port 5174. Safari or Chrome's menu will offer to add it to your home screen,
  where it opens without browser chrome.

The app finds the server by itself: whatever host served the page, on port 8787.
So the LAN address works with nothing to configure. If that guess is ever wrong,
**You → Where the server is** takes an address and remembers it.

### Pairing

A phone has to be let in once. On the laptop, tap the **phone icon** in the side
panel's header: it shows six characters. Type those into the phone, and it stays
paired until you remove it. The same sheet lists every phone that can see your
hanger, with a Remove next to each.

There's a QR code on that sheet too, for a phone that doesn't have the app yet —
it opens the app already carrying the code.

Why any of this exists: the side panel runs on the same machine as the server,
so reaching `localhost` is itself proof of who it is, and the panel carries no
credential. A phone is a different machine, and being on your Wi-Fi is not the
same claim as owning the wardrobe. The full reasoning is at the top of
[server/src/auth.ts](server/src/auth.ts).

Viewing the phone app on the laptop itself needs no pairing, for the same
reason — it's on loopback.

Two things to know:

- The phone must be on the **same Wi-Fi** as the laptop, and the laptop must be
  running the server. That's the only failure this app really has, and the error
  screen says so.
- The camera needs **HTTPS**, which plain LAN http isn't. Nothing here uses the
  camera yet, so it doesn't bite until Phase 4.

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

The server reads the same nine pages, without a browser, for the phone's "paste
a link" route:

```bash
npm run test:links --workspace server
```

Eight of the nine are hangable from the markup alone — right title, right
category, and the right price wherever the served HTML carries one. The ninth is
Gap, whose page is an empty app shell; the extension can't read that either, and
both routes send you to the camera instead. To point it at a live page rather
than a saved one:

```bash
npx tsx scripts/read-link.ts https://someshop.com/product/thing
```

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
npm run dev:phone                        # server + phone app on :5174
npm run typecheck                        # every package
npm run test:scrape --workspace extension  # scraper against saved shop pages
npm run build --workspace extension      # production extension build
npm run build:pwa                        # production phone build
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

## What has run live

Written down because it was wrong here for a while, and a stale gap list is
worse than none: it talks people out of things that already work.

With a real `YOUCAM_API_KEY` and `MOCK_MODE=false`, the core loop has been
exercised against the live APIs, not just against mock mode:

- **Try-on and the outfit chain** — live `cloth-v3` calls, with results
  downloaded into `./storage` as the real images they are. Mock results are
  SVG drawings, so a `.jpg` in `tryon.result_path` or `chain_step` is by
  definition something YouCam made.
- **Across retailers, which is the whole claim** — garments saved from
  bash.com, superbalist.com and zara.com, composed into three-piece outfits
  (top, bottom, shoes) in one image.
- **Video** — live `image-to-video` calls, finished mp4s served from our own
  storage.
- **Alternatives** — live SerpApi Google Lens results: real merchants, real
  product links, real prices.
- **Two accounts on one server**, each with their own photo and their own
  wardrobe.
- **Reading a link server-side** — live pages from Uniqlo, Allbirds, Gap,
  Superbalist and H&M, on top of the nine saved fixtures. Two of those five
  taught us something: Allbirds hands back its own logo as `og:image` on a stale
  product URL, and H&M refuses a server-side fetch outright with a 403. Both are
  handled, the second by saying so and offering the camera.

`GET /health` reports what has been spent. The numbers in `spend_log` are the
audit trail; nothing here is inferred from the code.

## Known gaps

- **AI Photo Enhance is stubbed for live mode.** Rescuing an undersized
  alternative thumbnail needs the real endpoint path verified first, so
  `enhanceImage()` returns null and the caller says "open the product page to
  try this on" rather than guessing a URL. Mock mode exercises the code path.
- **Alternative prices can carry the wrong currency.** A result from a foreign
  storefront whose price has no explicit currency is stamped with the local one
  — an adidas Oman listing came back as `18 ZAR`. Cheapest-first sorting is the
  point of that screen, so a mislabelled price doesn't just read wrong, it
  sorts to the top.
- **The SerpApi parser was built from SerpApi's published example response**
  rather than a live one. It has since been fed live responses without a shape
  mismatch, and the first response of a run still logs its top-level and
  per-match keys so a future change announces itself instead of quietly
  returning an empty list. See the `_provenance` block in
  `server/fixtures/serpapi-google-lens.json`.
- **A shared screenshot isn't identified, it's asked about.** The plan was to
  run it through the Lens integration; that engine takes a URL and fetches the
  image itself, and a picture out of somebody's camera roll has no public URL to
  give it. So a shared picture lands on the same "what is it?" screen a
  photographed one does. Links, which carry their own details, fill themselves
  in.
- **Some shops can't be read from a link.** Pages built entirely in the browser
  (Gap) carry nothing in their served HTML, and shops behind bot protection
  (H&M) answer a server-side fetch with 403. Both end in a sentence and the
  camera, never a spinner.
- **It runs on a laptop.** `render.yaml` is written but nothing is deployed, so
  the phone still needs the laptop switched on and on the same Wi-Fi, and the
  extension still points at `localhost:8787`.
- React 19 and Tailwind v4, where the spec said 18 and (implicitly) v3 — the
  butter theme's runtime requires React ≥19, and its Tailwind bridge is v4-only.
  The theme is a fixed requirement, so the versions gave way.
- Phase 7 (hat/scarf layering, the bag editorial shot) is not built.
