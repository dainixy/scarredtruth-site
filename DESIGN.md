# SCARRED TRUTH — Design System ("Daybreak")

**Identity in one line: warm paper at first light — the interface is a well-set page, not
an app. It never raises its voice over the writing, and the marks it does show (the seam,
the tear, the scar) are kept on purpose, because scar tissue grows back stronger than skin
that was never cut.**

**Decision order, always: outcome → structure/IA → interaction → visual polish. Never start
with styling.**

Every color, size, duration and radius on this site comes from this file. If a value isn't
here, it doesn't exist. Read this fully before writing a line of markup.

The stylesheet is `docs/site-assets/scarred-light.css` and it is **shared by all six pages**.
Every edit to it is a site-wide edit.

---

## §1 · Surfaces & depth

Daybreak is a **warm paper** canvas, not a UI. Depth is stepped through a short ramp plus
hairlines.

```css
--paper:   #F7F2E9   /* the page — warm cream */
--paper-2: #FFFDF8   /* raised — cards, notes, the things laid ON the paper */
--line:    #E7DCC9   /* hairline */
--line-soft:#efe7d8  /* the quieter hairline — section edges */
```

First paint must be `--paper`. No white flash, ever.

### ✦ RATIFIED EXCEPTION — shadows and lifts on cards ✦

Most modern design systems ban shadows on in-flow cards. **Daybreak keeps them, on purpose.**

The ban is correct on a dark ramp: on near-black, a shadow is invisible, a "lift" has to be
faked with a lighter surface, and any shadow you *can* see reads as a lie. Depth there comes
from stepping surfaces.

Daybreak is the exact inverse. On **paper**, depth is not a metaphor — it is the literal
physics of the material. Every card here is a piece of paper, a photograph, a note laid on a
desk at 2am. Take the shadow away and the card stops being an object *on* the page and
becomes a hole *in* it.

Bounded, and the bounds are law:

- **Exactly two shadow tokens exist.** No third.
  ```css
  --shadow:     0 1px 2px rgba(70,45,20,.04), 0 16px 40px rgba(120,80,40,.07);
  --shadow-lift:0 1px 2px rgba(70,45,20,.05), 0 28px 56px rgba(120,80,40,.13);
  ```
- **Both are warm-tinted.** Never grey, never black, never colored.
- **Soft-and-wide, never hard-and-tight.** 16–56px blur, ≤13% alpha.
- **Elevation must mean something.** Raised = interactive or floating. Never for looks.
- **`box-shadow` is never a border, a ring, or a glow.**
- The hover lift is `translateY(-4px)` + an opacity-faded pseudo-element carrying
  `--shadow-lift` — **never a transitioned `box-shadow`** (§7).

---

## §2 · Text tones

Four, each with a job. **Hierarchy comes from weight + tone dimming, not from more sizes.**

```css
--ink:      #2A231D   /* 13.88:1 — headings, the sentence that matters */
--ink-2:    #5C5045   /*  7.00:1 — body prose */
--dim:      #6B6052   /*  5.51:1 — metadata, captions, labels */
--gold-deep:#7A4F12   /*  6.37:1 — ZANE'S OWN EMPHASIS (see §3) */
```

All four clear WCAG AA on `--paper`. **Floor: 11px rendered. No exceptions.**

---

## §3 · Accent — one color, one material, one voice

Daybreak looks like it has eight accents. **It has one.** The confusion is a naming failure,
and this section fixes it. Three different *kinds* of color are in play, and each obeys a
different law.

```css
--ember:      #A8512F              /* THE ACCENT   — 4.85:1 on paper */
--ember-tint: rgba(168,81,47,.10)  /* selected/active fills only */
--gold:       #C9A05A              /* THE MATERIAL — 2.17:1. Cannot carry text. Ever. */
--gold-deep:  #7A4F12              /* THE VOICE    — 6.37:1. A text tone (§2). */
```

### `--ember` is the accent
**Its job description: the thing you do, or the thing you touch.** It may appear as:

1. the single money CTA per viewport region (the quiz button, "Talk to Zane"),
2. the one interactive affordance inside a content object,
3. **state** — an active nav item, a selection ring + `--ember-tint` fill,
4. the *one* eyebrow that sits directly above a money CTA. Not the other five.

**Ember is BANNED from:** decorative rules, dividers, bullets, list markers, the seam, idle
waveform bars, hover states (hover is `--ink`), focus rings (focus is a 2px `--ink` ring),
chapter marks, progress bars, glows, gradients, and **any text sitting over a photograph.**

**Target: under 2% of any screen's pixels.**

> Ember has **0.35 of contrast headroom** above the AA floor. That is the entire reason for
> the ban list: the second it leaves flat paper, it fails. Measured over the site's own
> illustrations — 3.81:1 over `carry.webp`, 4.16:1 over `steady.webp`, 4.33:1 over
> `journey.webp`. **Ember over an image is a WCAG failure by construction.** Either the
> scrim's alpha under the text is ≥0.94, or the text is `--ink-2`.

### `--gold` is a material, not a color
It is the gold thread stitched through the paper: the seam, the chapter rule, the medallion
edge, the card border. **At 2.17:1 it is physically incapable of carrying text — and that is
not a defect, it is what a thread is.**

`--gold` may never be: text, a meaning-bearing dot, an icon, a progress fill, a focus ring,
or any part of a control whose color communicates. Where gold needs to *speak*, it becomes
`--gold-deep`. (The CSS already half-knows this: `.gold { color: var(--gold-deep) }`.)

### `--gold-deep` is a text tone, not an accent
It belongs to §2. It is **Zane's own emphasis** — drop caps, roman numerals, the one bolded
phrase in a pull-quote, the italic anchor line. It fills nothing. It is `--ink` with a raised
voice, and it must read as *the writing*, never as *a button*.

### The one-sentence law
> **The material never carries text or state. The voice never fills a surface. The accent
> never decorates.**

### Semantic colors own exactly one meaning each
The archetype-family colors are a **taxonomy**, not accents. Each means one family forever,
and is *always* paired with its name — never color alone.

```css
--fam-vanish: #A1493A  on --bg-vanish #F4E5DE   /* invisible, lost      — 4.85:1 ✓ */
--fam-rest:   #8A6212  on --bg-rest   #F6ECD3   /* never, critic, impostor — 4.65:1 ✓ */
--fam-measure:#515F77  on --bg-measure#E4E8EE   /* pleaser, behind      — 5.25:1 ✓ */
--fam-dream:  #7E6010  on --bg-dream  #F7EDD2   /* steady               — 5.04:1 ✓ */
```
> `--fam-dream` was `#93701A` = **3.94:1 — a real AA failure**, rendered at 9.5px. Darkened
> to `#7E6010`. Fix pending site-wide (it does not appear on the story page).

**`--oxblood` is retired.** One usage site-wide, no job, redundant with ember.
**`#BC6A43` is retired** — the pre-darkening ember, 3.57:1, a dead color still walking around
in the markup.

---

## §4 · Typography

Three families, five faces. **Self-hosted, same-origin, subsetted. An `@import` of a font
service is banned outright** (§9).

```css
--display: 'Fraunces'          /* roman + italic — headlines, drop caps, pull-quotes, numerals */
--body:    'Newsreader'        /* roman + italic — prose. Axis MUST reach 700. */
--mono:    'Spline Sans Mono'  /* roman only — eyebrows, labels, buttons, timestamps */
```

`Caveat` is a **fourth family** and does not belong in the shared stylesheet. It is used by
two pages only; it is declared on those pages or not at all.

> **Faux-bold bug:** the axis must reach every weight the CSS asks for. Newsreader was served
> at `400;500` while every `<strong>` in prose asks for 700 — so the browser *synthesized* it.
> Every bolded word in a 3,000-word serif essay was a smeared stroke. Serve `400..700`.

### The scale (px) — no other sizes exist
```
11 · 12 · 13 · 15 · 17 · 19 · 22 · 26 · 32 · 40 · 52 · 68
```
**Both the min and the max of any `clamp()` must be on the scale.** The fluid middle is free.

- Body 19/1.7. Long-form prose 19/1.8.
- **Line length 50–75 characters.** The reading column is 640px, not 680.
- Sentence case everywhere. UPPERCASE only on mono labels (11–12px, tracked ≥.14em).
- **Never letter-space lowercase text.** Tracking is for caps.
- Display sizes ≥26px get tightened line-height (~1.1–1.3) and −0.014em tracking.
- Fraunces is for headlines, drop caps, pull-quotes, numerals and the sign-off. **Not body copy.**

---

## §5 · Spacing, layout, radii

### Spacing scale — no other values exist
```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128
```
4px is the micro step, for icon-to-label gaps only.

### The unit-block rule (the highest-leverage rule in this file)
> **Space inside a group is always smaller than space between groups. Whitespace separates;
> borders are a last resort.**

On a long-form page the ladder is:
```
paragraph → paragraph        24
chapter body → chapter mark  48
section → section            80
band → prose                 96
```

### Layout
- `--maxw: 1140px` · `--read: 640px` (the reading column) · gutter 24px.
- 12-col desktop, 4-col mobile. **One alignment strategy per screen.**
- **Touch targets ≥48px.**

### Radii — bound set, no other values exist
```css
--r-tag:     4px   /* mono badges, chips — the printed-label feel */
--r-control: 4px   /* buttons, nav CTA, inputs, the skip link */
--r-card:   16px   /* every card, panel, note, the CTA card */
--r-round:  50%    /* medallions, nodes, dots, the play button, avatars */
```

---

## §6 · Components

**Buttons — three tiers. Paired actions are inverse + quiet, never two accents.**

| Tier | Looks like | Rule |
|---|---|---|
| **accent** | `--ember` fill, `#fff` text (5.41:1) | **Max ONE visible per viewport region.** The money CTA only. |
| **inverse** | `--ink` fill, `--paper` text | The primary in-flow action. Chromatically neutral — it never competes with the accent. |
| **quiet** | text + hairline underline on hover, `--ink-2` | Everything else. |

Every component specs **default / hover / active / disabled / loading / error at design time.**
Focus is always `outline: 2px solid var(--ink); outline-offset: 3px` — **never the accent.**

- **Card scrim over an image:** a multi-stop eased gradient. If you can see where the gradient
  starts, add stops. **If text sits on it, the alpha under that text is ≥0.94** (§3).
- **Overflow is always designed** — 2-line clamp + "see more", or N-visible + "+K more". Never
  a raw truncation.
- **Empty states are doorways** — render the action that fills the space. Never a grey
  "nothing here yet."
- **Media:** audio/video is `preload="none"`, the duration is **hardcoded in the markup**
  (with `preload="none"`, `duration` is `NaN` until first play), and a transport for anything
  over ~60s means a real scrubber — a native `<input type="range">`, which gives keyboard,
  touch-drag, click-to-jump and `role="slider"` for free.

**Signature objects (do not improvise around them):** the seam (gold stitch), the tear (cream
feather), the chapter medallion + roman numeral, the drop cap, the pull-quote band, the
cinematic illustration band, the transformation map, the unified `footer.bigfoot`.

---

## §7 · Motion

**Durations — three, plus one narrative:**
```css
--t-micro: 120ms   /* press, hover, focus */
--t-base:  200ms   /* state changes, open/close */
--t-over:  300ms   /* the mobile nav sheet */
--t-narr:  700ms   /* THE REVEAL — and nothing else */
```
**One curve:** `--ease: cubic-bezier(.2, .7, .2, 1)`. `linear` is permitted for exactly two
things: the reading-progress bar, and a loading spinner (a spinner on an easing curve reads
as broken).

**Animate `opacity` and `transform`. Nothing else. Ever.**

Explicitly banned as transition/animation properties: `width`, `height`, `top`, `left`,
`box-shadow`, `filter`, `background`, and bare `transition: <time>` (which means `all`).

- The progress bar animates `transform: scaleX()`, **never `width`** — `width` is layout +
  paint on every scroll frame, on the longest page on the site.
- Hover color changes **snap**, or fade an overlay's `opacity`. They are not transitioned.

### ✦ RATIFIED EXCEPTION — scroll-triggered reveal ✦

Most systems ban scroll-triggered animation. **Scarredtruth keeps it, on purpose.**

The ban is correct for an app: motion there is *feedback*, and a fade-on-scroll is decoration
that delays content the user asked for. Scarredtruth is a **reading** product — a 3,000-word
confession told in six chapters. The `.reveal` fade is not decoration; it is **pacing**. It is
the design's only instrument for making a reader *arrive* at a line rather than scan past it:
the paragraph, the pull-quote and the seam land one beat after the eye does. That is the same
job a page-turn does in a book, and a book does not apologize for it.

Bounded, and the bounds are law:

1. **`opacity` + `translateY(≤22px)` only.** No scale, no blur, no parallax, no rotation.
2. **One duration (`--t-narr`), one curve.** Not `.7s`/`.8s`/`.9s`/`1s`/`1.2s` across four
   selectors — that is drift, not a system.
3. `threshold: .14`, fires once, `unobserve` immediately.
4. **Never on the hero. Never above the fold. Never on the LCP element.** Chrome does not
   count `opacity:0` paints toward LCP. You do not gamble on the LCP element.
5. **The content must be readable with JavaScript off.** `.reveal{opacity:0}` with no fallback
   means one failed script hides the entire essay. Ship
   `<noscript><style>.reveal{opacity:1;transform:none}</style></noscript>`. This is a
   **correctness** requirement, not a nicety.
6. **`prefers-reduced-motion: reduce` turns ALL of it off — including ambient looping motion.**
   The exception buys the reveal. It does not buy a 7s infinite float. Vestibular users get a
   still page, full stop.

Motion exists for feedback, orientation, and — here alone — **pacing.** When in doubt, don't
animate.

---

## §8 · Voice & copy

**Copy is a design material.** It is drafted, not filled in.

- **Zane speaks in the first person. The chrome around him never does.** Nav, buttons, form
  labels, error messages and empty states are the *site* talking, and the site is plain, warm
  and never in character.
- Zane's voice is governed by the plain-language laws: short words, one idea per line, no
  therapy-speak, no hype, no FOMO, no emojis. Faith is a quiet floor, never a lecture.
- Buttons say **exactly what happens** — "Find out which one you are", not "Submit".
- Trust microcopy sits **at the anxiety point** (next to the button, not in the footer).
- Crisis safety: where the content touches self-harm, 988 is named. Non-negotiable.

---

## §9 · Performance budget — hard gates

**Page < 1.5 MB · JS < 300 KB compressed · above-fold images < 500 KB · fonts ≤ 140 KB ·
LCP < 2.5s · CLS < 0.1 · INP < 200ms.**

These are blockers, not aspirations. A page that misses one does not ship.

**Fonts — ≤140 KB, and why it's 140 and not the usual 100.** Scarredtruth is a *reading*
product; the type **is** the product. Four typographic voices — display roman, display italic,
body roman, body italic — plus mono is the minimum for long-form literary prose, because
**italic here is prose semantics, not decoration.** Properly subsetted, that floor is ~135 KB.
We buy the extra 40 KB out of the image budget. Faking a 100 KB number by dropping italics
would be lying to the spec.

- **`@import` of a font service is banned outright.** It serializes HTML → CSS → Google's CSS
  → font across two extra origins. The four-family `@import` at the top of `scarred-light.css`
  cost **371.8 KB** and 600–1,000ms of render-blocking time. It was the single worst line of
  code on the site.
- Self-host, subset, `crossorigin`-preload exactly the **two** above-fold faces. Not five.
- `font-display: swap` **plus a metric-matched fallback** (`size-adjust`/`ascent-override`
  against Georgia). A 3,000-word essay reflowing on font swap **is** the CLS bug.

**Images.** WebP/AVIF. **Explicit `width` + `height` on every `<img>`.** `loading="lazy"
decoding="async"` on everything below the fold. `fetchpriority="high"` on the LCP image and
nothing else. **An image's file size must be proportionate to its rendered size** — a 34px
medallion may not be a 27 KB photograph; an 84px avatar may not be 130 KB.

**JS.** No frameworks. No animation libraries. No carousels. Third-party scripts require
sign-off and must be `defer`/`type=module`.

**Streamed media is off page-weight budget, but capped:** `preload="none"` always · **≤4.5 MB
per asset** · Opus/WebM first with an MP3 `<source>` fallback (the browser selects by *codec
support*, not bandwidth — there is no such thing as an adaptive `<audio>` bitrate tier) ·
**prerecorded audio-only requires a text alternative (WCAG 1.2.1, Level A)** — on the story
page the prose *is* the transcript, which satisfies it.

**Contrast is a performance-class gate, not a design opinion.** 4.5:1 normal text, 3:1 large
text and UI components — **including text over every image, at every viewport, at the worst
pixel, not the average one.**

---

## §10 · The long-form story page

`zane-story-light.html` is the site's one true essay. Its own law:

- **One focal point per screen.** The page has exactly **one accent element**: the quiz CTA.
  Not the player, not the eyebrows, not the chapter marks.
- The reading column is **640px** (≈74 characters at 19px). Not 680.
- Chapters are numbered, medallioned, and open on a drop cap. Pull-quote bands break the
  column; they are the page's rhythm, and the **peak band earns its weight from whitespace and
  tone, not a bigger font** (96px of air, `--ink` instead of `--ink-2` — same size).
- **The read-or-listen fork is inverse + quiet, never accent.** If the hero grows an ember
  button, the page has three, the accent loses its job description, and you quietly trade
  quiz-starts for audio-plays.
- The sidenote is a **postscript, not a section.** It must *lose* the squint test to the CTA
  above it: no card, no border, no accent, no button.

---

## §11 · Never

### Color
- Purple, violet, or any purple-to-pink gradient, anywhere. (The definitive AI fingerprint.)
- Any cool hue except the one ratified `--fam-measure` dusty blue. No green, no teal, no cyan.
  **Daybreak is warm-only.**
- More than one accent per screen.
- `--gold` (2.17:1) as text, as a meaning-bearing dot, as a progress fill, as a focus ring, or
  as any part of a control whose color communicates.
- `--ember` on decoration, dividers, bullets, list markers, the seam, chapter rules, hover
  states, focus rings, or **any text over a photograph**.
- Glow halos behind dots or text. Neon edges.
- Pure black or pure white as a *design* choice. (`#fff` is permitted for one thing: button
  label text on `--ember`.)
- **Any hex, rgba, px, ms or radius value not in this file.**

### Type
- Inter · Roboto · Arial · Helvetica · system-ui · Space Grotesk · Poppins · Montserrat ·
  Open Sans · Lato — as a design choice.
- **Playfair Display · Lora · Merriweather** — the "AI literary serif" defaults. They look like
  what we chose. They are not what we chose.
- Georgia as a design choice. Georgia exists here for exactly one purpose: the metric-matched
  swap fallback.
- **A fourth family.**
- **Text below 11px rendered.**
- **Faux bold.** If the CSS asks for 600, the loaded axis must reach 600.
- Letter-spacing on lowercase text. Justified text. Centered body copy past ~5 lines.

### Layout & surface
- Glassmorphism / frosted panels. **One exception, and it is not a card: the sticky topbar's
  `backdrop-filter`.** Nowhere else.
- Three-column icon+heading+blurb feature grids. Centered hero + two buttons + floating blobs.
- Emoji as icons.
- Dead-end empty states. A 404 that isn't in the brand palette with one exit path.
- Scale/zoom on image hover.

### Motion
- Transitioning `width`, `height`, `top`, `left`, `box-shadow`, `filter`, `background`, or `all`.
- Parallax. Ambient/looping motion. Animated status dots. Autoplaying media.
- **Ambient motion that survives `prefers-reduced-motion: reduce`.**
- Animating the LCP element, or anything above the fold.
- Any duration or curve not in §7.

### Performance
- **`@import` of a font service.** Render-blocking third-party CSS of any kind.
- An `<img>` without `width` and `height`. An eager below-fold image.
- An asset whose file size is wildly out of proportion to its rendered size.
- Audio without `preload="none"`, without a hardcoded duration, or without a text alternative.
- Shipping any page that fails a §9 gate.

*(The two ratified exceptions — card shadows (§1) and the scroll reveal (§7) — are the only
holes in this list, and each is argued in place. Nothing else gets one.)*

---

## §12 · Brand marks

- **The diamond glyph** — the topbar brandmark. A hexagonal outline with three strokes through
  it: a scar, stitched. Do not redraw.
- **The seam** — a gold stitch, drawn left-to-right on scroll. It joins two sections the way a
  suture joins skin. It is `--gold` (the material), never `--ember`.
- **The tear** — a soft cream feather, never a jagged edge.
- **The hand-inked marks** (`site-assets/marks/*`) — chapter medallions. They carry meaning
  beside a section; they are never decoration.
- **The signature** — `zane-signature.webp` (8 KB. The 19 KB `.png` beside it is dead — use
  the webp).

---

## §13 · Working loop

1. **Read this file fully before the first line of markup.** Every color/size/duration comes
   from here.
2. Unsure between directions? **Build 3 plain-HTML variants and let Dainis pick** — never ship
   the first pass. Vary exactly one thing, or it isn't a test.
3. After building: run a de-slop pass, then a live design review on the preview URL
   (screenshots + Lighthouse). **The §9 budgets are blockers.**
4. **The squint test before handoff:** blur your eyes — is there exactly one focal point and a
   clear reading order? If everything ranks the same, the screen is broken: nothing is
   accentuated.
5. **When in doubt, remove one thing** (not add).

---

## Appendix — debt

Tracked honestly rather than quietly omitted.

### Paid, 2026-07-13 (with the story-page rebuild)

| | Was | Now |
|---|---|---|
| Perf | Fonts: **371.8 KB** via a render-blocking 4-family `@import` across two extra origins | **138 KB**, self-hosted, subsetted, same-origin, 2 preloaded. LCP 2.3s, CLS 0. |
| Type | Newsreader served at `400;500` while `<strong>` asks for 700 → **every bold word in the essay was faux bold** | axis served `400..700` |
| Perf | `Caveat` (72.8 KB) sat in the *shared* stylesheet, used by 2 of 6 pages | 56 KB, self-hosted, declared only on those 2 pages |
| CLS | `font-display:swap` with no metric-matched fallback → a 3,000-word reflow at ~3s | metric-matched Georgia (`size-adjust:88.5%`) |
| A11y | `footer.bigfoot .eyebrow` in ember over `journey.webp` — **4.33:1**, on all six pages | `--ink-2` (7.00:1) + deeper scrim. **Fixed site-wide.** |
| A11y | Ambient `floaty` survived `prefers-reduced-motion` — and the CSS *argued for it in a comment* | all motion off under reduced-motion. Comment deleted. |
| LCP | `riseIn` started `.hero .wrap` at `opacity:0` — Chrome doesn't count `opacity:0` paints toward LCP | removed from the hero |

### Still open (none of these are on the story page)

| | Debt | Where |
|---|---|---|
| A11y | `--fam-dream` `#93701A` is **3.94:1 — a live AA failure**, rendered at 9.5px. Fix is `#7E6010` (5.04:1). | `scarred-light.css` `--fam-dream`, `.tfam` |
| Type | ~30 distinct font sizes, 33 spacing values, 11 radii in the shared CSS | `scarred-light.css` |
| Perf | ~46 images across the other 5 pages: none lazy, none dimensioned | all pages |
| Perf | `illustrations/zane.webp` is 127 KB and still served full-size to the other pages | `index-light.html` |
| Dead | `#BC6A43` (retired ember, 3.57:1), `--oxblood` (1 usage), `zane-signature.png` (a `.webp` exists) | various |
| Bug | `zane-ai/public/index.html` links to `/zane-story.html` — **that file does not exist** (pre-existing 404) | `zane-ai/public/index.html:31` |

These get paid in a site-wide migration with a visual regression pass on all six pages —
**not** folded into a single page rebuild. This file drives that migration.
