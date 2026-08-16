# Hanger, hackathon submission

Every field and question the submission form asks for, written out so it can be
pasted rather than composed the night before. **Track: Apparel Virtual Try-On.**

Anything in `[square brackets]` is something only you can fill in, like a link.

---

## 1. The short fields

**Project name**

```
Hanger
```

**Elevator pitch** (166 characters, under the 200 limit)

```
Try on any garment from any shop, keep them all in one place, and see a top from one shop with trousers from another in one image. Your wardrobe, not their catalogue.
```

Two alternatives if you want a different emphasis. Both are under 200 too:

```
Every try-on shows you one shop's catalogue. Hanger shows you your own wardrobe: clothes from three different shops, on you, in a single image, with one total to pay.
```

```
The question no shop will answer is whether this goes with what you already own. Hanger answers it: try on anything anywhere, and wear three shops at once.
```

**Built with** (tags, lowercase and comma separated)

```
youcam-api, perfect-corp, serpapi, typescript, react, vite, hono, sqlite, chrome-extension, pwa, tailwind, clerk, node
```

**Try it out links**

```
[GitHub repo URL]
[Demo video URL]
```

---

## 2. Features, functionality, and consumer or retail value

*This answers: "Provide a text description explaining the features,
functionality, and consumer or retail value of your project."*

### What it is

Hanger is a Chrome extension and a phone app that let you try clothes on from any
shop, keep everything you find in one wardrobe regardless of which shop it came
from, and see clothes from several different shops worn together in a single
image of yourself.

### The features

**Try on anything, anywhere.** You save one full-length photo, once. After that, a
*Try this on* button appears on any shop's product page you visit. Tap it and a
panel opens with the garment already read off the page, including its title, its
price, and the photos from that page with the most useful one already picked for
you. The try-on happens without leaving the shop's site, and you never upload
your photo to the shop.

**One wardrobe across every shop.** Anything you like, you hang. A tee from one
shop and a jacket from another sit side by side, each keeping its own price, its
own currency and a link back to where it came from. You can also hang things you
already own by photographing them, so the wardrobe on screen includes the
wardrobe in your bedroom.

**Outfits built from several shops at once.** Put a top from one shop, trousers
from another and shoes from a third into one outfit and get back a single image
of yourself wearing all three, plus a shopping list with a line per item and a
total across all the shops. Change one piece and it rebuilds. Turn the finished
outfit into a short video and send it straight to WhatsApp from the phone app.

**Finding the same thing cheaper.** For anything you're looking at, Hanger
searches for it elsewhere using the picture rather than the name, sorts what it
finds cheapest first, and lets you try the cheaper one on before you decide.

**It works on your phone too.** The same wardrobe, over the same server. The
phone adds three things a browser can't do: photograph a garment while you're
standing in a shop holding it, receive a screenshot shared from Instagram or a
link shared from anywhere, and push a finished outfit into WhatsApp or Messages
through the phone's own share menu.

### The value to a shopper

Clothing returns online run between 25% and 40%, and the reason given is nearly
always the same. The customer couldn't picture it on themselves, so they ordered
two and sent one back.

Virtual try-on already helps with that, but every version of it available today
lives inside one shop's own website, which means it can only show you that shop's
clothes. So it answers "how does this look on me" and stops there. The question
people are actually asking is bigger:

> Does this go with what I already have, and is there a cheaper one?

Hanger answers both halves. It sits above the shops rather than inside one, so it
can put a jacket from one shop over trousers from another and price the result.
That is a decision people currently make by ordering both, trying them at home
against things they own, and returning the loser.

### The value to retail

Three things follow from that, and they are worth more to shops than they might
first appear.

**Fewer returns, which is where the money is.** A return costs a retailer the
outbound shipping, the inbound shipping, the handling, and often the item's full
value if it can't be resold at price. Every purchase made with more confidence is
margin recovered.

**Better discovery than a catalogue can offer.** A shop's own recommendations can
only recommend that shop. Hanger's alternatives search runs on the picture, so it
surfaces smaller shops that would never have won the search term. A less
well-known brand appearing next to a big one, priced lower, is a genuine route to
customers that advertising currently gates behind budget.

**Real intent data at the outfit level.** Not "this person viewed a jacket", but
"this person put this jacket with those trousers and those shoes, and bought two
of the three". That is what a buyer actually wants to know, and no single shop
can see it.

**And a use for it beyond retail.** The same technology answers a question that
has nothing to do with buying: what do the clothes I already own look like
together? That's a wardrobe, a packing list, and an outfit for tomorrow morning.

---

## 3. About the project

### Inspiration

Shopping for clothes online means asking a question no shop will answer for you.
*Does this go with what I already have, and is there a cheaper one?*

Shops have every reason not to answer it. Their try-on shows their clothes, their
recommendations show their clothes, and the moment you leave the page all of it
is gone. So people order two, try them at home against things they own, and send
one back. Returns run between 25% and 40% in clothing, and the freight and the
landfill at the end of it are real.

The interesting part is that the missing piece isn't a technical one. The try-on
technology exists and it's good. What's missing is somebody standing above the
shops instead of inside one of them. A browser extension is exactly that, because
it already sits above every website by its nature.

### What it does

See section 2 above, which covers this in full.

The short version: try on any garment on any shop without leaving the page, keep
everything you find in one wardrobe, combine pieces from different shops into one
image with one total, and find the same garment cheaper elsewhere.

### How we built it

TypeScript from end to end. Hono and SQLite on the server, React and Vite in both
apps, the Astryx butter design system, and Clerk for optional accounts. The
try-on and the video both come from YouCam. Finding the same garment elsewhere
uses a picture search rather than a text one.

Four decisions shaped most of the code, and all four came out of reading the API
documentation carefully before writing anything.

**The API key never reaches the browser.** The API is built to be called from a
server, and a Chrome extension is a zip file anyone can unpack and read. So every
call goes through our own server and the extension never sees a key.

**Product images are never handed over as links.** The API will fetch an image
for you if you give it a link, but only if its servers can download that link.
Plenty of shops check who is asking and refuse anyone who isn't a real visitor.
So the code that runs inside the shop's page fetches the image there, where the
browser is an ordinary visitor because it is one, and sends the raw picture to
our server to upload properly. This is the only approach that works across shops
in general, and it's the most important detail in the build.

**Outfits are built one garment at a time, and the work is remembered.** The API
fits one garment per call, so an outfit is built in stages: the result of the
first garment becomes the starting photo for the second. Each stage is remembered
against everything that came before it, which means swapping only the shoes in a
three-piece outfit costs one call rather than three. That is what makes editing
an outfit feel free instead of expensive.

**Every result is saved immediately.** Results sit on YouCam's servers for 30
days behind links that expire. Keeping the link would leave a wardrobe full of
dead images, so the picture is downloaded into our own storage the moment it's
ready.

Two more things worth naming. There is **no special code for individual shops**.
The reader takes the page's own product information first and falls back to
reading the page itself, and the same code runs everywhere. It's tested against
nine pages saved from real shops. And because the documentation says trousers and
skirts need a photo of the garment being worn rather than a flat product shot,
the reader collects every photo on the page, ranks them by how likely each is to
show the garment on a person, and asks *"which photo shows this best?"* with the
right one already picked.

### Accomplishments we're proud of

- **A single image of a person wearing clothes from three different shops**, with
  a shopping list and a total. That image doesn't exist anywhere else, and it
  can't, because no shop would ever build it.
- **A fresh copy of the repo runs the whole product with no credentials at all.**
  Clone it, install, run, and every screen works on sample data.
- **The sample results are drawings rather than photographs**, a figure that
  gains one layer of clothing per garment. So sample mode genuinely demonstrates
  the thing the product is for, and nobody can mistake a sample for a real
  try-on.
- **Every failure has a human sentence and something to do next**, and you can
  force any of them with one command to check.
- **A second app on the phone** over the same wardrobe, including receiving
  shared screenshots on Android and sending outfit videos to WhatsApp.
- **One drawing behind every icon.** The extension icons, the phone icons and the
  button on shop pages all come from a single file.

### What we learned

That the hard part of virtual try-on isn't the try-on. The API is good and it
works. The hard parts were all the things around it: getting a usable picture out
of a shop that doesn't want to give you one, working out which of a page's twelve
photos is the one the model can actually use, making outfits cheap enough to edit
freely, and holding one person's identity together across a browser extension, a
phone and a server without ever putting a key somewhere a user could read it.

We also learned to write the constraints down before building anything. Three of
them would each have cost days if we'd found them late: shops blocking image
downloads, the worn-photo requirement for trousers, and the bag API not fitting
into the way outfits are built. They went into the specification as "read this
before writing code", and that section earned its place.

### What's next

- **Put it online.** The hosting configuration is written, so the phone stops
  needing the laptop switched on.
- **Publish the extension**, now that connecting a phone works without a hosted
  sign-in.
- **Fix the currency guessing on alternatives.** A foreign shop that doesn't say
  what currency a price is in currently gets stamped with the local one, and on a
  cheapest-first screen a wrong price sorts straight to the top.
- **Identify a shared screenshot** instead of asking about it, which needs a
  different route in, since picture search wants a public link and a camera roll
  photo doesn't have one.
- **Hats and scarves** as further layers. Bags stay separate, for the reason
  below.

---

## 4. The hackathon's questions

### Was there a moment where the API surprised you, in a good or a frustrating way?

**Both, and the good one mattered more.**

The frustrating one came first. The obvious way to use the try-on API is to hand
it a link to the product photo and let it fetch the image itself. That worked
perfectly on the first two shops we tried, and then failed on most of the
internet. What made it genuinely frustrating is that the failure came back as a
plain "couldn't download the image", which reads like our bug. We spent real time
checking our own request before realising the request was fine and the shops were
refusing Perfect Corp's servers. Retailers protect their images against being
fetched by anything that isn't a real visitor, which is a perfectly reasonable
thing for them to do and completely invisible from the API's error message. The
fix was to stop passing links at all, and instead grab the picture from inside
the shop's own page, where the browser is a real visitor.

The good surprise was bigger and it decided the project. Outfits here are built
one garment at a time, feeding each result back in as the starting photo for the
next. We honestly expected that to fall apart. Every generated image is a lossy
copy of the one before, so by the third garment we assumed we'd be looking at
mush, smeared faces, drifting colours, the usual. It held up. A result that goes
back in as a source comes out the other side with the first garment still intact
and the person still looking like themselves.

That is the entire reason this project exists in the form it does. If the third
pass had degraded, the cross-shop outfit would have been a nice idea in a
document and the product would have been just another single-garment try-on. The
model being stable enough to chain is what turned it into something worth
building.

One smaller surprise worth mentioning, in the documentation rather than the API:
the requirement that lower-body garments need a photo of the clothes actually
being worn, not a flat product shot. It's stated plainly, which is more than most
APIs do, and finding it early changed the design of the whole page reader. If we
had found it in testing instead, it would have cost days.

### Where did you hit a wall technically, and how did you work around it?

**Three walls, and the way round each one shaped the product.**

**Shops refusing to hand over their images.** Described above. Retail image
servers check who is asking and turn away anything that isn't a browser with the
right history behind it, so passing a product photo's link to the try-on API
fails on most of the internet. The way round was to move the job into the shop's
own page. The code running there fetches the picture as an ordinary part of the
page loading, which it is, then sends those raw bytes to our server, which
uploads them properly. Nothing about the shop needs to cooperate, and it works
anywhere without writing special code per retailer.

**The API fits one garment at a time, and the product is about several.** The
whole idea is a top from one shop with trousers from another, so a single-garment
API is a wall by definition. The way round was to build outfits in stages, using
the result of one garment as the starting photo for the next. That worked but was
expensive, because a three-garment outfit is three calls and editing one item
meant paying for all three again. So each stage is remembered against everything
that came before it rather than against the garment alone. Swapping only the
shoes now costs one call, because the top-and-trousers stage already exists. That
turned outfit editing from something you'd think twice about into something you
can play with, which is the difference between a demo and a product.

**Signing in from inside a Chrome side panel.** This one cost the most time for
the least glamorous reason. Chrome's extension rules forbid the kind of loaded-in
code that sign-in with Google and sign-up security checks both need. So a sign-in
form inside the panel can only ever offer the half of sign-in that doesn't
include Google, which is the half nobody uses. We built two versions and threw
both away. The second one worked by handing off to a hosted web app, which
brought its own tail of problems: a server that has to be running, cookies
crossing between addresses, and an extension ID registered in advance.

The way round was to stop trying. The panel now does what a phone does. It shows
six characters that only somebody already signed in could be looking at, and gets
back a token it keeps. No sign-in form, no hosted page, no browser rules to fight.
The server needed no changes at all, because connecting a phone already worked
exactly this way. The lesson was that we'd been solving the wrong problem for two
days: the panel never needed to sign anybody in, it only needed to prove it
belonged to somebody who already had.

**And one wall we didn't get round, which is worth being honest about.** Some
shops can't be read from a link at all. Gap builds its product pages entirely in
the browser, so the page a server receives is an empty shell with nothing in it.
H&M refuses a request from a server outright. There is no clever fix for either
that doesn't involve running a full browser on our side, which is a different and
much more expensive product. So the app says what happened in a plain sentence
and offers you the camera instead. It never spins forever and it never pretends.

### Are there industries or use cases the Perfect Corp API could serve that nobody is talking about yet?

**Secondhand clothing is the obvious one, and nobody seems to be building it.**

Every conversation about virtual try-on assumes a retailer with a product
catalogue, professional photography and multiples of every size. Resale has none
of those things. A listing on Vinted or Depop or eBay is one badly lit photo of a
garment on somebody's bedroom floor, described by a person who isn't a copywriter,
in one size, with one of them in existence.

That combination makes it the highest-uncertainty clothing purchase there is, and
the least served. And unlike retail, you can't order two and return one, because
there is only one and returns often aren't offered. So the buyer is guessing
completely.

It's also the market where being able to see it matters most for reasons beyond
convenience. Resale is where price-sensitive shoppers actually are, and where the
environmental argument for buying used gets undone every time an item is bought,
disliked and thrown away. Try-on on a secondhand marketplace would do more good
per call than try-on on a luxury retailer's site, and it's a bigger market than
people assume.

**Charity shops and physical secondhand, which is stranger and better.** The
photo problem disappears entirely when you're standing in front of the rail. A
phone camera plus try-on means you can see yourself in six things from a charity
shop rail without joining the fitting room queue, and charity shops rarely have
fitting rooms worth queueing for anyway. That's a genuinely new behaviour, not a
digital copy of an existing one.

**Accessibility, which almost nobody frames this way.** Physical fitting rooms
are treated as a convenience, but for a lot of people they're a barrier: anyone
with limited mobility, anyone in chronic pain, anyone recovering from surgery,
anyone whose relationship with mirrors and changing rooms makes the whole
experience something to be endured. Try-on is usually sold as saving time. For
those people it isn't about time at all, it's about whether shopping for clothes
is possible on their own terms. That's a much stronger story than the one being
told, and it needs no new technology, only different framing.

**Uniforms and workwear, which is unglamorous and enormous.** Choosing a uniform
for four hundred staff currently means ordering sample sets, circulating them,
and collecting opinions over weeks. Hotels, airlines, hospitals, schools and
restaurants all do this. Showing a hundred staff members themselves in three
proposed uniforms, before anything is manufactured, replaces a genuinely painful
process. The same is true of costume departments in film and theatre, and of
school uniform suppliers dealing with parents who would rather not spend a
Saturday in a queue.

**Remote personal styling.** Styling services currently work by shipping a box of
clothes to somebody, who tries them on and sends most of them back. That model is
built entirely around the return. A stylist who can assemble a look across
several shops and show the client that look on themselves, before anything ships,
has a fundamentally better business, and one that isn't losing money on freight.

The through-line in all of these is that the interesting uses aren't inside big
retailers. They're in the places where the item is unique, where there's no
photography budget, where trying it on physically is difficult or impossible, or
where the thing being decided is being decided for lots of people at once.

---

## 5. The demo video

**Three minutes maximum.** Judges aren't required to watch past it, so the thing
that makes this different goes early. The cross-shop moment is at 0:55, not at
the end.

| Time | Shot | Note to self |
|---|---|---|
| 0:00 to 0:15 | The problem, in one sentence: *"You can't tell how it'll look, so you buy two and return one."* | Over a plain title card or the mark. No stock footage. |
| 0:15 to 0:30 | Setup: one photo, done. | Show how little it asks for. |
| 0:30 to 0:55 | A real shop's product page, the button, try on a jacket, the result. | **Name the API on screen:** AI Clothes Virtual Try-On. |
| 0:55 to 1:20 | **Go to a different shop.** Try on trousers. | **Keep the address bar visible through the cut.** This is the shot that wins it. The judge has to see the website change. |
| 1:20 to 1:50 | The outfit screen: combine both, the composed image, the shopping list and the total. | Hold on the total. Two shops, one number. |
| 1:50 to 2:20 | Alternatives: the same jacket cheaper elsewhere, try the cheaper one on, compare. | Show the price difference clearly. |
| 2:20 to 2:40 | Your Hanger, full of things from several shops. If timing allows, the phone sending an outfit video to WhatsApp. | The phone shot is a strong closer. |
| 2:40 to 3:00 | The line: *your wardrobe, not their catalogue.* | Mark, line, repo link, on screen long enough to actually read. |

**Before you record:**

- Sample mode off, with a real API key. Judges can tell, and the sample results
  say "sample" on them by design.
- Set the per-visitor limit to zero in `server/.env`. The default exists to stop
  a stranger draining the account on a public demo, and while recording it's the
  account's owner who needs to generate.
- Check what budget is left before you start, not after.
- Do the whole run once first. Work that's already been done comes back
  instantly, which keeps the video moving.
- Clean browser profile. No other extensions, no bookmarks bar, no tabs with your
  email in the title.
- **No copyrighted music.** No brands on screen beyond the shop pages you're
  incidentally browsing.

---

## 6. What a judge should do, in order

Paste this into the "how to test it" field. It's at the top of the README too.

```
1. git clone <repo> && cd hanger && npm install && npm run dev
   No credentials needed. Sample mode runs the whole product on sample data.

2. chrome://extensions, turn on Developer mode, Load unpacked, and choose
   extension/dist (not extension/). Pin it.

3. Add a photo in the panel. Any full-length photo, or use
   server/fixtures/person-sample.svg.

4. Open any shop's product page and click the "Try this on" button.
   Try it on, then Hang it.

5. Go to a DIFFERENT shop. Hang something from a different category.

6. Outfits, build one, put both garments in it.
   This screen is the submission: one image, two shops, one total.

7. Swap one item. The server log says CACHE HIT, because only the part
   that changed is recalculated.

8. Open a garment, then Alternatives. Cheapest first, with working links.

Optional: npm run dev:phone, then open http://localhost:5174 in a
phone-shaped window. Same wardrobe, on a phone, nothing to connect.
```

---

## 7. How this maps to the four judging criteria

| Criterion | The claim | The evidence |
|---|---|---|
| **Technological Implementation** | This is not one API call behind a button. | Outfits built from several garments with the work remembered, so an edit costs one call instead of three. Product images fetched from inside the shop's own page, which is the only thing that works across shops in general. Ranking a page's photos to find the one the model can use. Searching for the same garment elsewhere by picture. A spending limit that actually stops. One place in the code that decides whose wardrobe a request is for. |
| **Design** | A complete product, not a demo. | Onboarding, the wardrobe, the outfit screen, alternatives, real empty and loading and failure states, a second app on the phone, three accent colours, one drawing behind every icon. Every failure gives a human sentence and something to do next, and each one can be forced on demand to check. |
| **Potential Impact** | Fewer returns, and a decision no shop will serve. | Clothing returns run 25% to 40%, driven by not being able to picture it. Hanger answers the question people are actually asking, which is structurally impossible inside a single shop. |
| **Quality of the Idea** | Combining clothes across shops, plus finding them cheaper. | Lead with the three-shop outfit image. The try-on is what makes it possible. The cross-shop wardrobe is the product. |

---

## 8. Checklist before submitting

- [ ] Repo is public, and the README looks right on GitHub
- [ ] All screenshots in place, see [docs/ASSETS.md](docs/ASSETS.md)
- [ ] Demo video uploaded, **under three minutes**
- [ ] Video link opens in a private browsing window
- [ ] Clone, install and run tested in a **fresh empty folder** with no settings
      file
- [ ] `server/.env` is not committed
- [ ] `grep -ri "youcam_api_key\|Bearer " extension/dist/` returns nothing
- [ ] A LICENSE file exists
- [ ] Name, elevator pitch, description, tags, repo link, video link all filled
      in
- [ ] All four written questions answered, from section 4 above
- [ ] Track selected: **Apparel Virtual Try-On**
- [ ] Submitted before **17 August 2026, 11:45 EDT**, which is **17:45 South
      African time**
