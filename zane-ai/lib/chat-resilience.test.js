// chat-resilience.test.js — the regression guard for the 19 Jul 2026 blank reply.
//
// A real woman wrote the most vulnerable message in the database and Zane answered with
// nothing, then she said goodbye and left. OpenRouter had returned `200 OK` and reported
// the failure INSIDE the stream; the reader only looked for delta.content, found none,
// and returned "" as if it were an answer.
//
// These tests stand a fake OpenRouter in front of the real server and make it fail in
// exactly those ways. The bar: she must never receive an empty reply, and an attempt
// that produced no visible text must fail over silently to the backup provider.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const PRIMARY = "test/primary";
const BACKUP = "test/backup";
const BACKUP_TEXT = "I hear you. Say it again and I'm still here.";

let upstream, upstreamPort, app, server, port, dataDir;
// how the fake upstream should behave, per model
let behaviour = { [PRIMARY]: "ok", [BACKUP]: "ok" };
const seen = [];

function sse(res, chunks) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const model = (JSON.parse(body || "{}").model) || "";
      seen.push(model);
      const mode = behaviour[model] || "ok";
      if (mode === "http-500") { res.writeHead(500); return res.end("boom"); }
      // 200 OK, then nothing, forever — what hung for 42s on 19 Jul
      if (mode === "stall") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.flushHeaders();
        return;
      }
      // accepts the connection and never even sends headers
      if (mode === "dead-air") return;
      // 200 OK, then the failure reported inside the stream — the real incident.
      if (mode === "stream-error") return sse(res, [{ error: { message: "upstream 502" } }]);
      // 200 OK, well-formed, simply no content anywhere.
      if (mode === "empty") return sse(res, [{ choices: [{ delta: {} }] }]);
      if (mode === "content-filter") return sse(res, [{ choices: [{ delta: {}, finish_reason: "content_filter" }] }]);
      const text = model === BACKUP ? BACKUP_TEXT : "Primary speaking. Plain words only.";
      return sse(res, text.split(" ").map((w, i) => ({ choices: [{ delta: { content: (i ? " " : "") + w } }] })));
    });
  });
  await new Promise((r) => upstream.listen(0, r));
  upstreamPort = upstream.address().port;

  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "zane-test-"));
  process.env.NODE_ENV = "test";
  process.env.ZANE_DATA_DIR = dataDir;
  process.env.OPENROUTER_BASE = `http://127.0.0.1:${upstreamPort}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_CHAT_MODEL = PRIMARY;
  process.env.OPENROUTER_FALLBACK_MODEL = BACKUP;
  process.env.OPENROUTER_STALL_MS = "1500";
  delete process.env.ZANE_MOCK;

  ({ app } = require("../server.js"));
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  port = server.address().port;
});

afterAll(async () => {
  // stalled/dead-air modes deliberately leave sockets open — drop them or close() hangs
  server.closeAllConnections?.();
  upstream.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await new Promise((r) => upstream.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Drive the chat endpoint and collect what actually reached her screen.
async function ask(text) {
  seen.length = 0;
  const r = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
  });
  const raw = await r.text();
  let shown = "", done = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const p = line.slice(5).trim();
    if (!p) continue;
    let o; try { o = JSON.parse(p); } catch (_) { continue; }
    if (o.delta) shown += o.delta;
    if (o.done) done = o;
  }
  return { shown, done, models: [...seen] };
}

function events() {
  const f = path.join(dataDir, "events.jsonl");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("she never receives silence", () => {
  it("the exact 19 Jul failure: 200 OK, error inside the stream", async () => {
    behaviour = { [PRIMARY]: "stream-error", [BACKUP]: "ok" };
    const { shown, done, models } = await ask("I just feel utterly lost.");
    expect(shown.trim()).not.toBe("");        // the bug: this was ""
    expect(shown).toBe(BACKUP_TEXT);          // silently answered by the backup provider
    expect(models).toEqual([PRIMARY, BACKUP]);
    expect(done?.error).toBeUndefined();
  });

  it("a well-formed response with no content in it", async () => {
    behaviour = { [PRIMARY]: "empty", [BACKUP]: "ok" };
    const { shown } = await ask("are you there");
    expect(shown).toBe(BACKUP_TEXT);
  });

  it("a provider content filter", async () => {
    behaviour = { [PRIMARY]: "content-filter", [BACKUP]: "ok" };
    const { shown } = await ask("he hurt me");
    expect(shown).toBe(BACKUP_TEXT);
  });

  it("an outright HTTP error", async () => {
    behaviour = { [PRIMARY]: "http-500", [BACKUP]: "ok" };
    const { shown } = await ask("hello");
    expect(shown).toBe(BACKUP_TEXT);
  });

  it("a stall after 200 OK answers rather than hanging", async () => {
    behaviour = { [PRIMARY]: "stall", [BACKUP]: "ok" };
    const { shown } = await ask("still here?");
    expect(shown).toBe(BACKUP_TEXT);
  }, 15000);

  it("a provider that never even answers", async () => {
    behaviour = { [PRIMARY]: "dead-air", [BACKUP]: "ok" };
    const { shown } = await ask("hello?");
    expect(shown).toBe(BACKUP_TEXT);
  }, 15000);

  it("when BOTH providers die she gets the honest line, never a blank", async () => {
    behaviour = { [PRIMARY]: "stream-error", [BACKUP]: "empty" };
    const { shown, done } = await ask("please say something");
    expect(shown).toMatch(/dropped the thread/);
    expect(done?.error).toBe(true);
  });
});

describe("failures are recorded somewhere permanent", () => {
  it("writes the cause to the events table, not to logs that expire", async () => {
    behaviour = { [PRIMARY]: "stream-error", [BACKUP]: "ok" };
    await ask("write it down");
    const fail = events().filter((e) => e.type === "chat_model_failure");
    expect(fail.length).toBeGreaterThan(0);
    const last = fail[fail.length - 1];
    expect(last.model).toBe(PRIMARY);
    expect(last.stage).toBe("stream");
    expect(String(last.message)).toMatch(/502|error/i);
  });
});

describe("nothing empty is ever stored", () => {
  it("no assistant message in storage is blank", async () => {
    const f = path.join(dataDir, "messages.jsonl");
    const rows = fs.existsSync(f)
      ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const blanks = rows.filter((m) => m.role === "assistant" && !String(m.content || "").trim());
    expect(blanks).toEqual([]);
  });
});
