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
  classifyRisk, clampInput, findBannedFragments, CRISIS_REPLY, DANGER_REPLY,
} = require("./lib/guardrails");
const ai = require("./lib/ai");
const store = require("./lib/store");
const { generateNote } = require("./lib/note");

const PORT = process.env.PORT || 5178;
const MAX_TOKENS = 400;
const MAX_TOTAL_INPUT_CHARS = 10000;
const RISK_WINDOW = 6;
const FREE_CHAT_CAP = Number(process.env.FREE_CHAT_CAP || 50); // free messages per result
const DOCS_DIR = path.join(__dirname, "..", "docs");
const PUBLIC_DIR = path.join(__dirname, "public");
const QUIZ_FILE = path.join(DOCS_DIR, "scarred-truth-quiz-light.html");

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "64kb" }));

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
  if (ALLOWED_ORIGINS.length === 0)
    return /^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  return ALLOWED_ORIGINS.includes(origin);
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
      open1: clampInput(String(person.open1 || "")),
      open2: clampInput(String(person.open2 || "")),
      email: clampInput(String(person.email || "")).slice(0, 160),
    },
  };
  if (!rec.primary) return res.status(400).json({ error: "missing primary" });
  try {
    const id = await store.saveResult(rec);
    res.json({ id, shareUrl: `/r/${id}` });
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

// --- the note from Zane -------------------------------------------------------
app.post("/api/note", async (req, res) => {
  if (!originAllowed(req)) return res.status(403).json({ error: "Not allowed." });
  const b = req.body || {};
  const ctx = {
    name: clampInput(String(b.name || "")),
    primary: b.primary || null,
    secondary: b.secondary || null,
    open1: clampInput(String(b.open1 || "")),
    open2: clampInput(String(b.open2 || "")),
  };
  const { note, source } = await generateNote(ctx);
  if (b.resultId) { try { await store.updateResult(String(b.resultId), { note, noteSource: source }); } catch (_) {} }
  try { await store.logEvent({ type: "note_generated", resultId: b.resultId || null, source }); } catch (_) {}
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

    let system = buildSystemPrompt();
    if (rec) {
      const c = [`CONTEXT: She just took your confidence quiz. Her main pattern is ${rec.primaryName || rec.primary} ("${rec.coreFear || ""}").`];
      if (rec.person?.open1) c.push(`She wrote about where it shows up: "${rec.person.open1}"`);
      if (rec.person?.open2) c.push(`She wrote what lighter would look like: "${rec.person.open2}"`);
      c.push("Speak straight to that. Don't re-introduce yourself.");
      system += "\n\n" + c.join("\n");
    }
    if (riskRecent) system += "\n\n" + CRISIS_AWARE_DIRECTIVE;

    const ctrl = new AbortController();
    res.on("close", () => { if (!res.writableEnded) { try { ctrl.abort(); } catch (_) {} } });

    const full = await ai.stream({
      system,
      messages: cleaned.length ? cleaned : [{ role: "user", content: "Hi." }],
      model: ai.CHAT_MODEL, maxTokens: MAX_TOKENS, signal: ctrl.signal,
      onDelta: (d) => out.send({ delta: d }),
    });

    const banned = findBannedFragments(full);
    if (banned.length && process.env.NODE_ENV !== "test") console.warn("[zane-ai] banned fragment in output:", banned.join(", "));
    await store.appendMessage(resultId, "assistant", full);
    out.send({ done: true });
    out.end();
  } catch (err) {
    out.send({ delta: "Something on my end just dropped the thread. Give me a moment and say that again — I'm still here." });
    out.send({ done: true, error: true });
    out.end();
    if (process.env.NODE_ENV !== "test") console.error("[zane-ai] chat error:", err.message);
  }
});

// --- static pages -------------------------------------------------------------
// docs/ at root: index-light.html is the homepage, plus quiz, stories, /site-assets, etc.
app.use(express.static(DOCS_DIR, { index: "index-light.html" }));
// standalone Talk-to-Zane app under /zane
app.use("/zane", express.static(PUBLIC_DIR, { index: "index-light.html" }));
// shareable result link — redirect to the quiz with ?r=<id> so the page's relative
// assets (css, stories-data.js, illustrations) always resolve from the site root.
app.get("/r/:id", (req, res) => res.redirect(302, "/scarred-truth-quiz-light.html?r=" + encodeURIComponent(req.params.id)));
// each profile on its own page (clean preview of one result)
app.get("/profile/:key", (req, res) => res.redirect(302, "/scarred-truth-quiz-light.html?profile=" + encodeURIComponent(req.params.key)));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[zane-ai] http://localhost:${PORT}  (mode: ${ai.MOCK ? "mock" : "live — " + ai.CHAT_MODEL})`);
    console.log(`         home:    http://localhost:${PORT}/`);
    console.log(`         quiz:    http://localhost:${PORT}/scarred-truth-quiz-light.html`);
    console.log(`         stories: http://localhost:${PORT}/scarred-truth-stories-light.html`);
    console.log(`         zane:    http://localhost:${PORT}/zane/index-light.html`);
  });
}

module.exports = { app };
