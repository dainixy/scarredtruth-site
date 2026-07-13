# scarredtruth-site

**Design system: read `./DESIGN.md` in full before writing any HTML or CSS.** Every color,
size, duration and radius comes from there. If a value isn't in it, it doesn't exist.

**Stack:** hand-authored static HTML. No framework, no build step, no bundler. Pages are
served as-is.

- `docs/` — the site itself, served at the **root** (`scarredtruth.com/…`) by `zane-ai/server.js`.
- `zane-ai/` — Node/Express server + the "Talk to Zane" chat app, served at `/zane/…`.

---

## ⚠️ DEPLOY: `git push` DOES NOT DEPLOY THIS SITE

**Always ship with `./scripts/deploy.sh`.** Never assume a push went live.

`render.yaml` says `autoDeploy: true` and the Render dashboard says `autoDeploy: yes` — **both
are a lie in practice.** There is no GitHub webhook and no Render GitHub App on the repo:

```
gh api repos/dainixy/scarredtruth-site/hooks   ->  []      (empty)
```

So Render never hears about a push. Every deploy in this service's entire history was
triggered by `api` or `manual` — **not one by a git push.** Push, and the site silently keeps
serving the previous commit while everything *looks* fine. This cost a 45-minute debug on
2026-07-13; don't pay it twice.

**Credentials are in `yt-zane/.env`** (not this repo): `RENDER_API_KEY`,
`RENDER_SCARREDTRUTH_SERVICE_ID` (`srv-d919j6b7uimc73a1al0g`). `scripts/deploy.sh` sources
them, pushes, triggers the deploy via the Render API, polls to `live`, then verifies
production (pages, fonts, audio, and HTTP Range — a 7:59 track is unseekable without it).

**The real fix** (needs the dashboard, not code): Render → the `scarred-truth` service →
Settings → Build & Deploy → reconnect GitHub, which installs the App/webhook. Once
`gh api repos/dainixy/scarredtruth-site/hooks` is non-empty, pushes will deploy on their own
and this script becomes optional.

**`docs/site-assets/scarred-light.css` is shared by all six pages.** Any edit to it is a
site-wide edit and requires re-checking all six.

**Zane's canon lives in `zane-ai/prompt/zane-canon.js`.** The story page
(`docs/zane-story-light.html`) is the canonical telling — if the two ever disagree, the page
is right and canon follows it.
