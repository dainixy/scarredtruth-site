// ai.js — chat + one-shot completion via OpenRouter (OpenAI-compatible API).
//
// We route DeepSeek through OpenRouter so the model version is a config value, not
// code — they ship new DeepSeek versions often and we want to tune output cheaply.
//   Set OPENROUTER_API_KEY to go live. No key (or ZANE_MOCK=1) => deterministic
//   mock, so the whole app runs locally before any key exists.
//
// Model picks (override via env; verify current slugs/prices on openrouter.ai):
//   high-volume chat : deepseek/deepseek-v4-flash  or  deepseek/deepseek-v3.2  (cheap)
//   one-shot note    : deepseek/deepseek-v4-pro     (best quality, runs once per taker)

const BASE = process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1";
const API_KEY = process.env.OPENROUTER_API_KEY || "";
const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || "deepseek/deepseek-v3.2";
const NOTE_MODEL = process.env.OPENROUTER_NOTE_MODEL || CHAT_MODEL;
const MOCK = process.env.ZANE_MOCK === "1" || !API_KEY;

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://scarredtruth.com",
    "X-Title": "Scarred Truth - Zane",
  };
}

// Non-streaming completion (used for the one-shot note).
async function complete({ system, messages, model, maxTokens = 600, temperature = 0.85 }) {
  const body = {
    model: model || NOTE_MODEL,
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: maxTokens,
    temperature,
  };
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST", headers: headers(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}: ${await r.text().catch(() => "")}`);
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || "").trim();
}

// Streaming chat. Calls onDelta(text) per token chunk; resolves to the full text.
async function stream({ system, messages, model, maxTokens = 400, temperature = 0.9, onDelta, signal }) {
  const body = {
    model: model || CHAT_MODEL,
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: maxTokens,
    temperature,
    stream: true,
  };
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST", headers: headers(), body: JSON.stringify(body), signal,
  });
  if (!r.ok || !r.body) throw new Error(`openrouter ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
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
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) { full += delta; if (onDelta) onDelta(delta); }
      } catch (_) { /* keep-alive / partial */ }
    }
  }
  return full;
}

module.exports = { complete, stream, MOCK, CHAT_MODEL, NOTE_MODEL, BASE };
