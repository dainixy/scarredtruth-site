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

// Clamp absurd input lengths before they reach the model (cost + abuse guard).
const MAX_INPUT_CHARS = 4000;
function clampInput(text) {
  if (typeof text !== "string") return "";
  return text.slice(0, MAX_INPUT_CHARS);
}

module.exports = {
  detectCrisis,
  detectDanger,
  classifyRisk,
  findBannedFragments,
  clampInput,
  CRISIS_REPLY,
  DANGER_REPLY,
  MAX_INPUT_CHARS,
};
