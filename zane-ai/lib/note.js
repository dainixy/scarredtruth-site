// note.js — the genuinely-unique "note from Zane", built from her quiz result and
// the two open-ended things she wrote. Replaces the old fill-in-the-blanks template.
//
// In mock mode (no OpenRouter key) it returns a deterministic, on-voice fallback so
// the local result page always shows a real, personalized note.

const ai = require("./ai");

function mentionsFaith(s) {
  return /\b(god|jesus|christ|faith|pray(?:er|ing|ed)?|church|lord|bible|scripture|blessed|grace)\b/i.test(s || "");
}
function firstName(s) { return (s || "").trim().split(/\s+/)[0] || ""; }

function buildPrompt(ctx) {
  const { name, primary, secondary, open1, open2 } = ctx;
  const faith = mentionsFaith(open1) || mentionsFaith(open2);
  const system = [
    "You are Zane — a real man (never mention being an AI or a model) who helps women rebuild their confidence at Scarred Truth.",
    "Write a SHORT, personal note (3–5 short paragraphs, about 120–190 words) to one woman who just took your confidence quiz.",
    "VOICE: plain words, short sentences, one idea per line, warm and real — a man who has been there talking to her in the same kitchen. Not a therapist. Not a motivational poster.",
    "Quote HER OWN words back to her once, inside quotation marks, so she knows you actually read what she wrote.",
    "BANNED words/phrases (never use): resentment, closure, boundaries, self-worth, healing journey, process your emotions, trauma, triggered, toxic, narcissist, codependent, attachment style, inner child, reframe, release, journey, manifest, 'just forgive', 'everything happens for a reason', 'time heals', 'find yourself', 'love yourself first', 'just be confident', 'what doesn't kill you'.",
    faith
      ? "She mentioned faith, so you may name God plainly and gently as a quiet floor — never preachy, never 'God has a plan' or 'pray harder'."
      : "Do NOT bring up God or faith unless she did.",
    "End with ONE small, worst-day-proof first step she could do tonight. Close with '— Zane' and nothing else.",
  ].join("\n");

  const her = [
    `Her main pattern is ${primary?.name}: "${primary?.coreFear}".`,
    secondary ? `There's some ${secondary.name} in her too.` : "",
    name ? `Her name is ${firstName(name)} — use it once, naturally.` : "She didn't give her name.",
    open1 ? `Asked where this shows up most and what it's costing her, she wrote: "${open1}"` : "",
    open2 ? `Asked what 'lighter' would look like for her, she wrote: "${open2}"` : "",
    "Write the note now. Speak to HER directly — not about her.",
  ].filter(Boolean).join("\n");

  return { system, messages: [{ role: "user", content: her }] };
}

// Deterministic, on-voice fallback (mock mode or API failure).
function fallbackNote(ctx) {
  const nm = firstName(ctx.name);
  const trimEnd = (s) => (s || "").trim().replace(/[\s.!?,;:]+$/, "");
  const o1 = trimEnd(ctx.open1);
  const o2 = trimEnd(ctx.open2);
  const faith = mentionsFaith(ctx.open1) || mentionsFaith(ctx.open2);
  const p = [];
  p.push((nm ? nm + ", here" : "Here") + "’s what I want you to know.");
  if (o1) p.push(`You told me: “${o1}.” I read that twice. That’s not a small thing to carry, and you’ve been carrying it quietly — which is exactly why nobody handed you the words for it before now.`);
  p.push(ctx.primary && ctx.primary.whatsTrue
    ? ctx.primary.whatsTrue
    : "What you scored isn’t a verdict. It’s the one weight you’ve carried longest — and weights can be set down.");
  if (o2) p.push(`You said lighter would feel like “${o2}.” That’s not a far-off someday. That’s the door this opens — closer than it feels from where you’re standing.`);
  if (faith) p.push("And you don’t have to do it on your own strength. You were already held before you ever found these words.");
  p.push((ctx.primary && ctx.primary.firstStep
    ? "Here’s where I’d start" + (nm ? ", " + nm : "") + ": " + ctx.primary.firstStep
    : "Start small tonight: one honest sentence, to yourself or to me.") + "\n\n— Zane");
  return p.join("\n\n");
}

async function generateNote(ctx) {
  if (ai.MOCK) return { note: fallbackNote(ctx), source: "mock" };
  try {
    const { system, messages } = buildPrompt(ctx);
    const note = await ai.complete({ system, messages, model: ai.NOTE_MODEL, maxTokens: 400, temperature: 0.85 });
    if (!note || note.length < 40) return { note: fallbackNote(ctx), source: "fallback" };
    return { note, source: "openrouter" };
  } catch (e) {
    if (process.env.NODE_ENV !== "test") console.error("[note] generate failed:", e.message);
    return { note: fallbackNote(ctx), source: "error" };
  }
}

module.exports = { generateNote, buildPrompt, fallbackNote, mentionsFaith };
