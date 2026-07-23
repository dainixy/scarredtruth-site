// store-supabase.js — production backend (Postgres via Supabase). Same 6 functions
// as store-json.js, but async. Selected when STORE_BACKEND=supabase.
//
// Tables are defined in supabase-schema.sql (run once in the Supabase SQL editor).
// `primary` is a SQL reserved word, so the column is primary_key; toRow/fromRow map
// the JS camelCase record <-> snake_case columns. The free-chat cap is enforced by
// counting user messages (no chat_count maintenance needed -> no increment race).

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// Length of each thing she wrote, by question. Never the text itself — the text goes in
// the row and in submission_raw; this is only so we can see at a glance whether people
// are actually writing. Covers the questions as they are now (dream/become/technique)
// and as they were before 14 Jul 2026 (open1/open2).
function wroteLens(p) {
  const n = (k) => (p && p[k] ? String(p[k]).length : 0);
  return { dream: n("dream"), become: n("become"), technique: n("technique"), open1: n("open1"), open2: n("open2") };
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  throw new Error("STORE_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars");
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day shareable window

function newId() {
  return crypto.randomBytes(8).toString("base64").replace(/[+/=]/g, "").slice(0, 8);
}

function toRow(rec) {
  return {
    id: rec.id,
    created_at: rec.createdAt,
    expires_at: rec.expiresAt,
    primary_key: rec.primary,
    secondary: rec.secondary || null,
    tertiary: rec.tertiary || null,
    primary_name: rec.primaryName || null,
    core_fear: rec.coreFear || null,
    pcts: rec.pcts || null,
    profile_tallies: rec.profileTallies || null,
    rebuilding: !!rec.rebuilding,
    answers: rec.answers || null,
    person: rec.person || null,
    note: rec.note || null,
    note_source: rec.noteSource || null,
  };
}

function fromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    primary: r.primary_key,
    secondary: r.secondary,
    tertiary: r.tertiary,
    primaryName: r.primary_name,
    coreFear: r.core_fear,
    pcts: r.pcts,
    profileTallies: r.profile_tallies,
    rebuilding: r.rebuilding,
    // Which question-set she answered. Lives inside person (jsonb) because adding a real
    // column needs the SQL editor and inserts would fail if toRow wrote a column that
    // doesn't exist yet. 1 = pre-23-Jul-2026 rows that never carried it.
    corpusV: (r.person && r.person.corpusV) || 1,
    answers: r.answers,
    person: r.person,
    chatCount: r.chat_count || 0,
    note: r.note,
    noteSource: r.note_source,
  };
}

async function saveResult(data) {
  const now = Date.now();
  const id = newId();
  const rec = { id, createdAt: now, expiresAt: now + TTL_MS, ...data };

  // Raw capture FIRST. What she typed is the whole point of this site; the results insert
  // can fail (bad schema, outage) and until now that left no trace at all — the words were
  // simply gone. events.payload is jsonb, so there's no length limit. Best-effort: if this
  // throws we still try the real insert.
  await logEvent({
    type: "submission_raw",
    resultId: id,
    person: data.person || null,
    answers: data.answers || null,
    primary: data.primary || null,
    source: data.source || null,
  });

  const { error } = await db.from("results").insert(toRow(rec));
  if (error) throw new Error("supabase saveResult: " + error.message);
  await logEvent({
    type: "result_created",
    resultId: id,
    primary: data.primary,
    secondary: data.secondary || null,
    tertiary: data.tertiary || null,
    pcts: data.pcts || null,
    source: data.source || null,
    hasEmail: !!(data.person && data.person.email),
    // How many characters she wrote per question — the clearest signal of whether the
    // last screen is working. The questions changed on 14 Jul 2026; rows before that
    // logged open1Len/open2Len, which is why both sets are here.
    wrote: wroteLens(data.person),
  });
  return id;
}

async function getResult(id) {
  const { data, error } = await db.from("results").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && Date.now() > Number(data.expires_at)) return null;
  return fromRow(data);
}

async function updateResult(id, patch) {
  const row = {};
  if ("note" in patch) row.note = patch.note;
  if ("noteSource" in patch) row.note_source = patch.noteSource;
  if (Object.keys(row).length === 0) return { id, ...patch };
  const { error } = await db.from("results").update(row).eq("id", id);
  if (error) return null;
  return { id, ...patch };
}

async function appendMessage(resultId, role, content) {
  const { error } = await db.from("messages").insert({
    result_id: resultId || null, role, content, ts: Date.now(),
  });
  if (error && process.env.NODE_ENV !== "test") console.error("[store-supabase] appendMessage:", error.message);
}

async function userMessageCount(resultId) {
  if (!resultId) return 0;
  const { count, error } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("result_id", resultId)
    .eq("role", "user");
  if (error) return 0;
  return count || 0;
}

async function logEvent(evt) {
  const { type, resultId, ...payload } = evt || {};
  const { error } = await db.from("events").insert({
    ts: Date.now(), type: type || null, result_id: resultId || null, payload,
  });
  if (error && process.env.NODE_ENV !== "test") console.error("[store-supabase] logEvent:", error.message);
}

module.exports = {
  saveResult, getResult, updateResult,
  appendMessage, userMessageCount, logEvent, TTL_MS,
};
