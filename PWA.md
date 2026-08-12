# PWA.md — Hanger on your phone

Companion spec to `AGENTS.md`. That file stays the authority on the server, the YouCam
contracts, the data model and the extension. This one covers the phone app only, and
defers to it everywhere they overlap.

**Build order is UI first.** Phases 0–1 produce something you can hold in your hand and
judge before a single line of it is wired to anything. Nothing after Phase 1 starts until
the look is signed off.

---

## 1. What we are adding and why

The hanger already lives on the server — SQLite plus a storage folder (`§6`). The Chrome
panel is a thin client over a REST API. So a phone app is not a second product; it is a
second client onto the same hanger.

Three things it does that Chrome cannot:

1. **You are in a shop.** The garment is in your hands, not on a product page. Photograph
   it and hang it.
2. **You are in an app.** A screenshot from Instagram, a friend's WhatsApp photo. Get it
   into the hanger without a laptop.
3. **You are showing someone.** The phone's own share sheet sends the outfit video to
   WhatsApp in two taps. On desktop this is a download and a drag.

Everything else — try-on, outfit chaining, video, alternatives — the server already does.
The phone asks for it the same way the panel does.

---

## 2. Repo layout

Third workspace, alongside the two that exist:

```
hanger/
  server/       unchanged — also serves the phone
  extension/    unchanged
  shared/       NEW — types + API client, one copy, imported by all three
  pwa/          NEW — the phone app
```

`shared/` is not optional bookkeeping. `extension/src/shared/types.ts` already carries the
comment *"Mirrored at server/src/types.ts — keep the two in sync."* Two hand-synced copies
is a chore; three is a bug waiting for the first new garment field.

### 2.1 Design system

Same rule as `§3.1`, same theme, run inside `pwa/`:

```bash
cd pwa
npx @astryxdesign/cli theme add butter
```

Build every screen from those tokens. Do not hand-roll colours or spacing alongside them.
If the CLI fails, stop and report rather than substituting a different system.

The layout constraint is different from the panel's, though. The panel is a 320–480px
column on a desktop viewport. The phone is a full device: safe areas, a thumb-reachable
bottom nav, a camera that opens fullscreen, and one-handed use as the default posture.
Reuse the panel's components where they fit, but do not assume the panel's layout is the
phone's layout.

---

## Phase 0 — Extract `shared/` *(plumbing, nothing visible)* — **done**

Move `types.ts` and `api.ts` into a `shared/` workspace. Extension and server import from
it. No behaviour changes anywhere; the extension must work exactly as it does now.

Done when: `npm run typecheck` passes at the root, the extension still loads and drives a
full try-on, and there is exactly one definition of `Garment`.

**~half a day.**

Shipped as `@hanger/shared`, and it took in more than planned once a second app made the
duplication obvious: the wire types, the API client, `format.ts`, the butter theme, and
the icon rasteriser. The server keeps its own `types.ts` for database rows — those
describe SQLite, not the wire, and no client should ever see them.

The client's `API_BASE` constant became `setApiBase()`. It had to: the panel's localhost
is right forever, and is wrong on a phone the moment you pick one up.

---

## Phases 1 and 2 — The whole app, on your real hanger ← *you look at it here* — **done**

*Built as one. The plan had Phase 1 on hardcoded sample garments, but the read-only
endpoints already existed, so faking them would have been more work than calling
`/garments` — and it would have shown you somebody else's hanger.*

Every screen, fully designed, reading from the running server. **No writes.** Nothing
here spends a credit or changes a row.

Screens:

- **Hanger** — the garment grid, category filters, empty state, and a sheet for one
  piece with what's known about it.
- **Outfits** — saved looks, and one full-screen: the composite, the video if the laptop
  made one, the buy list and the total.
- **You** — your photo, the server's address and whether it answers, mock-or-live, how
  to get the app onto your home screen.
- **Add** — the three routes in, as a sheet that says which phase brings each. Not dead
  buttons: the shape, labelled, so it can be judged before it's built.

Plus the parts that make it an app rather than a web page: web manifest, home-screen
icons (Android-maskable included), a service worker that caches the shell and never the
data, standalone display, safe-area insets, and a bottom tab bar under the thumb.

The one non-obvious piece was CORS. The extension talks to the server as an extension,
which plays by different origin rules; the phone is a plain web origin on the LAN, so the
server had to be told those are allowed. Cheap, and it fails loudly the first time.

**How to run it:** `npm run dev:phone`, then open the laptop's LAN address on port 5174
from the phone. The app works out the server's address from the host that served it, so
there is nothing to configure — and **You → Where the server is** overrides it if the
guess is ever wrong.

One caveat worth knowing now: over plain LAN http the browser blocks the camera. There is
no camera yet, so it doesn't bite — but Phase 4 needs either a local HTTPS certificate or
a deployed server. We'll deal with it there.

Done when: you can tap through the whole app on your own phone, looking at your own
hanger, and tell us what's wrong with it.

**~2 days for both.**

---

## Phase 3 — Pairing — **done**

Right now the server has one `person` and no notion of accounts. On your own network that
is fine. Before anything leaves the house it is not.

The cheapest honest version reuses machinery you already have: the extension shows a QR
code (as `handoff.ts` already does), the phone scans it and stores a device token, and the
server ties both clients to one hanger. Real email accounts with recovery are a bigger
job — worth doing later, not now.

Done when: a fresh phone shows an empty hanger until it scans the code, and your hanger
after.

**~1 day** for QR pairing. **2–3 days** if you want real accounts instead.

Shipped, with one thing turned around from the sketch above. **The six-character code is
the primary route and the QR is the shortcut**, not the other way round. Once the app is
on a home screen nobody opens a camera to scan anything — they open the app, and it has to
ask them something. The QR is for the phone that doesn't have the app yet, and it carries
the same code in `?pair=`.

The other decision worth writing down is what counts as proof:

- **The laptop proves itself by being the laptop.** The side panel reaches the server on
  loopback, and nothing else on the network can. So the panel carries no token and did not
  change when pairing arrived — see the note at the top of `server/src/auth.ts`.
- **A phone carries a token** it earned by repeating a code only somebody looking at the
  laptop's screen could know. Codes live in memory, last five minutes, are single use, and
  die after five wrong guesses. Tokens live in SQLite and outlive a restart.
- **Minting a code and revoking someone else's device are loopback-only.** A phone that
  could do either could quietly let in a second phone, which would make the code on the
  screen pointless. A phone may revoke itself, which is "Forget this phone".
- **`/media` is deliberately not behind the token**, because an `<img>` tag cannot send an
  Authorization header. The paths are random UUIDs, so the URL is the capability. That is
  a reasonable trade on your own Wi-Fi and **Phase 4 has to revisit it** before this is on
  the open internet.

Revoking from the laptop takes effect on the phone's next call, wherever it is: the shared
client turns a `not_paired` response into a single callback, and the app drops back to the
pairing screen rather than showing four screens' worth of the same refusal.

---

## Phase 4 — Accounts, and a home that isn't your laptop

**This moved to the front of the queue, ahead of every feature below it.** Not because
deploying is urgent, but because everything below it *writes data* — and right now there
is exactly one wardrobe on the server, belonging to nobody in particular. Build "hang it
from the shop floor" against that and it gets built twice.

Two things are true today that stop being true here:

1. **The phone needs the laptop switched on**, because the laptop is the server. That is
   where the server lives, not a design in the code: the two apps never talk to each
   other, only to the API.
2. **There is one hanger for everyone.** Fine when the only person who can reach the
   server is you. On a public URL, every judge would be looking at your clothes and at
   each other's.

### Signing in — Clerk, with Google inside it

Clerk rather than wiring Google ourselves, for two reasons that outlive the hackathon:

- **Subscriptions later.** Clerk has billing built on Stripe, so adding a paid plan is
  configuration rather than a second auth rebuild. That was named as a real requirement,
  and it is the kind of thing that is cheap to plan for and expensive to retrofit.
- **The extension.** Clerk ships a Chrome-extension SDK. Doing OAuth by hand inside an
  MV3 extension — `chrome.identity`, redirect URIs, token refresh in a service worker —
  is the fiddliest part of the whole job, and this deletes it.

Google is a provider inside Clerk, so this isn't a choice against Google sign-in. Email
sign-in can be switched on later without touching our code.

**Verify before building:** that Chrome-extension support and Clerk Billing are both
available on the plan we'd be on. If either needs a paid tier, that changes the sums and
is worth knowing on day one rather than day four.

### Progress

**4a — users and scoping: done.** A `user` table, a `user_id` on `person`,
`garment`, `outfit`, `tryon` and `device`, and every read and write scoped to
one person. `auth.ts` gained a single `currentUser()` that everything resolves
through — one place to be sure about rather than forty.

The scoping was threaded by *changing function signatures* rather than by adding
`WHERE` clauses by hand: `getGarmentRow(userId, id)`, `requirePerson(userId)`,
`startTryOn(userId, …)`. The compiler then found all ten call sites, which is a
much better auditor than a careful reading.

Verified by seeding a second user and confirming they see an empty hanger, and
that every id belonging to the first user comes back 404 — read, delete, hang,
video, alternatives and try-on alike.

One behaviour changed on the way: `DELETE /garments/:id` used to answer 204
whatever you gave it. Harmless with one wardrobe, a lie with several — it told a
stranger their delete had worked while doing nothing. It 404s now, like the
outfit route always did.

**4e — deploy config: done.** `render.yaml`, and the server can now serve the
built phone app from its own origin (`SERVE_PWA`), so there is one URL and no
CORS for the phone. Both paths the disk needs — the database and the image
store — were already environment variables, so pointing them at a mounted disk
is configuration rather than code.

**4c — signed image links: done.** `/media` was the one route a token could
never reach, because an `<img>` sends no headers. It now takes a signature the
server generated when it decided you were allowed to see the picture, and the
link expires after six hours. Signing happens inside `mediaUrl()`, so no route
can forget to do it — there is one function that turns a stored filename into a
link. Loopback is still waved through, on the same reasoning as everywhere else.

Tested from off-machine: signed link 200, no signature 404, tampered signature
404, and a genuinely expired-but-validly-signed link 403 with copy that says to
reload. A forgery gets the same answer as a file that doesn't exist, so guessing
teaches nothing.

**4d — per-person allowances: done.** Spend is recorded against whoever caused
it. Past their allowance nobody is refused — `youcam/engine.ts` puts them on the
sample path instead, watermarked, with everything else working normally. A wall
halfway through judging is worse than a watermark.

This was cheap for the reason the original build predicted: there was already
exactly one place that chose between mock and live, so this is one `if` in one
function. Threading the user to it cost more than the decision did.

The server's own `UNIT_BUDGET` stays as the backstop, and a video is checked
against what it actually costs (four units) rather than one — otherwise somebody
one unit from their limit could still spend four.

One consequence worth writing down: the local user gets **no** personal
allowance. Allowances hold visitors back from somebody else's account, and the
local user is that somebody — their limit is the `UNIT_BUDGET` they set. Without
that they'd inherit the visitor default and, having used the thing at all, be
over it immediately: their own spend from before allowances existed counted
against them.

**4b — Clerk sign-in: done across the server, phone and side panel.**

Signing in is optional by construction. With no secret key the server runs
exactly as it always has — one local user, no network, no accounts — which is
what a fresh clone should do. With a key, a Clerk session token identifies the
person and their wardrobe is found (or created) by the `sub` claim. There is no
sign-up step: the first request carrying a valid session is the sign-up.

Verifying a token is asynchronous and the route handlers are not, so an
`attachUser` middleware resolves the caller once, before the routes, and
`currentUser()` stays the plain function everything already calls.

**The loopback shortcut had to be made safe first, and this is the part worth
reading.** A hosting platform puts a proxy in front of the container, and
depending on the wiring the connection the app sees can *originate on loopback* —
at which point "only this machine can reach loopback" silently becomes "everyone
on the internet can", and every visitor is handed the local wardrobe. So a
request carrying any forwarded-for header is no longer treated as local
whatever its socket says. That is a property of the code rather than of
remembering to set a variable, which is the only kind of protection worth
having here.

On top of that, loopback stops counting as identity the moment sign-in is
configured, unless `TRUST_LOOPBACK` says otherwise. The server warns at boot
when that temporary development shortcut is on.

Verified: loopback trusted → 200; off-machine with nothing → `not_signed_in`;
a forged session token → refused; and a loopback request carrying
`X-Forwarded-For` → refused, which is the case that would have leaked.

The side panel uses Clerk's Chrome-extension SDK, passes fresh session tokens to
the shared API client, and has a header action that signs out only its current
session. A signed-out panel returns to sign-in; a new account with no person
photo continues into the existing onboarding flow.

### What changes in the database

A `user` table keyed on the Clerk user id, and a `user_id` on everything that is somebody's:
`person`, `garment`, `outfit`, `tryon`, `device`. Every query that reads them grows a
`WHERE user_id = ?`, which is the tedious, unskippable, easy-to-get-wrong part — a missed
one is somebody seeing another person's wardrobe.

`video_cache` and the chain cache stay global. They're keyed on the content hash of the
image being transformed, and that image contains your own photo, so a cross-user hit is
not a thing that can happen. Leaving them shared is a free saving.

Locally, the migration hands your existing wardrobe to a single local user, so nothing you
already have disappears.

### Images, properly this time

The open `/media` route I flagged in Phase 3 has to close. An `<img>` still can't send an
Authorization header, so the server **signs media URLs** — short-lived, generated when it
serialises a garment or an outfit. The client keeps doing exactly what it does now; the
URL it gets just expires. This is the honest fix and it's about half a day.

### Credits

Per-person, with a soft landing. Each account gets a small budget of real try-ons, and
once it's spent the results quietly become samples with the caption that already exists —
rather than a wall a judge hits halfway through reviewing.

This is cheap only because of how the server was built: `youcam/engine.ts` is already the
single seam between mock and live, so this becomes a per-request decision instead of a
global flag.

### The host — Render

A paid instance, not the free one, and this matters:

- **Free instances sleep.** A judge's first click would sit for ~30 seconds looking broken.
- **Free instances have no persistent disk.** The database and every stored image would
  vanish on each redeploy.

So: Render Starter (~$7/month) with a persistent disk (~$0.25/GB). Serverless hosts are
out of the question regardless — a try-on polls for up to five minutes, and they cut
requests off long before that.

The server should also **serve the phone app from its own origin**. Same origin means no
CORS for the phone at all, and one thing to deploy instead of two.

### The extension

Its `host_permissions` and API address move from `localhost:8787` to the real domain, with
a local override kept for development. It gains a sign-in screen, which it has never had.

**Schedule risk worth knowing now:** Chrome Web Store review for a new extension takes
days, sometimes longer. If there's a deadline, that queue is not something we control and
should be joined early.

### Done when

Two different people sign in from two different phones, on mobile data, with your laptop
shut, and each sees only their own wardrobe. And the extension, installed from the store,
talks to the same account.

**~6 days.** More than the 4–5 I estimated off the cuff — scoping every query to a user
and testing that nobody leaks into anybody else is the part that doesn't compress.

---

## Phase 5 — Hang something from the shop floor

The headline feature. Camera opens, you photograph the garment, you add what you know
(name, price, where), it hangs.

Most of this exists: `AddOwned.tsx` is the flow, `handoffPage.ts` already does phone
camera capture, and the upload route already accepts phone photos. This is largely
reassembly plus the garment-photo quality checks from `§5.4`.

The HTTPS problem from Phase 1 is already solved by the time we get here — Phase 4 put the
app on a real host, and a real host means HTTPS means the camera works.

Done when: you photograph something in a shop and it is in your Chrome hanger before you
leave.

**~1 day.**

---

## Phase 6 — Try on, build, generate

Wire the writes: run a try-on, build an outfit through the chain engine, generate the
video. The server already does all of it. The work is on the phone side — progress states
for tasks that take a minute, results that survive the screen locking, and fail-soft when
a step dies.

Done when: an outfit built entirely on the phone, video and all.

**~1 day.**

---

## Phase 7 — Share out

The phone's native share sheet, for both the outfit image and the mp4. WhatsApp,
Instagram, Messages, anything installed.

Genuinely easier here than on desktop — the platform does the work.

Done when: an outfit video reaches a WhatsApp thread in two taps.

**~half a day.**

---

## Phase 8 — Share in

A screenshot from another app becomes a garment.

**Android:** register as a share target. Screenshot in Instagram → Share → Hanger. Works
properly.

**iPhone:** Apple does not let web apps into the share sheet. Not a thing we can build
around. The fallback is opening Hanger and picking the screenshot from the photo roll —
one extra tap — with an optional Apple Shortcut for people who want the real thing.

Either way the screenshot arrives with no title, no price, no URL. Run it through the
Google Lens integration already built for alternatives (`§5.5`, `§10`) to guess what it
is, and let the user correct it.

Done when: a screenshot becomes a hanger entry with its details mostly filled in.

**~1.5 days**, split roughly evenly between the two platforms and the identification.

---

*(The old Phase 8, "off the laptop", is gone — it was absorbed into Phase 4. Deploying
stopped being the last thing once it turned out everything after it writes data.)*

---

## 3. What this adds up to

| | |
|---|---|
| Something you can hold and judge | Phases 0–1, **~2 days** ✅ |
| Real hanger on your phone, read-only | + Phase 2, **~2.5 days** ✅ |
| Only your phones can see it | + Phase 3, **~3.5 days** ✅ |
| Real accounts, live on the internet, extension published | + Phase 4, **~9.5 days** |
| Hang from a shop, try on, share to WhatsApp | + Phases 5–7, **~12 days** |
| Everything, screenshots included | + Phase 8, **~13.5 days** |

Call it **two and a half weeks** at the pace of the last few days, for something a
stranger can sign into and use. Phase 4 is the expensive one and it moved to the front on
purpose: it is the phase that decides whether everything after it has to be built once or
twice.

---

## 4. Out of scope

- App Store or Play Store builds. This is a PWA; if it earns a native app later, the
  server is already the hard part and it stays.
- Offline use beyond the app shell. The features that matter all need the server.
- Push notifications. "Your video is ready" is a nice idea and not a first-week one.
- A second design language. The phone uses butter, same as the panel.
