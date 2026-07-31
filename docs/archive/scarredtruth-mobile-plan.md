# Scarred Truth — Mobile + Polish Fix Plan (resume doc)

> **SUPERSEDED 2026-06-30** — the AFK due-diligence run replaced this punch-list with **PRD #61 + issues #62–74** in `dainixy/yt-zane`. Report: `scarredtruth-dd-report.html`. Use the issues as the source of truth; this doc is kept for the harness/quick-ref notes only.

**Created 2026-06-30.** This is the working plan. The site is **LIVE at https://scarredtruth.com**.
Visual evidence report (mobile screenshots): `/tmp/mobile-fix-plan.html` (regenerate if /tmp cleared).
After fixes: re-verify (Phase V), then push + manual deploy.

## Deploy quick-reference (READ FIRST on resume)
- Working copy (NOT in yt-zane): `/Users/admin/Documents/claude/scarredtruth-site`
- Public repo: `dainixy/scarredtruth-site` · branch `main`
- Render service: `srv-d919j6b7uimc73a1al0g` (owner id `tea-d918qg37uimc73a0hrs0`), plan **starter** (always-on)
- **NO autoDeploy** (public-URL repo, no webhook) → after every push run:
  `curl -s -X POST https://api.render.com/v1/services/srv-d919j6b7uimc73a1al0g/deploys -H "Authorization: Bearer $RENDER_KEY" -d '{}'`
- Render API key, Supabase URL+secret, OpenRouter key are set as Render env vars (and were pasted in chat — see Phase 7 rotation).
- AI live: OpenRouter → `deepseek/deepseek-v3.2`. Storage: Supabase (tables created).
- Local test: `cd zane-ai && ZANE_MOCK=1 PORT=5189 node server.js`.

---

## Due-diligence run (AFK workflow) — 2026-06-30
Owner asked: run comprehensive AFK due diligence (mobile UX, link previews / OG tags, broken pages) → PRD → issues → ONE final summary. Decided: run the checks FIRST (evidence-based), then write PRD + issues grounded in measured findings.

**Harness (vetted, zero third-party plugin code):** `/tmp/st-dd/dd.mjs` (Playwright-core 1.61.1 + axe-core via CDN). Modes: `audit <url> <width> <prefix>` (overflow offenders, console/page/404 errors, broken/tiny images, axe color-contrast + serious/critical, full-page screenshot), `meta <url>` (title/desc/canonical/OG/twitter + og:image load check), `links <url>` (internal link status). Runs location-independent. Output → `/tmp/st-dd/out/`.

**Pages audited** (all at 360/375/390/1280): home `/`, quiz, story `/zane-story-light.html`, profiles `/all-profiles.html`, stories, zane `/zane/`, result `?profile=invisible`.

**Already hard-confirmed before the run:** (a) **NO hamburger/menu toggle on ANY page** (grep = 0 hits) → mobile nav unreachable; (b) home@390 has **2 axe color-contrast** violations; (c) `carry.webp` (36×54) + `release.webp` (33×54) render as broken tiny images; (d) home OG image exists + loads (200, summary_large_image) — currency/on-brand still to verify visually.

**Dimensions checked:** responsive/overflow · contrast+a11y · images · meta/OG/link-preview · page health (404/JS/broken links) · UX-nav-polish (Phase U critique). Each finding adversarially verified before it counts. Synthesis → PRD (to-prd template) + issues (to-issues) in `dainixy/yt-zane` (PRIVATE; public repo stays code-only) + a LIGHT-scheme HTML summary.

---

## Tooling — Claude Code skills for UI/UX review (researched 2026-06-30)
**Already installed locally** (`yt-zane/.claude/skills/`): `frontend-design` (Anthropic official — design *decisions*, not QA). Also `prototype`, `tdd`, etc.

**Installable UI/UX-REVIEW / QA skills found (ranked):**
1. **anthropics/skills → `webapp-testing`** — official Playwright black-box toolkit for testing a running web app. TRUSTED source. Install: `/plugin marketplace add anthropics/skills` then install `webapp-testing`.
2. **hemangjoshi37a/claude-code-frontend-dev** — screenshot-at-7-breakpoints + Claude-vision analysis, WCAG AA, responsive QA, auto-fix loop. Best *fit* for our exact bugs. ⚠️ third-party, runs `npm install` — **vet before installing** (supply-chain risk). `git clone … ~/.claude/plugins/`.
3. **airowe/claude-a11y-skill** — axe-core + jsx-a11y WCAG 2.1 AA audit (contrast, alt, labels, ARIA). ⚠️ third-party.
4. **szilu/ux-designer-skill** — design-review critique (WCAG 2.2, dark patterns, mobile nav). ⚠️ third-party.
5. **lackeyjb/playwright-skill** — on-the-fly Playwright (we already use Playwright CLI directly, so low marginal value).

**CTO recommendation:** prefer the **already-installed `frontend-design`** (for the redesign judgment) + Anthropic's official **`webapp-testing`**, and run the responsive/contrast review with my **own Playwright harness** (3 breakpoints + vision + axe-core via CDN) — this avoids running unvetted third-party plugin code. Install one community skill (e.g. claude-code-frontend-dev or a11y-skill) ONLY if owner wants it, after a quick source review. Decision pending owner.

---

## Phase 1 — Mobile navigation (HIGH — was missed in v1 of plan)
1. **Hamburger menu.** On ≤720px the nav links are hidden (`.nav .lnk{display:none}`) leaving only logo + "Talk to Zane" → you can't reach Quiz/Story/Profiles from non-home pages. Add a hamburger button (right side) that opens a panel with ALL pages. Pure CSS+tiny JS toggle; add to the shared topbar on every page that has one (quiz `topbar()` fn, index-light, zane-story-light, stories-light, all-profiles, zane-ai/public/index-light).
2. **Nav consistency.** Homepage nav shows a "Story Bank" link the other pages don't. Decide the canonical link set (Home · The Quiz · His Story · All Profiles · [Story Bank?] · Talk to Zane) and make EVERY page's nav + the hamburger identical.

## Phase 2 — Mobile result-page readability & layout (HIGH)
3. **Contrast.** Result blocks ("Where it comes from", "What's costing you", "Also strong in you", the Zane note, the featured story) use pale tan on cream — near-invisible on phones. Darken body text to a legible ink tone (helps desktop too). Keep the warm aesthetic.
4. **Padding / overflow.** Several result sections have no side padding → text starts at the left edge and spills off the right. Add safe side padding to every result section; guarantee 0 px horizontal overflow.

## Phase 3 — Mobile images (HIGH)
5. **Before→after "journey" image** (`journey.webp`, bottom of home): wide 1088px image squeezed into 390px → renders blank/too small, can't see both halves (woman carrying weight → woman walking free). On phones, stack the two halves vertically, each full-width, clearly labelled before/after.
6. **`carry.webp`** renders at a broken 36px wide — fix its sizing (or remove if decorative-orphan).

## Phase 4 — Home bottom (MEDIUM)
7. Large empty cream gap before the footer + the "Talk to Zane" chat preview in the same faint tan. Close the gap; bring the teaser text to readable contrast.

## Phase 5 — The "pop-up" (PENDING owner clarification)
8. Owner reports "a pop-up with no image, super messy." Driving the full quiz on mobile only surfaced the "tell me about you" form (looks fine) + the result. **Ask owner WHEN it appears** (after finishing quiz? tapping a profile?). Then fix. (Likely covered already by Phase 2 if it's a result block.)

## Phase 6 — Deferred product items (from launch; owner-gated)
9. **Rewrite the 2 open-ended quiz questions** (owner to provide/approve new wording).
10. **Consent line + age question** — decide whether to add; currently none.
11. **Real waitlist capture** — the 50-msg wall only nudges to the 7-Day Reset; build an actual sign-up/email capture endpoint + store it.
12. **Social share preview (`og-image`)** — verify/refresh the link-preview image used when scarredtruth.com is shared.

## Phase 7 — Security / ops
13. **Rotate the 3 secrets** pasted in chat (Render API key, Supabase service key, OpenRouter key). Regenerate each in its dashboard; values live safely in Render env (owner does the regen; no new values needed by me unless a key is replaced).

## Phase U — UI/UX quality review (design critique, not just technical)
Run a real design review (using `frontend-design` judgment + `webapp-testing`/Playwright vision), at mobile AND desktop, on every page. Critique, not just pass/fail:
- **Visual hierarchy** — does the eye land on the right thing first on each screen? Headline → result → CTA.
- **Spacing rhythm** — consistent vertical spacing between sections; no cramped or cavernous gaps (ties to the home empty-gap bug).
- **Typography** — sizes/line-length/line-height comfortable on mobile (≤~38 chars/line for body? check), hierarchy clear.
- **Contrast/legibility** — all text meets WCAG AA (ties to Phase 2 contrast).
- **Touch targets** — buttons/links ≥44×44px, hamburger easy to tap, chat input usable.
- **Tap/scroll feel** — sticky header not covering content, no accidental horizontal scroll, momentum ok.
- **Consistency** — nav, buttons, cards, eyebrows consistent across all pages.
- **Polish** — image framing (faces not cropped), rounded-corner/shadow consistency, CTA prominence, the "does this feel premium / on-brand (warm Daybreak)" gut check.
- **Flow** — quiz → result → note → chat → share reads as one coherent journey; the result doesn't feel like a wall of faint text.
Output: a short scored critique + prioritized polish list; fold high-value items into the fix before deploy.

## Phase V — Verification protocol ("run it 10 times")
- 3 phone widths: **375 (iPhone SE), 390 (iPhone 13), 360 (Android)**.
- Screens: Home (+ footer), full quiz → result, All-profiles, Stories, Share + chat, and the standalone `/zane` page.
- Pass bars: **0 px horizontal overflow** (measured), no text touching edges, result text readable (contrast), hamburger opens/navigates on every page, journey image shows both halves.
- Capture before/after screenshots for owner review.
- Then: commit → push → `POST .../deploys` → confirm live on scarredtruth.com.

## Order of execution
Tooling (confirm skills w/ owner) → Phase 1 (nav/hamburger) → 2 (contrast) → 3 (images) → 4 (home bottom) → **Phase U (UI/UX critique → fold in polish)** → Phase V (verify across 3 widths) → deploy → show owner. Phases 5/6/7 after owner input. Phase 1–4 = **CSS/responsive + a small nav toggle** (no scoring/logic/content changes); Phase U may add small visual-polish tweaks.
