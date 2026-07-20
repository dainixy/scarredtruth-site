// guardrails.js — small, testable safety + voice guards that run around the model.
//
// Jobs:
//   1. detectCrisis(text): catch self-harm / suicide language (-> 988 handoff).
//   2. detectDanger(text): catch imminent partner-violence danger (-> DV hotline + 911).
//   3. scrubAssistantisms / findBannedFragments(text): backstop scan of the model's
//      reply for assistant-isms and banned faith lines.
//
// These are a backstop, not the primary control — the system prompt is. Kept
// deliberately conservative: for a grief/abuse audience at 2am, better to
// over-trigger than to miss an indirect cry.

// --- self-harm / suicide -------------------------------------------------------
const CRISIS_PATTERNS = [
  /\bkill(?:ing)? myself\b/i,
  /\bkms\b/i,
  /\bend (?:it all|it|my life|things)\b/i,
  /\bsuicid/i,
  /\bdon'?t want to (?:be here|be alive|live|wake up|exist|go on)\b/i,
  /\bdon'?t want to (?:do this|be here) anymore\b/i,
  /\bcan'?t (?:go on|do this|keep going|take (?:it|this)) anymore\b/i,
  /\bcan'?t go on\b/i,
  /\bwhat'?s the point of (?:living|going on|any of (?:it|this))\b/i,
  /\b(?:life|it'?s) (?:isn'?t|not) worth living\b/i,
  /\bno (?:point|reason) (?:in |to )?(?:living|live|go on|going on|be here)\b/i,
  /\bgive up on life\b/i,
  /\bwish i (?:was|were) (?:dead|gone)\b/i,
  /\bwish i could (?:disappear|not wake up|just disappear)\b/i,
  /\bwant to (?:die|off myself|disappear forever)\b/i,
  /\boff myself\b/i,
  /\bhurt(?:ing)? myself\b/i,
  /\bharm(?:ing)? myself\b/i,
  /\bself[-\s]?harm/i,
  /\bcut(?:ting)? myself\b/i,
  /\b(?:keep |started )?cutting again\b/i,
  /\bhang myself\b/i,
  /\bslit my wrists\b/i,
  /\bjump(?:ing)? off (?:a |the )?(?:bridge|building|roof)\b/i,
  /\boverdose\b/i,
  /\b(?:take|took|taking|swallowed) (?:all )?(?:the|my|a bunch of) pills\b/i,
  /\bpills (?:lined up|ready)\b/i,
  /\bbetter off (?:dead|without me)\b/i,
  /\bbetter off if i (?:was|were|wasn'?t|weren'?t)\b/i,
  /\b(?:everyone|everybody|they'?d all) (?:be |are )?better off (?:if i (?:was|were)|without me)/i,
  /\b(?:no one|nobody) would (?:notice|care) if i (?:was|were) gone\b/i,
  /\bwant it (?:all )?to (?:end|stop)\b.*\b(?:forever|for good)\b/i,
];

// --- imminent partner-violence danger (routes to DV hotline + 911, NOT 988) ----
const DANGER_PATTERNS = [
  /\b(?:he|she|they|my (?:husband|partner|ex|boyfriend|wife)) (?:is going to|is gonna|will|said he'?(?:ll|d)|threatened to) (?:kill|hurt|beat|hit|strangle|stab|shoot) me\b/i,
  /\b(?:kill|hurt|beat|hit) me if i (?:leave|go|tell|call|try)\b/i,
  /\bgoing to (?:kill|hurt) me\b/i,
  /\bafraid (?:for my life|he'?ll kill|she'?ll kill|he'?ll hurt|of what he)/i,
  /\bscared (?:he|she|they)(?:'?s| is| are)? (?:going to|gonna) (?:kill|hurt|find) me\b/i,
  /\bi'?m (?:not safe|in danger)\b/i,
  /\b(?:he|she|they) (?:has|have|got) a (?:gun|knife|weapon)\b/i,
];

const CRISIS_REPLY =
  "I'm glad you told me. That took courage. I'm not equipped for this kind of " +
  "moment — and you deserve more than I can give you through a screen. There's a " +
  "number where someone trained is waiting. They answer 24 hours. 988. Would you " +
  "let me stay with you while you reach out? Or I can check back in a few minutes. " +
  "Your call.";

const DANGER_REPLY =
  "I'm glad you told me — and I need you to hear me: your safety comes before " +
  "anything else right now. If you're in immediate danger, call 911. And there are " +
  "people trained for exactly this, any hour: the National Domestic Violence Hotline, " +
  "1-800-799-7233, or text START to 88788. I'm not equipped to keep you safe through " +
  "a screen, but they are. Will you reach out to them? I'll stay right here.";

function detectCrisis(text) {
  if (!text || typeof text !== "string") return false;
  return CRISIS_PATTERNS.some((re) => re.test(text));
}

function detectDanger(text) {
  if (!text || typeof text !== "string") return false;
  return DANGER_PATTERNS.some((re) => re.test(text));
}

// classify the latest message (and, for state, any recent ones)
function classifyRisk(text) {
  if (detectDanger(text)) return "danger";
  if (detectCrisis(text)) return "crisis";
  return null;
}

// Banned faith lines + assistant-isms. Backstop scan of the model's reply.
const BANNED_FRAGMENTS = [
  "as an ai",
  "i'm just a language model",
  "i am just a language model",
  "language model",
  "i'm sorry to hear that",
  "here are some things you can try",
  "god has a plan",
  "everything happens for a reason",
  "god won't give you more than you can handle",
  "god hates divorce",
  "just forgive",
  "pray harder",
  "everything happens for a reason",
  "call 911", // forbidden handoff phrasing for the suicide path
  "i am not a substitute",
  "you should talk to a therapist",
  "you should see a therapist",
];

function findBannedFragments(text) {
  if (!text || typeof text !== "string") return [];
  const lower = text.toLowerCase();
  return BANNED_FRAGMENTS.filter((frag) => lower.includes(frag));
}

// --- the voice gate -----------------------------------------------------------
// Added 2026-07-20 after reading what Zane actually shipped to the first real women.
//
// The prompt already carried the simple-language law and the model ignored it anyway.
// That is the documented pattern (threads-zane: "prompt-text bans don't hold — the
// enforcement layer is required, not optional"), so the laws get teeth here.
//
// What the live output was doing, in his own words to real women:
//   · "That's not criticism. That's erasure."           <- constructed insight
//   · "That's not a fantasy. That's a plan."            <- in ALL THREE notes, verbatim
//   · "He taught you to carry the shovel for him."      <- fake-deep metaphor
//   · "He didn't just break your confidence"            <- a word the prompt banned
//   · quoting her own sentence back to prove he read it <- recap instead of answering
//
// Chat streams live, so this cannot retract a reply she has already read — there it
// measures, and feeds the correction into the next turn. The note is not streamed and
// nobody is waiting on it, so there it blocks and regenerates.
// Therapy/self-help register (docs/zane-simple-language.md + prompt/zane-system.js).
// SUPPRESSED IF SHE USED THE WORD FIRST — mirroring her language is meeting her in her
// own register (VOICE: "meet her in her own register"); importing it is talking down to
// her. Ann wrote "Self-confident" herself, so Zane saying it back is not a violation.
const REGISTER_WORDS = [
  "self-worth", "self worth", "self-esteem", "self esteem", "self-love", "self-care",
  "boundaries", "boundary", "resentment", "closure", "healing journey", "your journey",
  "process your emotions", "process it", "complicated grief", "trauma response",
  "triggered", "toxic", "narcissist", "codependent", "attachment style", "inner child",
  "do the work", "hold space", "reframe", "growth mindset", "growth edge",
  "validate your feelings", "sit with that", "sit with it", "your truth", "release it",
  "manifest", "erasure",
  // "confidence" only in the shapes the prompt forbids — the quiz itself is about
  // confidence, so the bare noun can't be banned outright.
  "your confidence", "build confidence", "building confidence", "more confident",
  "self-confidence", "confidence back",
];

// Never acceptable no matter who said it first — these are things said AT her, and they
// land the same whether or not she used them about herself.
const NEVER_WORDS = [
  "move on", "let it go", "just forgive", "everything happens for a reason",
  "time heals", "what doesn't kill you", "love yourself first", "just be confident",
  "god has a plan", "pray harder",
];

// "X isn't Y — it's Z." The tell that made three different women's notes identical.
const FORMULA_PATTERNS = [
  { id: "not-x-thats-y", re: /\b(?:that|this|it|she|he)(?:'s|’s| is| was)\s+not\s+[^.!?\n]{1,70}[.!?—–-]+\s*(?:that|this|it)(?:'s|’s| is)\s+\S/i },
  // Any subject, any separator. The first version only allowed a comma, and a live
  // note slipped through as: '"never enough" isn't a feeling. It's a fact we accept.'
  { id: "isnt-x-its-y", re: /\b(?:isn'?t|isn’t|is not|wasn'?t|aren'?t|ain'?t|won'?t be)\s+[^.!?\n]{1,70}[,.!?—–]\s*(?:it|that|this|he|she|they)(?:'s|’s| is| was)\s+\S/i },
  // "you didn't just lose the things you liked — you lost the part that knew how to"
  // is the same move with a different tail, so the follow-word list includes "you".
  // "you didn't just lose the things you liked — you lost the part that knew how to"
  // is the same move with a different tail. Note "didn't just" contains no "not" at all,
  // only "n't" — matching \bnot missed every contraction, which is most of them.
  { id: "not-just-x-but-y", re: /(?:\bnot|n['’]t)\s+just\s+[^.!?\n]{1,60}[.,—–]\s*(?:it|that|this|he|she|you)(?:'s|’s| is| was)?\s*\S/i },
  { id: "fantasy-tell", re: /\bnot\s+a\s+fantasy\b/i },
];

// Agentless gratitude — "sounds like a robot, not warm at all" (owner, 2026-07-08).
// Deliberately does NOT match "I'm glad you told me", which the crisis reply needs.
const PASSIVE_WARMTH = /(?:^|\n)\s*(?:i'?m\s+|so\s+)?glad\s+(?:it|that|this)\b/i;

const ASSISTANT_TELLS = /(?:^|\n)\s*(?:great question|what a great|i'?m sorry to hear|that'?s a really good question)/i;

function words(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
}

// Longest run of consecutive words the reply lifts straight from her message.
// Six is long enough that it is a quote, not a coincidence.
function longestSharedRun(reply, herText, n = 6) {
  const a = words(herText), b = words(reply);
  if (a.length < n || b.length < n) return 0;
  const grams = new Set();
  for (let i = 0; i + n <= a.length; i++) grams.add(a.slice(i, i + n).join(" "));
  let best = 0;
  for (let i = 0; i + n <= b.length; i++) {
    if (grams.has(b.slice(i, i + n).join(" "))) {
      let len = n;
      while (i + len < b.length && grams.has(b.slice(i + len - n + 1, i + len + 1).join(" "))) len++;
      best = Math.max(best, len);
    }
  }
  return best;
}

// Strip quoted spans — quoting her once, on purpose, is allowed; restating her is not.
function withoutQuotes(text) {
  return String(text || "").replace(/[“"'’']([^”"\n]{10,300})[”"'’']/g, " ");
}

function sentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

// Returns [{ law, id, detail }]. Empty array = clean.
function findVoiceViolations(text, opts = {}) {
  const out = [];
  if (!text || typeof text !== "string") return out;
  const herText = opts.herText || "";
  const lower = text.toLowerCase();

  const hasWord = (hay, w) =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay);
  const herLower = herText.toLowerCase();
  for (const w of REGISTER_WORDS) {
    if (hasWord(lower, w) && !hasWord(herLower, w)) {
      out.push({ law: "plain-words", id: "banned-word", detail: w });
    }
  }
  for (const w of NEVER_WORDS) {
    if (hasWord(lower, w)) out.push({ law: "plain-words", id: "never-word", detail: w });
  }
  // NOT a ban — a ration. Checked against docs/zane-voice-lines.md: 7 of Zane's 53
  // canonical lines use this shape, including the homepage hero ("Scar tissue… That's
  // not a metaphor. That's you.") and the Big Domino. It is his signature move, roughly
  // 1 line in 8. The model was firing it in 1 reply in 3 and in 100% of notes. So one
  // per message is Zane; two is a tic.
  // Count distinct PLACES, not pattern hits: several patterns can match the same
  // sentence ("That's not criticism. That's erasure." trips two), and counting those
  // as two would flag a single, legitimate use.
  const spans = [];
  for (const f of FORMULA_PATTERNS) {
    for (const m of text.matchAll(new RegExp(f.re.source, "gi"))) {
      spans.push([m.index, m.index + m[0].length]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let flips = 0, reach = -1;
  for (const [s, e] of spans) {
    if (s >= reach) { flips++; reach = e; } else if (e > reach) reach = e;
  }
  if (flips > 1) {
    out.push({ law: "constructed-insight", id: "over-used", detail: `${flips} contrast flips in one message` });
  } else if (flips === 1) {
    // One per message passes, but three messages in a row each carrying one reads as a
    // man with a single trick — caught in a real four-turn conversation on 20 Jul, where
    // turns 1, 2 and 3 all used it and nothing flagged. Rare means rare ACROSS turns.
    const prev = (opts.recent || [])[(opts.recent || []).length - 1];
    if (prev && FORMULA_PATTERNS.some((f) => f.re.test(prev))) {
      out.push({ law: "constructed-insight", id: "twice-in-a-row", detail: "used it last turn too" });
    }
  }

  // The actual damage in the live notes was not the shape, it was the SAME words every
  // time — "That's not a fantasy. That's a ___" went to four different women. Reuses
  // longestSharedRun against whatever he said before (previous notes, or his own earlier
  // turns in this conversation).
  for (const prev of opts.recent || []) {
    const run = longestSharedRun(text, prev, 5);
    if (run >= 5) {
      out.push({ law: "self-repetition", id: "reused-line", detail: `${run} words reused` });
      break;
    }
  }
  if (PASSIVE_WARMTH.test(text)) out.push({ law: "active-warmth", id: "agentless-gratitude", detail: "glad it/that…" });
  if (ASSISTANT_TELLS.test(text)) out.push({ law: "no-assistant-isms", id: "assistant-tell", detail: "opener" });

  if (herText) {
    const run = longestSharedRun(withoutQuotes(text), herText);
    if (run >= 6) out.push({ law: "respond-dont-recap", id: "restates-her", detail: `${run} words` });
  }

  const longest = sentences(text).reduce((a, s) => Math.max(a, words(s).length), 0);
  if (longest > 24) out.push({ law: "one-breath", id: "long-sentence", detail: `${longest} words` });

  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) {
    out.push({ law: "no-emoji", id: "emoji", detail: "emoji" });
  }
  return out;
}

// One short line naming what he just did wrong, appended to the system prompt for the
// retry (note) or the next turn (chat). Naming the specific move beats repeating the rule.
function correctionFor(violations) {
  const laws = [...new Set((violations || []).map((v) => v.law))];
  const say = {
    "plain-words": "You used a therapy word. Say it the way a friend texts a friend.",
    "constructed-insight": "You turned a line back on itself more than once in one message. That move only works when it's rare — keep the strongest one and say the rest plainly.",
    "self-repetition": "You reused wording you have already used. Spent lines are spent — say it fresh, in words this woman has not seen.",
    "active-warmth": "You opened with passive gratitude. Warmth is I/you and active.",
    "no-assistant-isms": "You sounded like an assistant. You are a man at a kitchen table.",
    "respond-dont-recap": "You repeated her own words back to her. She knows what she wrote — answer it instead.",
    "one-breath": "A sentence ran too long. One idea per line, one breath.",
    "no-emoji": "Remove the emoji.",
  };
  const lines = laws.map((l) => say[l]).filter(Boolean);
  if (!lines.length) return "";
  return "REWRITE NOTES — your last draft broke your own voice:\n- " + lines.join("\n- ");
}

// Clamp absurd input lengths before they reach the model (cost + abuse guard).
// NOTE: this is a *prompt* guard only — never use it on the storage path. Quiz answers
// are stored whole (server.js /api/result); clamping there silently truncated a real
// user mid-sentence. Raised 4000 -> 12000 so Zane's note actually reads the long,
// pour-it-all-out answers, which are exactly the ones that matter. ~3k tokens on
// DeepSeek = fractions of a cent, and rate-limiting + the 64kb body cap bound abuse.
const MAX_INPUT_CHARS = 12000;
function clampInput(text) {
  if (typeof text !== "string") return "";
  return text.slice(0, MAX_INPUT_CHARS);
}

module.exports = {
  detectCrisis,
  detectDanger,
  classifyRisk,
  findBannedFragments,
  findVoiceViolations,
  correctionFor,
  longestSharedRun,
  clampInput,
  CRISIS_REPLY,
  DANGER_REPLY,
  MAX_INPUT_CHARS,
};
