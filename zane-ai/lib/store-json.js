// store-json.js — zero-dependency JSON-file store for LOCAL dev (default backend).
// No native build, always runs. Data lives in zane-ai/.data/ (gitignored).
//
// Functions are synchronous but callers `await` them, so this is drop-in
// interchangeable with the async Supabase backend (store-supabase.js).
//
// Records are AI-retrievable for weekly analysis: results.json is a flat map and
// messages.jsonl / events.jsonl are append-only JSON lines (one object per line),
// trivial to scan with the analysis script in scripts/weekly-intel.js.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.ZANE_DATA_DIR || path.join(__dirname, "..", ".data");
const RESULTS_FILE = path.join(DATA_DIR, "results.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.jsonl");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day shareable window

function ensure() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
ensure();

let results = {};
try { if (fs.existsSync(RESULTS_FILE)) results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8")) || {}; }
catch (_) { results = {}; }

function persist() {
  try { fs.writeFileSync(RESULTS_FILE, JSON.stringify(results)); }
  catch (e) { console.error("[store] persist failed:", e.message); }
}

function newId() {
  // 8-char url-safe id (base62-ish from random bytes)
  return crypto.randomBytes(8).toString("base64").replace(/[+/=]/g, "").slice(0, 8);
}

function expired(rec) { return !rec || (rec.expiresAt && Date.now() > rec.expiresAt); }

function saveResult(data) {
  let id = newId();
  while (results[id]) id = newId();
  const now = Date.now();
  // raw capture before the write — mirrors store-supabase.js
  logEvent({
    type: "submission_raw",
    resultId: id,
    person: data.person || null,
    answers: data.answers || null,
    primary: data.primary || null,
    source: data.source || null,
  });
  results[id] = { id, createdAt: now, expiresAt: now + TTL_MS, chatCount: 0, ...data };
  persist();
  logEvent({
    type: "result_created",
    resultId: id,
    primary: data.primary,
    secondary: data.secondary || null,
    tertiary: data.tertiary || null,
    pcts: data.pcts || null,
    source: data.source || null,
    hasEmail: !!(data.person && data.person.email),
    open1Len: data.person && data.person.open1 ? data.person.open1.length : 0,
    open2Len: data.person && data.person.open2 ? data.person.open2.length : 0,
  });
  return id;
}

function getResult(id) {
  const rec = results[id];
  if (expired(rec)) return null;
  return rec;
}

function updateResult(id, patch) {
  const rec = results[id];
  if (!rec) return null;
  Object.assign(rec, patch);
  persist();
  return rec;
}

function appendMessage(resultId, role, content) {
  const line = JSON.stringify({ resultId: resultId || null, role, content, ts: Date.now() }) + "\n";
  try { fs.appendFileSync(MESSAGES_FILE, line); } catch (_) {}
  if (role === "user" && resultId && results[resultId]) {
    results[resultId].chatCount = (results[resultId].chatCount || 0) + 1;
    persist();
  }
}

function userMessageCount(resultId) {
  const rec = results[resultId];
  return rec ? (rec.chatCount || 0) : 0;
}

function logEvent(evt) {
  const line = JSON.stringify({ ts: Date.now(), ...evt }) + "\n";
  try { fs.appendFileSync(EVENTS_FILE, line); } catch (_) {}
}

function sweepExpired() {
  let changed = false;
  for (const id of Object.keys(results)) if (expired(results[id])) { delete results[id]; changed = true; }
  if (changed) persist();
}
sweepExpired();

module.exports = {
  saveResult, getResult, updateResult,
  appendMessage, userMessageCount, logEvent,
  DATA_DIR, RESULTS_FILE, MESSAGES_FILE, EVENTS_FILE, TTL_MS,
};
