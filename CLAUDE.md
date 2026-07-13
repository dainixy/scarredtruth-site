# scarredtruth-site

**Design system: read `./DESIGN.md` in full before writing any HTML or CSS.** Every color,
size, duration and radius comes from there. If a value isn't in it, it doesn't exist.

**Stack:** hand-authored static HTML. No framework, no build step, no bundler. Pages are
served as-is.

- `docs/` — the site itself, served at the **root** (`scarredtruth.com/…`) by `zane-ai/server.js`.
- `zane-ai/` — Node/Express server + the "Talk to Zane" chat app, served at `/zane/…`.

---

## ⚠️ DEPLOY: `git push` DOES NOT DEPLOY THIS SITE

**Always ship with `./scripts/deploy.sh`.** Never assume a push went live — always verify the
live URL. This cost a 45-minute debug on 2026-07-13; don't pay it twice.

`render.yaml` says `autoDeploy: true` and the dashboard says `autoDeploy: yes`. **Neither is
true in practice.** Every deploy in this service's entire history was triggered by `api` or
`manual` — **not one by a git push.** Push, and the site silently keeps serving the previous
commit while everything *looks* fine.

**Credentials are in `yt-zane/.env`** (not this repo): `RENDER_API_KEY`,
`RENDER_SCARREDTRUTH_SERVICE_ID` (`srv-d919j6b7uimc73a1al0g`). `scripts/deploy.sh` sources
them, pushes, triggers the deploy via the Render API, polls to `live`, then verifies
production (pages, fonts, audio, and HTTP Range — a 7:59 track is unseekable without it).

### Two separate causes. One is fixed; one still needs the dashboard.

**1. Root Directory (FIXED 2026-07-13).** The service had `rootDir: zane-ai`. Render only
auto-deploys when files *inside* rootDir change — and every page, style and asset lives in
`docs/`, outside it. So content commits could never auto-deploy, by design. Cleared on the
service and in `render.yaml`; the path moved into the commands (`cd zane-ai && npm install` /
`cd zane-ai && node server.js` — `server.js` resolves `../docs` from `__dirname`, so the
working directory is irrelevant). **Never re-add `rootDir`.**

**2. The GitHub↔Render link (STILL BROKEN — needs a human).** Even with rootDir cleared, a
pushed commit still does not auto-deploy. The Render↔GitHub connection has to be
re-established in the dashboard: the **`Connect` dropdown at the top-right of the service
page** (next to `Manual Deploy`), or Settings → Build. This cannot be done through the Render
API — it requires the GitHub App authorization flow.

> **Do not "verify" this with `gh api repos/.../hooks`.** Render connects via a GitHub *App*,
> and App installations do not appear in a repo's webhook list — an empty list proves nothing.
> (I made exactly that mistake and reported a wrong root cause.) The only reliable test is:
> push a commit, wait, and check `GET /v1/services/$SID/deploys` for a deploy whose
> `trigger` is **not** `api`/`manual`.

**`docs/site-assets/scarred-light.css` is shared by all six pages.** Any edit to it is a
site-wide edit and requires re-checking all six.

**Zane's canon lives in `zane-ai/prompt/zane-canon.js`.** The story page
(`docs/zane-story-light.html`) is the canonical telling — if the two ever disagree, the page
is right and canon follows it.
