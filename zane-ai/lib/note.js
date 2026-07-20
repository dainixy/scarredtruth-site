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
// WHY THE PROMPT LOOKS PARANOID ABOUT PHRASING (2026-07-20).
// The first four real notes were audited against the live database. All four contained
// the same construction: "That's not a fantasy. That's a plan." / "...a direction." /
// "...a real person you already know." Different women, one formula — because the old
// system prompt literally said 'say her ending back to her as something reachable, NOT
// A FANTASY', and the model echoed our own words into every note. A single stray phrase
// in an instruction became Zane's tell. So: never hand this model a vivid phrase you do
// not want to read back, describe the JOB instead of the words, vary the shape per
// woman, and check the draft before she ever sees it (nobody is waiting on a note, so
// unlike live chat this gate can block and regenerate).
//
// In mock mode (no OpenRouter key) it returns a deterministic, on-voice fallback so
// the local result page always shows a real, personalized note.

const ai = require("./ai");
const { findVoiceViolations, correctionFor } = require("./guardrails");

function mentionsFaith(s) {
  return /\b(god|jesus|christ|faith|pray(?:er|ing|ed)?|church|lord|bible|scripture|blessed|grace)\b/i.test(s || "");
}
function firstName(s) { return (s || "").trim().split(/\s+/)[0] || ""; }
function herFaith(ctx) {
  return mentionsFaith(ctx.dream) || mentionsFaith(ctx.become) || mentionsFaith(ctx.technique);
}

// Everything she typed — used both to steer the note and to check it afterwards.
function herWords(ctx) {
  return [ctx.dream, ctx.become, ctx.technique].filter(Boolean).join("\n");
}

// Four different notes, so two women who compare theirs don't find the same skeleton.
// Chosen by a stable hash of her own words: same woman always gets the same shape, and
// the spread across women is even.
const SHAPES = [
  "SHAPE: Open by answering the ending she named — go straight at it, no preamble about having read her. Middle: the one thing quietly standing in the way, in plain words, without blaming her. Close on the small thing she could do tonight.",
  "SHAPE: Open with the one line of hers that stopped you, quoted once. Then tell her what you heard underneath it. Then one honest sentence about where that leads if she keeps walking. Close on the small thing she could do tonight.",
  "SHAPE: Open with a moment from your own life that her words landed against — brief, concrete, no tidy ending. Then turn it to her and what she said she wants. Close on the small thing she could do tonight.",
  "SHAPE: Open by naming plainly what she is carrying, in her own vocabulary. Then the thing she already got right without noticing. Then what that makes possible. Close on the small thing she could do tonight.",
];
function shapeFor(ctx) {
  const s = (herWords(ctx) + "|" + (ctx.name || "")).trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SHAPES[h % SHAPES.length];
}

function buildPrompt(ctx, correction = "") {
  const { name, primary, secondary, dream, become, technique } = ctx;
  const faith = herFaith(ctx);
  const system = [
    "You are Zane — a real man (never mention being an AI or a model) who helps women rebuild after losing themselves, at Scarred Truth.",
    "Write a SHORT, personal note (3–5 short paragraphs, about 120–190 words) to one woman who just took your quiz.",
    "VOICE: plain words, short sentences, one idea per line, warm and real — a man who has been there, talking to her across the same kitchen table. Not a therapist. Not a motivational poster.",
    "She has just told you, in her own words, the ending she wants. Treat that as the point of the note: take it seriously, at face value, and make your one small step point straight at it.",
    shapeFor(ctx),
    // The four laws, stated as moves to avoid — never with an example phrase attached,
    // because an example is exactly how "not a fantasy" got into all four live notes.
    "HARD VOICE RULES:",
    "1. Never write a sentence shaped like \"that's not X, that's Y\" or \"it isn't X, it's Y\". No contrast-flip constructions at all. Say the plain thing once and move on.",
    "2. Do not retell her own story back to her. She knows what she wrote. Answer it instead. You may quote her once, inside quotation marks, and never restate her sentences outside them.",
    "3. Warmth is active and first-person: thank her, stand beside her, be moved by her. Never open with \"Glad it...\" or any praise that has nobody doing it.",
    "4. No metaphors that need unpacking — no shovels, no bricks, no doors, no guests in her own life. If a line sounds clever, cut it. Read every sentence aloud; if you'd need a breath in the middle, split it.",
    "BANNED words/phrases (never use): resentment, closure, boundaries, self-worth, self-esteem, healing journey, process your emotions, trauma, triggered, toxic, narcissist, codependent, attachment style, inner child, reframe, release, journey, manifest, erasure, 'just forgive', 'everything happens for a reason', 'time heals', 'find yourself', 'love yourself first', 'just be confident', 'move on', 'let it go', 'what doesn't kill you'. Do not describe her confidence as a thing to build or get back.",
    faith
      ? "She mentioned faith, so you may name God plainly and gently as a quiet floor — never preachy, never 'God has a plan' or 'pray harder'."
      : "Do NOT bring up God or faith unless she did.",
    "End with ONE small, worst-day-proof first step she could do tonight. Close with '— Zane' and nothing else.",
    correction,
  ].filter(Boolean).join("\n");

  const her = [
    `Her main pattern is ${primary?.name}: "${primary?.coreFear}".`,
    secondary ? `There's some ${secondary.name} in her too.` : "",
    name ? `Her name is ${firstName(name)} — use it once, naturally.` : "She didn't give her name.",
    dream ? `Asked where she wants to be in six months, and told not to hold back, she wrote: "${dream}"` : "",
    become ? `Asked who she'd be proud to see looking back at her in the mirror, she wrote: "${become}"` : "",
    technique ? `Asked what she thinks would help her fall in love with herself again, she wrote: "${technique}"` : "",
    "Write the note now. Speak to HER directly — not about her.",
  ].filter(Boolean).join("\n");

  return { system, messages: [{ role: "user", content: her }] };
}

// Deterministic, on-voice fallback (mock mode or total API failure).
function fallbackNote(ctx) {
  const nm = firstName(ctx.name);
  const trimEnd = (s) => (s || "").trim().replace(/[\s.!?,;:]+$/, "");
  const dream = trimEnd(ctx.dream);
  const become = trimEnd(ctx.become);
  const technique = trimEnd(ctx.technique);
  const p = [];
  p.push((nm ? nm + ", here" : "Here") + "’s what I want you to know.");
  if (dream) p.push(`You told me where you want to be: “${dream}.” I read it twice. You said it out loud, which is further than most people ever get.`);
  p.push(ctx.primary && ctx.primary.whatsTrue
    ? ctx.primary.whatsTrue
    : "What you scored is the one weight you’ve carried longest. Weights can be set down.");
  if (become) p.push(`And the woman you want to see in the mirror — “${become}” — you don’t have to build her from scratch. She’s who you were before you started making yourself smaller.`);
  if (technique) p.push(`You already know what would help. You said it yourself: “${technique}.”`);
  if (herFaith(ctx)) p.push("And you don’t have to do it on your own strength. You were already held before you ever found these words.");
  p.push((ctx.primary && ctx.primary.firstStep
    ? "Here’s where I’d start" + (nm ? ", " + nm : "") + ": " + ctx.primary.firstStep
    : "Start small tonight: one honest sentence, to yourself or to me.") + "\n\n— Zane");
  return p.join("\n\n");
}

// Patterns catch phrasings. They cannot catch "this sentence doesn't parse" or "that
// metaphor needs unpacking" — the two things that actually made the live notes read as
// written by a machine ("Keeping that walk means living in a ghost town"). So a second
// model reads the draft as a picky editor. It runs on the BACKUP model on purpose: a
// model is poor at spotting its own tells, and this way the writer and the judge are
// never the same model. One extra call per woman, ~$0.001, and nobody is waiting.
const JUDGE_SYSTEM = [
  "You are a hard-nosed editor for a man named Zane who writes plain, short notes to women rebuilding their lives.",
  "Judge ONLY these four things:",
  "1. Does every sentence actually parse, in ordinary English? Flag anything garbled or grammatically broken.",
  "2. Is there a metaphor or image that needs a second read to understand? Plain speech only. Flag it.",
  "3. Does it sound like a poster, a therapist, or a clever writer performing? Flag it.",
  "4. Does it retell her own story back to her instead of answering it? Flag it.",
  "Be strict but do not invent problems. Warmth, directness and short sentences are correct, not faults.",
  'Reply with JSON only: {"pass": true} or {"pass": false, "problems": ["...", "..."]}. Each problem: one short sentence naming the exact line and what is wrong.',
].join("\n");

async function judgeNote(note) {
  try {
    const raw = await ai.complete({
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: note }],
      model: ai.FALLBACK_MODEL,
      maxTokens: 300,
      temperature: 0,
    });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { pass: true, problems: [] };
    const j = JSON.parse(m[0]);
    return { pass: j.pass !== false, problems: Array.isArray(j.problems) ? j.problems.slice(0, 4) : [] };
  } catch (_) {
    return { pass: true, problems: [] }; // a broken judge must never cost her the note
  }
}

// Nobody is waiting on a note, so it gets checked BEFORE she sees it and rewritten once
// if Zane broke his own voice. Returns the cleaner of the two drafts either way — a note
// with one long sentence still beats no note.
async function generateNote(ctx, opts = {}) {
  const onAudit = opts.onAudit || (() => {});
  if (ai.MOCK) return { note: fallbackNote(ctx), source: "mock", violations: [] };

  const her = herWords(ctx);
  const attempt = async (correction) => {
    const { system, messages } = buildPrompt(ctx, correction);
    const note = await ai.complete({ system, messages, model: ai.NOTE_MODEL, maxTokens: 400, temperature: 0.85 });
    // opts.recent: notes already sent to OTHER women. The worst live failure was four
    // women receiving the same sentence, so if the caller can supply recent notes this
    // catches it outright. Without them, SHAPES rotation plus the prompt rule carry it.
    return { note, violations: findVoiceViolations(note, { herText: her, recent: opts.recent || [] }) };
  };
  // How bad is this draft: pattern hits plus anything the editor flagged.
  const score = (d) => d.violations.length + (d.problems ? d.problems.length : 0);

  try {
    let best = await attempt("");
    const verdict = await judgeNote(best.note);
    best.problems = verdict.pass ? [] : verdict.problems;

    if (score(best) > 0) {
      onAudit({ stage: "first-draft", violations: best.violations.map((v) => v.law), problems: best.problems });
      try {
        const notes = [correctionFor(best.violations), best.problems.length
          ? "An editor read your draft and flagged this — fix it and keep everything else:\n- " + best.problems.join("\n- ")
          : ""].filter(Boolean).join("\n");
        const retry = await attempt(notes);
        const rv = await judgeNote(retry.note);
        retry.problems = rv.pass ? [] : rv.problems;
        if (score(retry) < score(best)) best = retry;
      } catch (_) { /* keep the first draft */ }
    }
    if (best.note && best.note.length >= 40) {
      onAudit({ stage: "final", violations: best.violations.map((v) => v.law), problems: best.problems || [] });
      return { note: best.note, source: "openrouter", violations: best.violations };
    }
    return { note: fallbackNote(ctx), source: "fallback", violations: [] };
  } catch (e) {
    if (process.env.NODE_ENV !== "test") console.error("[note] generate failed:", e.message);
    onAudit({ stage: "error", error: e.message });
    return { note: fallbackNote(ctx), source: "error", violations: [] };
  }
}

module.exports = { generateNote, buildPrompt, fallbackNote, mentionsFaith, SHAPES, shapeFor };
