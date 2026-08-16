# Screenshots and illustrations, and where they go

Every image the README refers to, in the order it needs them. Drop a file into
`docs/assets/` with the exact filename below and it appears, because the markdown
is already written and pointing at it.

None of this blocks the submission. The README reads fine with images missing, so
if time runs short, do the five marked with a star and leave the rest.

---

## Before you start

**Pick an accent colour and keep it the same in every shot.** A set of
screenshots that changes colour partway through reads as three different
products. Blue is the default and it's what the button on shop pages uses, so
unless you prefer pink, shoot everything in blue and let the one accent
screenshot show that the others exist.

**Use the same two shops throughout.** Pick two that look visibly different from
each other and stick with them across the try-on, wardrobe and outfit shots. The
story is much easier to follow when the same jacket keeps appearing.

**Hide your own life.** No bookmarks bar, no other extensions pinned, no tab
titles with your email in them. Use a clean Chrome profile.

**Sizes.** The panel is narrow, so most shots are portrait. GitHub shows README
images at about 850px wide, so anything wider than about 1700px is wasted. Export
at twice the display size and no more.

**Format.** PNG for anything with interface in it. JPG only for photographs.

---

## The list

### ★ 1. `hero.png`, the top of the README

The single most important image. Landscape, about 1600 by 900.

A browser window showing a real product page with the Hanger panel open beside
it, displaying a finished try-on. The address bar has to be visible and readable,
because the whole pitch is "this works on somebody else's site" and the address
is the proof.

If you can, use the wider composition: shop page on the left, panel on the right,
a little desktop showing so it reads as a real screen rather than a mockup.

### ★ 2 to 5. The four features

Portrait, about 800px wide each. These sit in the table near the top of the
README.

| File | What to capture |
|---|---|
| `tryon.png` | A try-on result in the panel, with the garment title and price visible |
| `hanger.png` | Your Hanger with **at least four garments from at least three different shops**. This one carries the whole argument, so make sure the shop names are readable |
| `outfit.png` | A finished outfit: the composed image on top, the shopping list and total underneath. Get the total in frame |
| `alternatives.png` | The alternatives list, cheapest first, with prices visible |

For `hanger.png` and `outfit.png`, scroll so the interesting part is centred.
Don't hand over a screenshot where the total is cut off at the bottom.

### 6. `load-unpacked.png`, the install step

Landscape, about 1200px wide. The `chrome://extensions` page with Developer mode
on and the Hanger card loaded. Someone who has never loaded an extension this way
gets to confirm they're in the right place. Crop your other extensions out.

### 7. `mock-drawing.png`, what sample mode looks like

Portrait, about 800px wide. A three-garment sample result: the drawn figure
wearing three layers, with the "Sample result, no API credits used" caption
visible.

Worth including precisely because it's honest. It shows a judge exactly what
they'll get on a fresh copy, and it proves the outfit building is real even
without credits.

### 8. `image-strip.png`, choosing the photo

Landscape or square, about 900px wide. The *"Which photo shows this best?"* row,
with several product photos and the worn shot already picked.

Ideally shot on **trousers or jeans**, because that's where it actually matters.
The README explains that flat product shots fail for lower-body clothes, and this
picture proves the product handles it.

### ★ 9. `phone.png`, the phone app

Three phone screenshots side by side on a plain background, or one wide image.
Each screen about 400px wide, portrait.

The three that tell the story:

1. **Your Hanger** on the phone, the same wardrobe on a different device
2. **The camera screen**, ideally mid-capture, for hanging something in a shop
3. **The share menu** with WhatsApp visible, sending an outfit

Phone frames are optional and do look better. If you use one, use the same frame
for all three.

### 10. `pairing.png`, connecting a phone

Portrait, about 700px wide. The connect screen with the six characters and the QR
code visible.

**Regenerate the code after you take the screenshot**, or blur it. It expires,
but publishing a live code to a public repo is a needless thing to have done.

### ★ 11. `accents.png`, the three colours

Landscape, about 1400px wide. The *same screen*, and Your Hanger works well for
this, in blue, pink and mono, side by side and labelled.

This is a disproportionately strong image for the design score. It says somebody
thought about the system, in a way that no amount of writing does.

### 12. `badge.png`, the button on a shop's page

Small landscape crop, about 600px wide. A close crop of the *Try this on* button
sitting at the bottom right of a real product page, with enough of the page
around it that it's obviously not our own surface.

Zoom in enough that the hanger mark inside the button is readable, since the
README calls that detail out.

---

## Already in the repo, don't redraw these

| Asset | Where it is | What uses it |
|---|---|---|
| The hanger mark | `shared/assets/logo/hanger-mark.svg` | The README header, already wired up. Every extension and phone icon. The button on shop pages |
| Garment drawings | `shared/src/illustrations/` | The in-app guidance on how to photograph something |
| Sample person | `server/fixtures/person-sample.svg` | Sample mode, and any judge who'd rather not upload a photo of themselves |
| Sample garments | `server/fixtures/garment-*.svg` | Sample mode |

The mark is already referenced at the top of the README, so it shows up on GitHub
with no work from you.

---

## For the submission gallery specifically

The submission form has its own gallery, separate from the README, with its own
requirements.

**Cover image, 1200 by 630.** This is the thumbnail everywhere the project gets
shared, so it's worth ten minutes on its own. Best option is the three-shop
outfit image with the mark and the line *your wardrobe, not their catalogue*. If
you'd rather use an interface shot, the hero cropped to 1200 by 630 works.

**Gallery images** show in the order you upload them, so lead with the payoff:

1. The three-shop outfit with its shopping list (`outfit.png`)
2. The hero shot (`hero.png`)
3. Your Hanger across several shops (`hanger.png`)
4. Alternatives (`alternatives.png`)
5. The phone (`phone.png`)
6. The three colours (`accents.png`)

**Captions matter more than you'd expect**, because a judge scrolling the gallery
may never open the repo. Write one line per image, and make the first one say the
thing outright: *"One image. A top from one shop, trousers from another, shoes
from a third."*

---

## One note on which outfit image you choose

Whichever composed image ends up in the hero, the gallery and the video, pick one
where **the two garments are visibly from different shops**. Different enough in
style that nobody assumes they came from the same catalogue. A black tee with
black trousers is technically the same achievement and reads as nothing at all.
