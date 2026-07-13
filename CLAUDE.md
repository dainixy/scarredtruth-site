# scarredtruth-site

**Design system: read `./DESIGN.md` in full before writing any HTML or CSS.** Every color,
size, duration and radius comes from there. If a value isn't in it, it doesn't exist.

**Stack:** hand-authored static HTML. No framework, no build step, no bundler. Pages are
served as-is.

- `docs/` — the site itself, served at the **root** (`scarredtruth.com/…`) by `zane-ai/server.js`.
- `zane-ai/` — Node/Express server + the "Talk to Zane" chat app, served at `/zane/…`.
- Deploy: Render blueprint (`render.yaml`), `autoDeploy: true` on push to `main`.

**`docs/site-assets/scarred-light.css` is shared by all six pages.** Any edit to it is a
site-wide edit and requires re-checking all six.

**Zane's canon lives in `zane-ai/prompt/zane-canon.js`.** The story page
(`docs/zane-story-light.html`) is the canonical telling — if the two ever disagree, the page
is right and canon follows it.
