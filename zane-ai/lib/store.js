// store.js — storage backend selector.
//   local dev (default) -> store-json.js   (JSON files in .data/, zero deps)
//   production          -> store-supabase.js (set STORE_BACKEND=supabase)
//
// Both expose the same 6 functions (saveResult, getResult, updateResult,
// appendMessage, userMessageCount, logEvent). The JSON store is synchronous and
// the Supabase store is async; server.js `await`s every call, so the two are
// drop-in interchangeable.

module.exports = process.env.STORE_BACKEND === "supabase"
  ? require("./store-supabase")
  : require("./store-json");
