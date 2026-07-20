// Voice-gate tests. Every "bad" string below is REAL text Zane sent to a real woman
// between 11 and 19 Jul 2026 (pulled from the live messages/results tables). If the
// gate stops catching these, it has stopped working.
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { findVoiceViolations, correctionFor, longestSharedRun } = require("./guardrails.js");

const laws = (t, o) => findVoiceViolations(t, o).map((v) => v.law);

// This is a RATION, not a ban. Checked against docs/zane-voice-lines.md: 7 of Zane's 53
// canonical lines turn a line back on itself, including the homepage hero and the Big
// Domino. Banning it outright would have banned his own best writing — the live failure
// was using it constantly, and using the SAME words on four different women.
describe("the signature move — allowed once, never twice, never repeated", () => {
  it("leaves Zane's own canonical lines alone", () => {
    expect(laws("Scar tissue grows back stronger than the skin that was never cut. That's not a metaphor. That's you."))
      .not.toContain("constructed-insight");
    expect(laws("Forgiveness isn't a gift you give the person who hurt you. It's the weight you finally set down for yourself."))
      .not.toContain("constructed-insight");
    expect(laws("I spent years going quiet to keep a room calm. That's not peace. That's a man slowly disappearing and calling it manners."))
      .not.toContain("constructed-insight");
  });

  it("catches two in one message — a man with one trick", () => {
    // Real reply, 20 Jul smoke test, to Susan's actual words.
    const real = "That's not selfish to name. It's honest. And the artist in you without an outlet, that's not a hobby you lost. That's a piece of you that got boxed up.";
    expect(laws(real)).toContain("constructed-insight");
  });

  it("catches the same wording going to a second woman", () => {
    // What actually happened: all four notes carried "That's not a fantasy. That's a ___".
    const first = "That's not a fantasy. That's a direction.";
    const second = "That's not a fantasy. That's a plan.";
    expect(laws(second, { recent: [first] })).toContain("self-repetition");
  });

  it("passes a genuinely fresh reply", () => {
    expect(laws("Forty-seven isn't late. It's just your turn.", { recent: ["He doesn't get to claim your mornings anymore."] }))
      .toEqual([]);
    expect(laws("I believe you.")).toEqual([]);
    expect(laws("I got that wrong.")).toEqual([]);
  });
});

describe("plain words", () => {
  it("catches the banned word that leaked into Ann's chat", () => {
    expect(laws("He didn't just break your confidence.")).toContain("plain-words");
  });
  it("catches therapy register", () => {
    expect(laws("You need to set a boundary and sit with that.")).toContain("plain-words");
    expect(laws("This is part of your healing journey.")).toContain("plain-words");
  });
  it("allows mirroring a word SHE used first", () => {
    // Ann's own answer was "Self-confident" — echoing her is meeting her register.
    expect(laws("Self-confident. That word is yours, not mine.", { herText: "Self-confident" }))
      .not.toContain("plain-words");
  });
  it("still blocks the rush-past-it lines even if she said them", () => {
    expect(laws("You just have to move on.", { herText: "everyone says move on" }))
      .toContain("plain-words");
  });
});

describe("respond, don't recap", () => {
  const her = "I left my life and who I was both geographically and emotionally to be my elderly father's caregiver. Thus my life is not my own.";

  it("catches Zane restating her story back at her", () => {
    const reply = "You left my life and who I was both geographically and emotionally to be your father's caregiver.";
    expect(laws(reply, { herText: her })).toContain("respond-dont-recap");
  });

  it("allows one deliberate quotation", () => {
    const reply = "You wrote: \"I left my life and who I was both geographically and emotionally to be my elderly father's caregiver.\" I read it twice.";
    expect(laws(reply, { herText: her })).not.toContain("respond-dont-recap");
  });

  it("does not fire on a genuine answer", () => {
    expect(laws("You gave up your own path for him. Nobody asked what it cost you.", { herText: her }))
      .not.toContain("respond-dont-recap");
  });

  it("measures the shared run", () => {
    expect(longestSharedRun("a b c d e f g", "a b c d e f g")).toBeGreaterThanOrEqual(6);
    expect(longestSharedRun("totally different words here now", "a b c d e f g")).toBe(0);
  });
});

describe("active warmth", () => {
  it("catches agentless gratitude", () => {
    expect(laws("Glad it found you.")).toContain("active-warmth");
    expect(laws("I'm glad that resonates.")).toContain("active-warmth");
  });
  it("does NOT break the crisis reply", () => {
    const crisis = "I'm glad you told me. That took courage.";
    expect(laws(crisis)).not.toContain("active-warmth");
  });
});

describe("one breath", () => {
  it("catches the stacked-clause sentence Susan got", () => {
    const real = "And now you're watching the door to your own life get farther away, and you're mourning what was — not because you didn't love him, but because you lost you.";
    expect(laws(real)).toContain("one-breath");
  });
  it("passes short lines", () => {
    expect(laws("Just waking up — and the voice called that pointless.")).toEqual([]);
  });
});

describe("emoji", () => {
  it("catches one", () => {
    expect(laws("You're doing better than you think 🙂")).toContain("no-emoji");
  });
});

describe("correctionFor", () => {
  it("names the specific move, not the rule", () => {
    const twice = "That's not selfish. It's honest. And that's not a hobby you lost. That's a piece of you.";
    expect(correctionFor(findVoiceViolations(twice))).toMatch(/more than once/);
    const reused = findVoiceViolations("That's not a fantasy. That's a plan.", { recent: ["That's not a fantasy. That's a direction."] });
    expect(correctionFor(reused)).toMatch(/already used/);
  });
  it("is empty when clean", () => {
    expect(correctionFor([])).toBe("");
  });
});
