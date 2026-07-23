#!/usr/bin/env node
// quiz-sim.js — proves the quiz routes answers to the right profile BEFORE a deploy.
//
// Reads the LIVE corpus out of docs/her-own-woman-quiz.html and mirrors the page's
// scoring engine VERBATIM (score / MAXPOSS / pctOf / rankedKeys — if those change in
// the HTML, change them here in the same commit, or this harness tests fiction).
//
// Run:  node zane-ai/scripts/quiz-sim.js
// Exits non-zero if any invariant fails. Distribution numbers print for eyeballing.

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", "docs", "her-own-woman-quiz.html");
const html = fs.readFileSync(FILE, "utf8");
const OPEN = '<script id="corpus" type="application/json">';
const a = html.indexOf(OPEN);
const b = html.indexOf("</script>", a + OPEN.length);
if (a < 0 || b < 0) fail("corpus blob not found");
const C = JSON.parse(html.slice(a + OPEN.length, b)); // throws if the blob is corrupt
const ORDER = C.order;

let failures = 0;
function fail(msg) { failures++; console.error("  ✗ FAIL: " + msg); }
function ok(msg) { console.log("  ✓ " + msg); }

// --- engine, mirrored from the page -------------------------------------------
const MAXPOSS = (function () { var m = {}; ORDER.forEach(function (k) { m[k] = 0; });
  C.quizScenes.forEach(function (s) { var w = s.anchor ? 2 : 1; var hit = {};
    s.options.forEach(function (o) { if (o.maps !== "healthy") hit[o.maps] = true; });
    Object.keys(hit).forEach(function (k) { if (m[k] != null) m[k] += w; }); });
  return m; })();
function pctOf(k, tally) { var mx = MAXPOSS[k] || 1; return Math.max(0, Math.min(100, Math.round(((tally[k] || 0) / mx) * 100))); }
function rankedKeys(tally, answers) {
  answers = answers || [];
  var anchorPick = null;
  for (var i = 0; i < C.quizScenes.length; i++) {
    if (C.quizScenes[i].anchor && answers[i] && answers[i] !== "healthy") anchorPick = answers[i];
  }
  function firstReachedFor(k) { var at = answers.indexOf(k); return at < 0 ? 999 : at; }
  return ORDER.slice().sort(function (x, y) {
    var d = pctOf(y, tally) - pctOf(x, tally); if (d) return d;
    if (x === anchorPick && y !== anchorPick) return -1;
    if (y === anchorPick && x !== anchorPick) return 1;
    var f = firstReachedFor(x) - firstReachedFor(y); if (f) return f;
    return ORDER.indexOf(x) - ORDER.indexOf(y);
  });
}
function score(answers) {
  var tally = {}; ORDER.forEach(function (k) { tally[k] = 0; });
  var healthy = 0;
  for (var i = 0; i < answers.length; i++) {
    var sc = C.quizScenes[i]; var w = (sc && sc.anchor) ? 2 : 1; var m = answers[i];
    if (m === "healthy") healthy += w; else if (tally.hasOwnProperty(m)) tally[m] += w;
  }
  var woundTotal = 0; ORDER.forEach(function (k) { woundTotal += tally[k]; });
  var order = rankedKeys(tally, answers);
  var ranked = order.map(function (k) { return { k: k, v: tally[k] }; });
  var maxWound = Math.max.apply(null, ORDER.map(function (k) { return tally[k] || 0; }));
  var rebuilding = (healthy >= woundTotal) && (maxWound <= 4);
  var primary, secondary;
  if (rebuilding) { primary = "steady"; secondary = (maxWound > 0) ? ranked[0].k : null; }
  else { primary = ranked[0].k; secondary = (ranked[1].v > 0) ? ranked[1].k : null; }
  return { primary, secondary, tally, healthy, woundTotal, rebuilding };
}

// --- deterministic PRNG so runs are reproducible -------------------------------
let seed = 20260723;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function pickFrom(arr) { return arr[Math.floor(rnd() * arr.length)]; }

const scenes = C.quizScenes;
const scored = scenes.filter((s) => !s.field);
const anchorIdx = scenes.findIndex((s) => s.anchor);

// === 1. structure invariants ====================================================
console.log("\n== Structure ==");
scenes.length === 15 ? ok("15 quiz cards") : fail("expected 15 scenes, got " + scenes.length);
anchorIdx === 12 ? ok("anchor at index 12") : fail("anchor at " + anchorIdx);
const anchor = scenes[anchorIdx];
(anchor.options.length === 7 && !anchor.options.some((o) => o.maps === "healthy") &&
  ORDER.every((k) => anchor.options.some((o) => o.maps === k)))
  ? ok("anchor: 7 options, one per wound, no healthy (owner ruling)")
  : fail("anchor options wrong");
scenes.slice(0, 12).forEach((s, i) => {
  const h = s.options.filter((o) => o.maps === "healthy").length;
  if (s.options.length !== 5 || h !== 1) fail(`Q${i + 1}: expected 5 options with exactly 1 healthy`);
  s.options.forEach((o) => { if (o.maps !== "healthy" && !ORDER.includes(o.maps)) fail(`Q${i + 1}: bad maps '${o.maps}'`); });
});
ok("Q1-12: 5 options each, exactly 1 healthy, all maps valid");
[13, 14].forEach((i) => {
  const s = scenes[i];
  if (!s.field) fail(`scene ${i}: missing field marker`);
  s.options.forEach((o) => {
    if (o.maps === "healthy" || ORDER.includes(o.maps)) fail(`scene ${i}: META INVARIANT BROKEN — '${o.maps}' would leak into scoring`);
    if (!o.code) fail(`scene ${i}: option missing code`);
  });
});
ok("faith/fear cards: namespaced tokens only, never scored");
console.log("  MAXPOSS: " + JSON.stringify(MAXPOSS));

// === 2. pure-profile answerers land on their profile ============================
console.log("\n== Pure-profile routing ==");
ORDER.forEach((W) => {
  const answers = scenes.map((s) => {
    const mine = s.options.find((o) => o.maps === W);
    if (mine) return W;
    const h = s.options.find((o) => o.maps === "healthy");
    return h ? "healthy" : s.options[0].maps; // meta cards: any token, ignored anyway
  });
  const r = score(answers);
  r.primary === W ? ok(`${W}: primary = ${W} (${pctOf(W, r.tally)}%)`) : fail(`${W}: got ${r.primary}`);
});

// === 3. all-healthy → steady, whatever she names on the anchor ==================
console.log("\n== All-healthy (anchor forces a wound pick) ==");
let steadyAll = true;
ORDER.forEach((W) => {
  const answers = scenes.map((s, i) => {
    if (i === anchorIdx) return W;
    if (s.field) return s.options[0].maps;
    return "healthy";
  });
  const r = score(answers);
  if (r.primary !== "steady" || r.secondary !== W) { steadyAll = false; fail(`anchor=${W}: got ${r.primary}/${r.secondary}`); }
});
if (steadyAll) ok("all 7 anchor choices → primary steady, secondary = her anchor pick");

// === 4. steady-rate sweep vs healthy-count ======================================
console.log("\n== Steady rate by number of healthy answers (Q1-12), 20k runs each ==");
for (let h = 12; h >= 0; h--) {
  let steady = 0; const RUNS = 20000;
  for (let r = 0; r < RUNS; r++) {
    const healthyAt = new Set();
    while (healthyAt.size < h) healthyAt.add(Math.floor(rnd() * 12));
    const answers = scenes.map((s, i) => {
      if (s.field) return pickFrom(s.options).maps;
      if (i === anchorIdx) return pickFrom(anchor.options).maps;
      if (healthyAt.has(i)) return "healthy";
      const wounds = s.options.filter((o) => o.maps !== "healthy");
      return pickFrom(wounds).maps;
    });
    if (score(answers).primary === "steady") steady++;
  }
  const pct = ((steady / 20000) * 100).toFixed(1);
  console.log(`  ${String(h).padStart(2)} healthy: steady ${pct}%`);
  if (h === 12 && steady !== 20000) fail("12 healthy answers must ALWAYS land steady");
  if (h <= 5 && steady > 0) fail(`${h} healthy answers should never land steady (got ${steady})`);
}

// === 5. uniform-random: distribution + always a clear primary ===================
console.log("\n== Uniform-random answering, 200k runs ==");
const dist = {}; let noPrimary = 0, noSecondary = 0;
const RUNS = 200000;
for (let r = 0; r < RUNS; r++) {
  const answers = scenes.map((s) => pickFrom(s.options).maps);
  const res = score(answers);
  dist[res.primary] = (dist[res.primary] || 0) + 1;
  if (!res.primary) noPrimary++;
  if (res.primary !== "steady" && !res.secondary) noSecondary++;
}
noPrimary === 0 ? ok("every run produced a primary") : fail(noPrimary + " runs without a primary");
noSecondary === 0 ? ok("every wound run produced a secondary") : fail(noSecondary + " wound runs without a secondary");
const woundShares = ORDER.map((k) => (dist[k] || 0) / RUNS);
Object.keys(dist).sort((x, y) => dist[y] - dist[x]).forEach((k) => {
  console.log(`  ${k.padEnd(10)} ${(100 * dist[k] / RUNS).toFixed(1)}%`);
});
const mx = Math.max(...woundShares), mn = Math.min(...woundShares);
console.log(`  wound-share spread: max ${(mx * 100).toFixed(1)}% / min ${(mn * 100).toFixed(1)}% (ratio ${(mx / mn).toFixed(2)})`);
if (mx / mn > 2.0) fail("uniform-random skew ratio > 2.0 — pctOf normalization is not holding");
else ok("no material skew from the 8/9/10 max spread (ratio ≤ 2.0)");
ORDER.concat(["steady"]).forEach((k) => { if (!dist[k]) fail(`primary '${k}' unreachable under random answering`); });
ok("reachability checked for all 8 results");

// === done =======================================================================
if (failures) { console.error(`\n${failures} FAILURE(S)\n`); process.exit(1); }
console.log("\nAll checks green.\n");
