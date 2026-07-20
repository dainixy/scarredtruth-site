// ai.js — chat + one-shot completion via OpenRouter (OpenAI-compatible API).
//
// We route DeepSeek through OpenRouter so the model version is a config value, not
// code — they ship new DeepSeek versions often and we want to tune output cheaply.
//   Set OPENROUTER_API_KEY to go live. No key (or ZANE_MOCK=1) => deterministic
//   mock, so the whole app runs locally before any key exists.
//
// Model picks (override via env; verify current slugs/prices on openrouter.ai):
//   high-volume chat : deepseek/deepseek-v3.2  (cheap)
//   one-shot note    : same by default
//   backup           : anthropic/claude-haiku-4.5 — a DIFFERENT provider, so a
//                      DeepSeek outage still gets her a real answer. Only ever runs
//                      after a failure (~$0.002 a reply), so it's picked for quality.
//
// SILENCE IS NEVER AN ANSWER (added 2026-07-20, after a real one).
// On 19 Jul a woman wrote the most vulnerable message in the whole database and got
// a BLANK reply, then said goodbye and left. Cause: OpenRouter answers `200 OK` and
// then reports upstream failures *inside* the stream. The old reader only looked for
// `choices[0].delta.content`, so an error payload produced no deltas, the loop ended,
// and it returned "" — no throw, so the caller's fallback never fired and the empty
// string was stored and shown. The `catch {}` around JSON.parse ate the evidence, and
// Render's logs had already expired by the time we looked.
// So, in order: detect errors *inside* the stream; treat empty as a failure, never a
// result; time out a stall instead of hanging; retry on a different provider; and hand
// the caller a real error it can log somewhere permanent. Nothing here may ever again
// resolve successfully with no words in it.

const BASE = process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1";
const API_KEY = process.env.OPENROUTER_API_KEY || "";
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || "deepseek/deepseek-v3.2";
const NOTE_MODEL = process.env.OPENROUTER_NOTE_MODEL || CHAT_MODEL;
const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "anthropic/claude-haiku-4.5";
const MOCK = process.env.ZANE_MOCK === "1" || !API_KEY;

// If no token arrives for this long, the provider has stalled. The real incident hung
// 42s before returning nothing; she is sitting there watching a typing dot, so fail
// over to the backup well before that.
const STALL_MS = Number(process.env.OPENROUTER_STALL_MS || 15000);

// finish_reason values that mean "this answer is not usable", even with text attached.
const BAD_FINISH = new Set(["error", "content_filter"]);

class ModelFailure extends Error {
  constructor(message, { emitted = 0, model, stage } = {}) {
    super(message);
    this.name = "ModelFailure";
    this.emitted = emitted; // chars already sent to her screen — >0 means DON'T retry
    this.model = model;
    this.stage = stage; // request | stream | empty | stalled | client-gone
  }
}

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://scarredtruth.com",
    "X-Title": "Scarred Truth - Zane",
  };
}

// Pull the error out of whatever shape OpenRouter used this time.
function errorIn(obj) {
  const e = obj && obj.error;
  if (!e) return null;
  if (typeof e === "string") return e;
  return e.message || e.code || JSON.stringify(e).slice(0, 200);
}

// --- one attempt --------------------------------------------------------------
async function streamOnce({ system, messages, model, maxTokens, temperature, onDelta, signal }) {
  const ctrl = new AbortController();
  const relay = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", relay, { once: true });
  }

  let emitted = 0;
  let stalled = false;
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { stalled = true; ctrl.abort(); }, STALL_MS);
  };

  try {
    // Armed BEFORE the request, not after the headers land: a provider that accepts the
    // connection and then never answers must time out too. (Found by the stall test —
    // guarding only the token stream still left a forever-hang on the way in.)
    arm();
    let r;
    try {
      r = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: maxTokens,
          temperature,
          stream: true,
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (stalled) throw new ModelFailure(`no response for ${STALL_MS}ms`, { emitted: 0, model, stage: "stalled" });
      if (ctrl.signal.aborted) {
        const gone = new ModelFailure("client disconnected", { emitted: 0, model, stage: "client-gone" });
        gone.clientGone = true;
        throw gone;
      }
      throw new ModelFailure(`request failed: ${e.message}`, { emitted: 0, model, stage: "request" });
    }
    if (!r.ok || !r.body) {
      const body = await r.text().catch(() => "");
      throw new ModelFailure(`http ${r.status} ${body.slice(0, 200)}`, { emitted: 0, model, stage: "request" });
    }

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "", lastUnparsed = "";
    arm();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const ln of lines) {
          const s = ln.trim();
          if (!s.startsWith("data:")) continue;
          const payload = s.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let obj;
          try {
            obj = JSON.parse(payload);
          } catch (_) {
            // Not a keep-alive if it looked like a full data: line — keep it as evidence
            // rather than swallowing it the way the old code did.
            lastUnparsed = payload.slice(0, 200);
            continue;
          }
          const err = errorIn(obj);
          if (err) throw new ModelFailure(`stream error: ${err}`, { emitted, model, stage: "stream" });
          const choice = obj.choices && obj.choices[0];
          if (choice && BAD_FINISH.has(choice.finish_reason)) {
            throw new ModelFailure(`finish_reason=${choice.finish_reason}`, { emitted, model, stage: "stream" });
          }
          const delta = choice && choice.delta && choice.delta.content;
          if (delta) {
            full += delta;
            emitted += delta.length;
            arm();
            if (onDelta) onDelta(delta);
          }
        }
      }
    } catch (e) {
      // Whatever she already read must survive the error — the caller stores it so the
      // transcript matches her screen exactly.
      if (e instanceof ModelFailure) { e.partial = full; throw e; }
      let f;
      if (stalled) f = new ModelFailure(`no tokens for ${STALL_MS}ms`, { emitted, model, stage: "stalled" });
      else if (ctrl.signal.aborted) {
        f = new ModelFailure("client disconnected", { emitted, model, stage: "client-gone" });
        f.clientGone = true;
      } else f = new ModelFailure(`read failed: ${e.message}`, { emitted, model, stage: "stream" });
      f.partial = full;
      throw f;
    }

    // The bug that started all this: an empty result is a FAILURE, never an answer.
    if (!full.trim()) {
      throw new ModelFailure(
        `empty completion${lastUnparsed ? ` (unparsed: ${lastUnparsed})` : ""}`,
        { emitted: 0, model, stage: "empty" }
      );
    }
    return full;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", relay);
  }
}

// --- streaming chat, with failover -------------------------------------------
// Streams straight to her as tokens arrive (she should never wait on our quality
// control). Retries on the backup provider ONLY while nothing has reached her screen
// yet — once she has read words we cannot take them back, so a mid-stream death keeps
// whatever she actually saw and reports it as degraded.
// Resolves { text, model, degraded, failures[] }. Rejects only when she got nothing.
async function stream({ system, messages, model, maxTokens = 400, temperature = 0.9, onDelta, signal, onAttemptFailed }) {
  const primary = model || CHAT_MODEL;
  const chain = [primary];
  if (FALLBACK_MODEL && FALLBACK_MODEL !== primary) chain.push(FALLBACK_MODEL);

  const failures = [];
  for (let i = 0; i < chain.length; i++) {
    const attemptModel = chain[i];
    try {
      const text = await streamOnce({ system, messages, model: attemptModel, maxTokens, temperature, onDelta, signal });
      return { text, model: attemptModel, degraded: i > 0, failures };
    } catch (err) {
      const f = { model: attemptModel, stage: err.stage, message: err.message, emitted: err.emitted || 0 };
      failures.push(f);
      if (onAttemptFailed) { try { onAttemptFailed(f); } catch (_) {} }

      if (err.clientGone) throw err; // she left — nothing to salvage, don't spend on a retry
      if (err.emitted > 0) {
        // Partial words are already on her screen. Keep them; never double-send.
        return { text: err.partial || "", model: attemptModel, degraded: true, truncated: true, failures };
      }
      if (i === chain.length - 1) throw err;
    }
  }
}

// --- non-streaming completion (the one-shot note) -----------------------------
async function complete({ system, messages, model, maxTokens = 600, temperature = 0.85 }) {
  const primary = model || NOTE_MODEL;
  const chain = [primary];
  if (FALLBACK_MODEL && FALLBACK_MODEL !== primary) chain.push(FALLBACK_MODEL);

  let last;
  for (let i = 0; i < chain.length; i++) {
    const attemptModel = chain[i];
    try {
      const r = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          model: attemptModel,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: maxTokens,
          temperature,
        }),
      });
      if (!r.ok) {
        throw new ModelFailure(`http ${r.status}: ${await r.text().catch(() => "")}`.slice(0, 240), { model: attemptModel, stage: "request" });
      }
      const j = await r.json();
      const err = errorIn(j);
      if (err) throw new ModelFailure(`error: ${err}`, { model: attemptModel, stage: "response" });
      const text = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "").trim();
      if (!text) throw new ModelFailure("empty completion", { model: attemptModel, stage: "empty" });
      return text;
    } catch (e) {
      last = e;
      if (i === chain.length - 1) throw e;
    }
  }
  throw last;
}

module.exports = { complete, stream, MOCK, CHAT_MODEL, NOTE_MODEL, FALLBACK_MODEL, BASE, ModelFailure, STALL_MS };
