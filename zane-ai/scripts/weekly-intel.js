#!/usr/bin/env node
// weekly-intel.js — the selfish payoff: a plain-English read on who's taking the quiz.
//
// Prints a weekly intelligence summary: which profiles are most common, how many
// leave the open-ended fields, email capture rate, chat volume, and a sample of what
// women actually wrote (the richest signal).
//
//   Local (JSON store):  node scripts/weekly-intel.js [days]
//   Prod  (Supabase):    STORE_BACKEND=supabase SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/weekly-intel.js [days]
//
// The data is AI-retrievable either way, so this is also a template for handing the
// same records to an LLM for deeper weekly analysis.

const fs = require("fs");
const path = require("path");

const DAYS = Number(process.argv[2] || 7);
const since = Date.now() - DAYS * 24 * 60 * 60 * 1000;

// --- loaders: JSON store (local) or Supabase (prod) ---------------------------
function loadJson() {
  const DATA = process.env.ZANE_DATA_DIR || path.join(__dirname, "..", ".data");
  const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return d; } };
  const readLines = (p) => {
    try { return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); }
    catch (_) { return []; }
  };
  return {
    results: Object.values(readJson(path.join(DATA, "results.json"), {})),
    events: readLines(path.join(DATA, "events.jsonl")),
    messages: readLines(path.join(DATA, "messages.jsonl")),
  };
}

async function loadSupabase() {
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const sinceStr = String(since);
  const [r, e, m] = await Promise.all([
    db.from("results").select("*").gte("created_at", sinceStr),
    db.from("events").select("*").gte("ts", sinceStr),
    db.from("messages").select("*").gte("ts", sinceStr),
  ]);
  const results = (r.data || []).map((x) => ({
    createdAt: Number(x.created_at), primary: x.primary_key, secondary: x.secondary,
    person: x.person, chatCount: x.chat_count || 0,
  }));
  const events = (e.data || []).map((x) => ({ ts: Number(x.ts), type: x.type, ...(x.payload || {}) }));
  const messages = (m.data || []).map((x) => ({ ts: Number(x.ts), role: x.role, content: x.content }));
  return { results, events, messages };
}

async function main() {
  const { results, events, messages } =
    process.env.STORE_BACKEND === "supabase" ? await loadSupabase() : loadJson();

  const recent = results.filter((r) => (r.createdAt || 0) >= since);
  const NAMES = { invisible: "Invisible", lost: "Lost Herself", never: "Never-Enough", pleaser: "Pleaser", behind: "Behind Everyone", critic: "Self-Critic", impostor: "Impostor", steady: "Steady (rebuilt)" };

  const tally = (arr, key) => {
    const m = {};
    arr.forEach((r) => { const k = key(r); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const total = recent.length;
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n=== Scarred Truth — weekly intelligence (last ${DAYS} days · ${process.env.STORE_BACKEND === "supabase" ? "supabase" : "local"}) ===\n`);
  console.log(`Quizzes completed:        ${total}`);
  console.log(`Left open-ended answers:  ${recent.filter((r) => r.person && (r.person.dream || r.person.become || r.person.technique || r.person.open1 || r.person.open2)).length}`);
  console.log(`Gave email:               ${recent.filter((r) => r.person && r.person.email).length}`);
  console.log(`Chats started:            ${recent.filter((r) => (r.chatCount || 0) > 0).length}`);
  const recentMsgs = messages.filter((m) => (m.ts || 0) >= since && m.role === "user");
  console.log(`Chat messages from women: ${recentMsgs.length}`);
  console.log(`Hit the 50-msg wall:      ${events.filter((e) => e.type === "chat_wall_hit" && (e.ts || 0) >= since).length}`);

  console.log(`\n-- Primary profile (the loudest wound) --`);
  tally(recent, (r) => NAMES[r.primary] || r.primary).forEach(([k, n]) =>
    console.log(`  ${pad(k, 20)} ${n}  ${"█".repeat(n)} ${total ? Math.round((n / total) * 100) : 0}%`));

  console.log(`\n-- Secondary profile --`);
  tally(recent.filter((r) => r.secondary), (r) => NAMES[r.secondary] || r.secondary).forEach(([k, n]) =>
    console.log(`  ${pad(k, 20)} ${n}`));

  // Field names changed 14 Jul 2026 (open1/open2 -> dream/become/technique); read both so
  // old rows still count. The third answer was never sampled before — added 23 Jul 2026.
  const openField = (r, k, legacy) => (r.person && (r.person[k] || (legacy ? r.person[legacy] : ""))) || "";
  const sample = (label, k, legacy) => {
    console.log(`\n-- ${label} --`);
    recent.filter((r) => openField(r, k, legacy)).slice(-12).forEach((r) =>
      console.log(`  [${NAMES[r.primary] || r.primary}] "${openField(r, k, legacy).replace(/\s+/g, " ").slice(0, 160)}"`));
  };
  sample("A really good day, six months out (recent sample)", "dream", "open1");
  sample("The part of herself she wants back", "become", "open2");
  sample("The first sign things are turning", "technique");

  console.log(`\n-- What she believes (belief card) --`);
  tally(recent.filter((r) => r.person && r.person.faith), (r) => r.person.faith).forEach(([k, n]) =>
    console.log(`  ${pad(k, 20)} ${n}`));

  console.log(`\n-- What scares her most about trying (fear card) --`);
  tally(recent.filter((r) => r.person && r.person.fear), (r) => r.person.fear).forEach(([k, n]) =>
    console.log(`  ${pad(k, 20)} ${n}`));

  console.log(`\n(For deeper analysis, hand results + messages to an LLM.)\n`);
}

main().catch((e) => { console.error("[weekly-intel]", e.message); process.exit(1); });
