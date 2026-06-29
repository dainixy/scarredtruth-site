// store-supabase.js — production backend (Postgres via Supabase). Same 6 functions
// as store-json.js, but async. Selected when STORE_BACKEND=supabase.
//
// Tables are defined in supabase-schema.sql (run once in the Supabase SQL editor).
// `primary` is a SQL reserved word, so the column is primary_key; toRow/fromRow map
// the JS camelCase record <-> snake_case columns. The free-chat cap is enforced by
// counting user messages (no chat_count maintenance needed -> no increment race).

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

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
  const { error } = await db.from("results").insert(toRow(rec));
  if (error) throw new Error("supabase saveResult: " + error.message);
  await logEvent({
    type: "result_created",
    resultId: id,
    primary: data.primary,
    secondary: data.secondary || null,
    tertiary: data.tertiary || null,
    pcts: data.pcts || null,
    hasEmail: !!(data.person && data.person.email),
    open1Len: data.person && data.person.open1 ? data.person.open1.length : 0,
    open2Len: data.person && data.person.open2 ? data.person.open2.length : 0,
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
