// note.js — the genuinely-unique "note from Zane", built from her quiz result and
// the three things she wrote at the end.
//
// The three questions CHANGED on 14 Jul 2026. They used to ask about her pain
// ("where does this show up most, what's it costing you" / "what would lighter look
// like"). They now ask about her ENDING — where she wants to be in six months, who
// she wants to be proud of in the mirror, and what she thinks would help her fall in
// love with herself again. Her answers are the raw material for the book, so the note
// must answer the ending she named, not the old pain question.
//
// Rows written before 14 Jul carry open1/open2 instead; the callers map those in as
// `dream`/`become` so an old result page still gets a real note.
//
// In mock mode (no OpenRouter key) it returns a deterministic, on-voice fallback so
// the local result page always shows a real, personalized note.

const ai = require("./ai");

function mentionsFaith(s) {
  return /\b(god|jesus|christ|faith|pray(?:er|ing|ed)?|church|lord|bible|scripture|blessed|grace)\b/i.test(s || "");
}
function firstName(s) { return (s || "").trim().split(/\s+/)[0] || ""; }
function herFaith(ctx) {
  return mentionsFaith(ctx.dream) || mentionsFaith(ctx.become) || mentionsFaith(ctx.technique);
}

function buildPrompt(ctx) {
  const { name, primary, secondary, dream, become, technique } = ctx;
  const faith = herFaith(ctx);
  const system = [
    "You are Zane — a real man (never mention being an AI or a model) who helps women rebuild their confidence at Scarred Truth.",
    "Write a SHORT, personal note (3–5 short paragraphs, about 120–190 words) to one woman who just took your confidence quiz.",
    "VOICE: plain words, short sentences, one idea per line, warm and real — a man who has been there talking to her in the same kitchen. Not a therapist. Not a motivational poster.",
    "She has just told you the ending SHE wants — in her own words. That is the point of the note. Say her ending back to her as something reachable, not a fantasy, and make your one small step point straight at it.",
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
    dream ? `Asked where she wants to be in six months — and told not to be realistic — she wrote: "${dream}"` : "",
    become ? `Asked who she'd be proud to see looking back at her in the mirror, she wrote: "${become}"` : "",
    technique ? `Asked what she thinks would help her fall in love with herself again, she wrote: "${technique}"` : "",
    "Write the note now. Speak to HER directly — not about her.",
  ].filter(Boolean).join("\n");

  return { system, messages: [{ role: "user", content: her }] };
}

// Deterministic, on-voice fallback (mock mode or API failure).
function fallbackNote(ctx) {
  const nm = firstName(ctx.name);
  const trimEnd = (s) => (s || "").trim().replace(/[\s.!?,;:]+$/, "");
  const dream = trimEnd(ctx.dream);
  const become = trimEnd(ctx.become);
  const technique = trimEnd(ctx.technique);
  const p = [];
  p.push((nm ? nm + ", here" : "Here") + "’s what I want you to know.");
  if (dream) p.push(`You told me where you want to be: “${dream}.” I read that twice. That isn’t a fantasy. That’s a direction — and you just said it out loud, which most people never do.`);
  p.push(ctx.primary && ctx.primary.whatsTrue
    ? ctx.primary.whatsTrue
    : "What you scored isn’t a verdict. It’s the one weight you’ve carried longest — and weights can be set down.");
  if (become) p.push(`And the woman you want to be proud of in the mirror — “${become}” — you don’t have to build her from scratch. She’s who you were before you started making yourself smaller.`);
  if (technique) p.push(`You already know what would help. You said it yourself: “${technique}.” That’s further than most people get.`);
  if (herFaith(ctx)) p.push("And you don’t have to do it on your own strength. You were already held before you ever found these words.");
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
