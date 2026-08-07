// freebies.js — the free-book library. One source of truth for DELIVERY: what each
// book is called, where its file sits, and which MailerLite group emails it out.
//
// The marketing copy for each book lives in docs/freebies.html (hand-authored, like
// every page on this site). This file owns only the facts the server needs, so a
// slug can never mean two different books.
//
// TWO GROUPS PER SIGN-UP, and each one has a different job (owner ruling 2026-08-06:
// "we will do one for all ebooks"):
//
//   ALL_GROUP — the delivery trigger. ONE automation watches this one group and sends
//     ONE email carrying all three books. That is the whole reason it exists: the owner
//     builds and maintains a single automation, and a fourth book needs no automation
//     change at all. (The alternative was one automation with three "joins group"
//     triggers, one per book — MailerLite caps triggers at three, so three books would
//     have used the entire budget.)
//
//   book.group — the record of WHICH book she reached for, kept forever and per-book, so
//     a future campaign can mail only the women who came for the sleep book. Group
//     membership is additive and permanent; the `magnet` field only ever holds the most
//     recent book, so the group is the durable signal, not the field.
//
// The re-trigger trap this sidesteps: MailerLite's docs are explicit that "a subscriber
// can't rejoin a group of which they're already a member", so an automation fires once
// per subscriber and never again. That is FINE here only because the single email hands
// over all three books at once — if that email is ever narrowed to one book, the second
// and third download would silently email nothing, and the form would still look fine.
//
// WHY THE IDS ARE IN CODE, not in env vars: they are stable account identifiers,
// not secrets (the API key is the secret, and it stays in the environment). An
// unset env var would put her in no group at all — a form that appears to work and
// sends nothing. In code, that failure cannot happen silently.
//
// Created 2026-08-06 against the live account. Re-verify any time with:
//   curl -H "Authorization: Bearer $MAILERLITE_API_KEY" \
//        https://connect.mailerlite.com/api/groups
//
// Adding a fourth book: add the entry here, put the PDF in docs/downloads/, add the
// row to docs/freebies.html and the homepage band, then create the group + automation
// in MailerLite. The owner-facing walkthrough for that last part lives OUTSIDE this
// repo (docs/ here is the public website):
//   yt-zane/docs/mailerlite-freebies-setup-2026-08-06.html
// The book's marketing facts also get an entry in yt-zane/config/cta-offers.yaml.

// The delivery trigger. ONE automation watches this group. Do not point an automation at
// the per-book groups as well, or she gets two emails for one download.
const ALL_GROUP = "195075546299761822"; // "Free books — all"

const FREEBIES = {
  "10-psychology-hacks": {
    title: "10 Psychology Hacks That Actually Work",
    file: "/downloads/10-psychology-hacks.pdf",
    group: "195065261486769373", // Freebie — 10 Psychology Hacks
  },
  "rebuild-15-things": {
    title: "REBUILD",
    file: "/downloads/rebuild-15-things.pdf",
    group: "195065261800293762", // Freebie — REBUILD
  },
  "the-night-shift": {
    title: "The Night Shift",
    file: "/downloads/the-night-shift.pdf",
    group: "195065262022591513", // Freebie — The Night Shift
  },
};

// Reading order. The books cross-reference each other — The Night Shift calls
// 10 Psychology Hacks "the first book" and REBUILD "book two" — so this order is the
// series, not a preference.
const ORDER = ["10-psychology-hacks", "rebuild-15-things", "the-night-shift"];

function get(slug) {
  return Object.prototype.hasOwnProperty.call(FREEBIES, String(slug || "")) ? FREEBIES[slug] : null;
}

// Every book, flagged with the one she actually asked for.
//
// She asks for one and receives all three, on the page AND in the email. The two have to
// match: the delivery email carries all three links (one automation, owner ruling
// 2026-08-06), so a page that handed over a single file would be stingier than the email
// she gets a minute later. Which book she ASKED for is still recorded — that's her own
// per-book group, and it's the useful signal about what is actually wrong tonight.
function list(requestedSlug) {
  const want = String(requestedSlug || "");
  return ORDER.map((slug) => ({
    slug,
    title: FREEBIES[slug].title,
    file: FREEBIES[slug].file,
    requested: slug === want,
  }));
}

// Both groups, in one place, so the endpoint can't accidentally send only one of them.
function groupsFor(slug) {
  const book = get(slug);
  return book ? [book.group, ALL_GROUP] : [];
}

module.exports = { FREEBIES, ORDER, get, list, groupsFor, ALL_GROUP };
