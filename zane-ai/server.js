// server.js — one shared backend for Scarred Truth:
//   • serves the quiz + result pages (docs/) and the standalone Talk-to-Zane page
//   • saves quiz results, returns a 30-day shareable id  (POST /api/result, GET /api/result/:id)
//   • generates the unique "note from Zane"             (POST /api/note)
//   • streams the Zane chat with her result as context  (POST /api/chat, 50-msg free cap)
//
// AI runs through OpenRouter→DeepSeek (lib/ai.js). With no OPENROUTER_API_KEY (or
// ZANE_MOCK=1) everything runs in deterministic mock mode — so this builds and runs
// locally before any key exists. Crisis→988 / DV→hotline guardrails always run,
// regardless of model or mode.
//
// Storage (lib/store.js) is JSON files locally and Supabase in prod (STORE_BACKEND).
// The Supabase backend is async, so every store call below is awaited.

const fs = require("fs");
const path = require("path");
const express = require("express");

const { buildSystemPrompt, CRISIS_AWARE_DIRECTIVE } = require("./prompt/zane-system");
const {
  classifyRisk, clampInput, findBannedFragments, findVoiceViolations, correctionFor,
  CRISIS_REPLY, DANGER_REPLY,
} = require("./lib/guardrails");
const ai = require("./lib/ai");
const store = require("./lib/store");
const { generateNote } = require("./lib/note");
const mailerlite = require("./lib/mailerlite");

const PORT = process.env.PORT || 5178;
const MAX_TOKENS = 400;
const MAX_TOTAL_INPUT_CHARS = 10000;
const RISK_WINDOW = 6;
const FREE_CHAT_CAP = Number(process.env.FREE_CHAT_CAP || 50); // free messages per result
const DOCS_DIR = path.join(__dirname, "..", "docs");
const PUBLIC_DIR = path.join(__dirname, "public");
const QUIZ_FILE = path.join(DOCS_DIR, "her-own-woman-quiz.html");

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://scarredtruth.com";

// Where she came from.
// CORRECTION (2026-07-14): an earlier comment here claimed Meta strips the referrer and that UTMs
// were the only signal that survives the tap. That was WRONG — the live Cloudflare data plainly
// shows l.instagram.com and l.threads.com. The referrer works.
// UTMs are still worth capturing because the referrer cannot tell bio from story from post, and
// that distinction is what tells us which placement actually earns its keep.
function sourceOf(s) {
  if (!s || typeof s !== "object") return null;
  const pick = (v) => (v ? String(v).slice(0, 120) : null);
  const out = {
    utmSource: pick(s.utmSource),
    utmMedium: pick(s.utmMedium),
    utmCampaign: pick(s.utmCampaign),
    referrer: pick(s.referrer),
    landing: pick(s.landing),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
// 256kb, not 64kb: a woman pouring out her whole story is the point of this site, and a
// body over the limit used to be a silent total loss (no error middleware, empty .catch).
app.use(express.json({ limit: "256kb" }));

// --- per-IP rate limit (cost + abuse guard) -----------------------------------
const hits = new Map();
function rateLimited(ip) {
  const slot = Math.floor(Date.now() / 60000);
  for (const k of hits.keys()) if (Number(k.slice(k.lastIndexOf(":") + 1)) < slot - 1) hits.delete(k);
  const key = `${ip}:${slot}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  return n > 40;
}
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  // same-origin (the site calling its own API) is always fine — no config needed,
  // works on the onrender.com URL and on scarredtruth.com alike.
  try { if (new URL(origin).hostname === req.hostname) return true; } catch (_) {}
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(origin);
  return /^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: ai.MOCK ? "mock" : "live", chatModel: ai.MOCK ? null : ai.CHAT_MODEL, freeChatCap: FREE_CHAT_CAP });
});

// --- results ------------------------------------------------------------------
app.post("/api/result", async (req, res) => {
  if (!originAllowed(req)) return res.status(403).json({ error: "Not allowed." });
  const b = req.body || {};
  const person = b.person || {};
  const rec = {
    answers: Array.isArray(b.answers) ? b.answers.slice(0, 40) : [],
    primary: String(b.primary || ""),
    secondary: b.secondary ? String(b.secondary) : null,
    tertiary: b.tertiary ? String(b.tertiary) : null,
    primaryName: String(b.primaryName || ""),
    coreFear: String(b.coreFear || ""),
    pcts: b.pcts && typeof b.pcts === "object" ? b.pcts : null,
    profileTallies: b.profileTallies && typeof b.profileTallies === "object" ? b.profileTallies : null,
    rebuilding: !!b.rebuilding,
    person: {
      name: clampInput(String(person.name || "")).slice(0, 80),
      // What she writes is stored whole — never clamped. clampInput is a model-prompt
      // cost guard, not a storage cap; using it here silently deleted the tail of a
      // 4000+ char answer (13 Jul 2026). The 256kb express.json limit is the abuse guard.
      //
      // The three end-of-quiz questions changed on 14 Jul 2026 (pain -> the ending she
      // wants). open1/open2 are still accepted because a woman who loaded the OLD page
      // before the deploy will post the OLD field names, and dropping them here would
      // throw her words away at the one moment she finally wrote something down.
      dream: String(person.dream || ""),
      become: String(person.become || ""),
      technique: String(person.technique || ""),
      open1: String(person.open1 || ""),
      open2: String(person.open2 || ""),
      email: clampInput(String(person.email || "")).slice(0, 160),
    },
    source: sourceOf(b.source),
  };
  if (!rec.primary) return res.status(400).json({ error: "missing primary" });
  try {
    const id = await store.saveResult(rec);
    res.json({ id, shareUrl: `/r/${id}` });

    // After the response — she never waits on MailerLite, and MailerLite can never
    // fail her submission. Fire-and-forget, but always logged either way.
    if (rec.person.email && mailerlite.enabled()) {
      mailerlite
        .syncSubscriber({
          email: rec.person.email,
          name: rec.person.name,
          profile: rec.primaryName,
          resultUrl: `${SITE_ORIGIN}/r/${id}`,
        })
        .then(() => store.logEvent({ type: "mailerlite_synced", resultId: id }))
        .catch((err) => {
          console.error("[zane-ai] mailerlite sync failed:", err.message);
          store.logEvent({ type: "mailerlite_failed", resultId: id, error: err.message });
        });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.error("[zane-ai] saveResult error:", err.message);
    res.status(500).json({ error: "could not save" });
  }
});

app.get("/api/result/:id", async (req, res) => {
  try {
    const rec = await store.getResult(String(req.params.id || ""));
    if (!rec) return res.status(404).json({ error: "not found or expired" });
    res.json(rec);
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.error("[zane-ai] getResult error:", err.message);
    res.status(500).json({ error: "lookup failed" });
  }
});

// --- Rebuild waiting list -------------------------------------------------------
// No schema change: rows land in `events` (type=waitlist_signup, payload jsonb).
// Pull the list: select * from events where type='waitlist_signup' order by ts;
app.post("/api/waitlist", async (req, res) => {
  if (!originAllowed(req)) return res.status(403).json({ error: "Not allowed." });
  if (rateLimited(req.ip || "anon")) return res.status(429).json({ error: "Slow down a moment — try again shortly." });
  const b = req.body || {};
  const email = String(b.email || "").trim().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "That email doesn't look right — check it once more?" });
  try {
    await store.logEvent({
      type: "waitlist_signup",
      email,
      name: String(b.name || "").slice(0, 80),
      // stored whole, like the quiz answers — what she writes is the point
      dream: String(b.dream || ""),
      become: String(b.become || ""),
      technique: String(b.technique || ""),
      source: sourceOf(b.source),
    });
    res.json({ ok: true });
    // fire-and-forget, same pattern as /api/result — she never waits on MailerLite
    if (mailerlite.enabled()) {
      mailerlite
        .syncSubscriber({ email, name: String(b.name || "").slice(0, 80), profile: "Rebuild waitlist" })
        .then(() => store.logEvent({ type: "mailerlite_synced", email }))
        .catch((err) => {
          console.error("[zane-ai] waitlist mailerlite failed:", err.message);
          store.logEvent({ type: "mailerlite_failed", email, error: err.message });
        });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.error("[zane-ai] waitlist error:", err.message);
    res.status(500).json({ error: "could not save" });
  }
});

// Record something without ever letting the recording break the reply. The JSON store
// is synchronous and the Supabase one is async, so normalise before catching.
// logEvent() spreads every field except type/resultId into the payload column — pass
// fields flat, never wrapped in a `payload` key, or they end up double-nested.
function logQuietly(evt) {
  try {
    const r = store.logEvent(evt);
    if (r && typeof r.catch === "function") r.catch(() => {});
  } catch (_) { /* never surfaces to her */ }
}

// --- the note from Zane -------------------------------------------------------
app.post("/api/note", async (req, res) => {
  if (!originAllowed(req)) return res.status(403).json({ error: "Not allowed." });
  if (rateLimited(req.ip || "anon")) return res.status(429).json({ error: "Slow down a moment — try again shortly." });
  const b = req.body || {};
  // Old pages (and old rows) send open1/open2; map them onto the first two slots so a
  // result page from before 14 Jul 2026 still gets a real note instead of a blank one.
  const ctx = {
    name: clampInput(String(b.name || "")),
    primary: b.primary || null,
    secondary: b.secondary || null,
    dream: clampInput(String(b.dream || b.open1 || "")),
    become: clampInput(String(b.become || b.open2 || "")),
    technique: clampInput(String(b.technique || "")),
  };
  // Unlike chat, nothing is on her screen yet — so the voice gate BLOCKS here and the
  // note is rewritten once if Zane broke his own laws. The audit is recorded so we can
  // see whether the drafting rules are actually holding on real women.
  const audit = [];
  const { note, source, violations } = await generateNote(ctx, { onAudit: (a) => audit.push(a) });
  if (b.resultId) { try { await store.updateResult(String(b.resultId), { note, noteSource: source }); } catch (_) {} }
  logQuietly({
    type: "note_generated",
    resultId: b.resultId || null,
    source,
    audit,
    laws: (violations || []).map((v) => v.law),
  });
  res.json({ note, source });
});

// --- chat (SSE) ---------------------------------------------------------------
function sse(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  const writable = () => !res.writableEnded && !res.destroyed;
  return {
    send: (obj) => { if (writable()) { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (_) {} } },
    end: () => { if (writable()) { try { res.write("event: done\ndata: {}\n\n"); res.end(); } catch (_) {} } },
  };
}
async function streamText(out, text) {
  for (const word of text.split(" ")) { out.send({ delta: word + " " }); await new Promise((r) => setTimeout(r, 6)); }
}
const MOCK_REPLY =
  "You don't have to have the words for it tonight — one line is enough. " +
  "Tell me where it hurts most right now, and I'll stay with it. Not to fix it. Just so you're not carrying it alone.";
const WALL_REPLY =
  "I want to keep going with you — and I will. We've gone a good way tonight, and the free door is at its limit for now. " +
  "Leave your name on the list and I'll come find you when the next part opens. Until then, the free 7-Day Reset is yours — it's the same first steps I'd give you here.";

app.post("/api/chat", async (req, res) => {
  if (!originAllowed(req)) return res.status(403).json({ error: "Not allowed." });
  const ip = req.ip || "anon";
  if (rateLimited(ip)) return res.status(429).json({ error: "Slow down a moment — try again shortly." });

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const resultId = req.body?.resultId ? String(req.body.resultId) : null;
  const rec = resultId ? await store.getResult(resultId) : null;

  const userTurns = messages.filter((m) => m && m.role === "user").map((m) => clampInput(String(m.content || "")));
  const last = messages[messages.length - 1];
  const lastUserText = last && last.role === "user" ? clampInput(String(last.content || "")) : "";

  const riskNow = classifyRisk(lastUserText);
  const riskRecent = userTurns.slice(-RISK_WINDOW).some((t) => classifyRisk(t));

  const out = sse(res);
  try {
    // safety first — always, regardless of model/mode
    if (riskNow === "danger") { await streamText(out, DANGER_REPLY); out.send({ done: true, risk: "danger" }); return out.end(); }
    if (riskNow === "crisis") { await streamText(out, CRISIS_REPLY); out.send({ done: true, risk: "crisis" }); return out.end(); }

    // free-message cap (per result) -> waitlist wall
    if (resultId && (await store.userMessageCount(resultId)) >= FREE_CHAT_CAP) {
      await store.logEvent({ type: "chat_wall_hit", resultId });
      await streamText(out, WALL_REPLY);
      out.send({ done: true, wall: true });
      return out.end();
    }

    if (lastUserText) await store.appendMessage(resultId, "user", lastUserText);

    if (ai.MOCK) {
      await streamText(out, MOCK_REPLY);
      await store.appendMessage(resultId, "assistant", MOCK_REPLY);
      out.send({ done: true, mock: true });
      return out.end();
    }

    // build bounded context
    let cleaned = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-16).map((m) => ({ role: m.role, content: clampInput(String(m.content)) }));
    let total = cleaned.reduce((s, m) => s + m.content.length, 0);
    while (total > MAX_TOTAL_INPUT_CHARS && cleaned.length > 1) { total -= cleaned[0].content.length; cleaned = cleaned.slice(1); }

    // Did he break a voice law LAST turn? Chat streams live, so that reply is already
    // read and cannot be pulled back — the next turn is the first place we can act on
    // it. The client sends the history, so this costs no database read.
    let correction = "";
    {
      let lastAssistant = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i] && messages[i].role === "assistant" && messages[i].content) { lastAssistant = i; break; }
      }
      if (lastAssistant > -1) {
        let herPrev = "";
        for (let i = lastAssistant - 1; i >= 0; i--) {
          if (messages[i] && messages[i].role === "user") { herPrev = String(messages[i].content || ""); break; }
        }
        correction = correctionFor(
          findVoiceViolations(String(messages[lastAssistant].content || ""), {
            herText: herPrev,
            // everything he already said to her — so a line he has spent counts as spent
            recent: messages.slice(0, lastAssistant).filter((m) => m && m.role === "assistant" && m.content).map((m) => String(m.content)),
          })
        );
      }
    }

    let system = buildSystemPrompt(correction);
    if (rec) {
      const c = [`CONTEXT: She just took your confidence quiz. Her main pattern is ${rec.primaryName || rec.primary} ("${rec.coreFear || ""}").`];
      // Rows from before 14 Jul 2026 answered the two OLD pain questions; newer rows
      // answered the three questions about the ending she wants. Both are real things
      // she told us, so Zane gets whichever she actually wrote.
      const pp = rec.person || {};
      if (pp.dream) c.push(`Asked where she wants to be in six months, she wrote: "${pp.dream}"`);
      if (pp.become) c.push(`Asked who she'd be proud to see in the mirror, she wrote: "${pp.become}"`);
      if (pp.technique) c.push(`Asked what would help her fall in love with herself again, she wrote: "${pp.technique}"`);
      if (pp.open1) c.push(`She wrote about where it shows up: "${pp.open1}"`);
      if (pp.open2) c.push(`She wrote what lighter would look like: "${pp.open2}"`);
      c.push("Speak straight to that. Don't re-introduce yourself.");
      system += "\n\n" + c.join("\n");
    }
    if (riskRecent) system += "\n\n" + CRISIS_AWARE_DIRECTIVE;

    const ctrl = new AbortController();
    res.on("close", () => { if (!res.writableEnded) { try { ctrl.abort(); } catch (_) {} } });

    // She sees tokens the moment they exist — no buffering, no gate in front of her.
    // A failed attempt that emitted nothing is invisible to her, so the retry onto the
    // backup provider happens silently and she just watches the typing dot a moment
    // longer. Every failure is written to our own events table because Render's logs
    // expire (the 19 Jul blank reply was undiagnosable by the time we looked).
    let sent = 0;
    const result = await ai.stream({
      system,
      messages: cleaned.length ? cleaned : [{ role: "user", content: "Hi." }],
      model: ai.CHAT_MODEL, maxTokens: MAX_TOKENS, signal: ctrl.signal,
      onDelta: (d) => { sent += d.length; out.send({ delta: d }); },
      onAttemptFailed: (f) => {
        if (process.env.NODE_ENV !== "test") console.error("[zane-ai] model attempt failed:", JSON.stringify(f));
        logQuietly({ type: "chat_model_failure", resultId, ...f });
      },
    });

    const full = result.text || "";
    // Belt and braces: ai.stream is contracted never to resolve empty, but silence must
    // never reach her again, so the honest line stands in if it ever does.
    if (!full.trim()) throw new ai.ModelFailure("empty after retries", { emitted: sent, stage: "empty" });

    await store.appendMessage(resultId, "assistant", full);
    out.send({ done: true, degraded: result.degraded || undefined });
    out.end();

    // --- her reading window: everything below happens after she has the reply --------
    const banned = findBannedFragments(full);
    if (banned.length && process.env.NODE_ENV !== "test") console.warn("[zane-ai] banned fragment in output:", banned.join(", "));
    const violations = findVoiceViolations(full, {
      herText: lastUserText,
      recent: cleaned.filter((m) => m.role === "assistant").map((m) => m.content),
    });
    if (violations.length) {
      logQuietly({
        type: "voice_violation",
        resultId,
        model: result.model,
        laws: violations.map((v) => v.law),
        detail: violations.map((v) => v.detail).slice(0, 6),
      });
    }
  } catch (err) {
    if (!err || !err.clientGone) {
      // Only speak up if she has nothing on screen; never staple an apology onto a reply
      // she is already reading.
      if (!res.writableEnded) {
        if (!(err && err.emitted > 0)) {
          out.send({ delta: "Something on my end just dropped the thread. Give me a moment and say that again — I'm still here." });
        }
        out.send({ done: true, error: true });
        out.end();
      }
      logQuietly({
        type: "chat_failed",
        resultId,
        stage: err && err.stage,
        message: String((err && err.message) || err).slice(0, 300),
      });
      if (process.env.NODE_ENV !== "test") console.error("[zane-ai] chat error:", err && err.message);
    } else if (!res.writableEnded) {
      out.end();
    }
  }
});

// --- static pages -------------------------------------------------------------
// Cache assets hard (7d) so once an image loads on a device it sticks and is never re-fetched
// from a (possibly cold/sleeping) server; revalidate HTML every 5 min so edits still show.
function staticCache(res, fp) {
  if (/\.(webp|png|jpe?g|gif|svg|ico|woff2?|mp3|mp4)$/i.test(fp)) res.setHeader("Cache-Control", "public, max-age=604800");
  else if (/\.html?$/i.test(fp)) res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
}
// ---- MOVED URLS (renamed 2026-07-13: dropped "-light", clearer names) ---------------
// Every old URL answers a permanent redirect, so inbound links, Google results and
// anything already shared keep working — and the ranking equity transfers to the new URL.
// A rename WITHOUT these is how a site silently loses its search traffic.
// Must sit BEFORE express.static, or static answers first.
const MOVED = {
  "/index-light.html":                 "/",
  "/scarred-truth-quiz-light.html":    "/her-own-woman-quiz.html",
  "/all-profiles.html":                "/quiz-all-profiles.html",
  "/zane-story-light.html":            "/zane-story.html",
  // The stories page was internal-only and was deleted 2026-07-14. Both of its URLs now land on the
  // profiles page — the closest thing that still exists. A 404 would be worse for anything already
  // indexed, bookmarked, or shared.
  "/scarred-truth-stories-light.html": "/quiz-all-profiles.html",
  "/scarred-truth-stories.html":       "/quiz-all-profiles.html",
  // Talk to Zane retired 2026-07-16 (owner: "remove this page from everywhere").
  // Everything that pointed at it lands on the homepage.
  "/talk-to-zane-ai.html":             "/",
  "/zane/index-light.html":            "/",
  "/zane":                             "/",
  "/zane/":                            "/",
  // The sales page's clean permalink (2026-07-16). The file stays docs/community.html;
  // the old URL 301s so every link already shared keeps working.
  "/community.html":                   "/join-myself-again-cohort",
  "/join-myself-again-cohort.html":    "/join-myself-again-cohort",
  "/welcome-to-myself-again.html":     "/welcome-to-myself-again",
};
for (const [from, to] of Object.entries(MOVED)) {
  app.get(from, (_req, res) => res.redirect(301, to));
}

// Myself Again — served at the clean permalink. Must sit BEFORE express.static.
app.get("/join-myself-again-cohort", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300, must-revalidate");
  res.sendFile(path.join(DOCS_DIR, "community.html"));
});

// Where Stripe sends her after she pays. noindex; never linked from the site.
app.get("/welcome-to-myself-again", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(DOCS_DIR, "welcome-to-myself-again.html"));
});

// docs/ at root: index.html is the homepage, plus the quiz, the story, /site-assets, etc.
app.use(express.static(DOCS_DIR, { index: "index.html", setHeaders: staticCache }));
// The chat app's own assets (chat.js) stay under /zane so they aren't duplicated. No `index`
// here any more — bare /zane and /zane/ are 301'd to the new URL above.
app.use("/zane/site-assets", express.static(path.join(DOCS_DIR, "site-assets"), { setHeaders: staticCache }));
app.use("/zane", express.static(PUBLIC_DIR, { setHeaders: staticCache }));
// shareable result link — serve a tiny HTML shell with PER-RESULT Open Graph tags
// (so the most-shared link previews as her archetype), then redirect humans to the
// interactive result at ?r=<id> (assets resolve from the site root there).
const PROFILE_KEYS = ["invisible", "lost", "never", "pleaser", "behind", "critic", "impostor", "steady"];
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
app.get("/r/:id", async (req, res) => {
  const id = String(req.params.id || "");
  const target = "/her-own-woman-quiz.html?r=" + encodeURIComponent(id);
  let rec = null;
  try { rec = await store.getResult(id); } catch (_) {}
  const key = rec && PROFILE_KEYS.includes(String(rec.primary)) ? rec.primary : null;
  const name = (rec && rec.primaryName) ? rec.primaryName : "Your result";
  const title = rec ? `${name} — Scarred Truth` : "Scarred Truth — your result";
  const desc = (rec && rec.coreFear)
    ? rec.coreFear
    : "Take the free quiz and find the one quiet thing still keeping your heart stuck.";
  const img = key
    ? `https://scarredtruth.com/site-assets/illustrations/${key}.webp`
    : "https://scarredtruth.com/site-assets/og-image.png";
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}">
<link rel="canonical" href="https://scarredtruth.com/her-own-woman-quiz.html">
<meta property="og:type" content="website">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="${escHtml(img)}">
<meta property="og:url" content="https://scarredtruth.com/r/${escHtml(id)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escHtml(img)}">
<meta http-equiv="refresh" content="0;url=${escHtml(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body style="font:400 18px/1.6 Georgia,serif;background:#F7F2E9;color:#5C5045;margin:0">
<p style="padding:28px">Opening your result… <a href="${escHtml(target)}" style="color:#A8512F">continue&nbsp;&rarr;</a></p>
</body></html>`);
});
// each profile on its own page (clean preview of one result)
app.get("/profile/:key", (req, res) => res.redirect(302, "/her-own-woman-quiz.html?profile=" + encodeURIComponent(req.params.key)));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[zane-ai] http://localhost:${PORT}  (mode: ${ai.MOCK ? "mock" : "live — " + ai.CHAT_MODEL})`);
    console.log(`         home:    http://localhost:${PORT}/`);
    console.log(`         quiz:    http://localhost:${PORT}/her-own-woman-quiz.html`);
    console.log(`         zane:    http://localhost:${PORT}/talk-to-zane-ai.html`);
  });
}

module.exports = { app };
