// mailerlite.js — push a quiz completer into the list so the automation emails her
// her result. Env-gated: with no MAILERLITE_API_KEY this is a no-op, so the site runs
// exactly as before.
//
// WHY THE NOTE IS NOT IN HERE. MailerLite custom fields cap at 1024 chars and REJECT the
// whole request (422) past it — verified against the live API on 2026-07-13, not guessed;
// their docs state no limit at all. Zane's note runs ~750 chars, so one long note would
// 422 the push and she'd silently get no email. So we send her *result URL* instead and the
// note stays on /r/<id> where it already lives. Short fields can't fail, and the link pulls
// her back to the site where the chat is.

const API = "https://connect.mailerlite.com/api";

function enabled() {
  return !!(process.env.MAILERLITE_API_KEY && process.env.MAILERLITE_GROUP_ID);
}

// Documented upsert: re-sending the same email updates rather than duplicating.
async function syncSubscriber({ email, name, profile, resultUrl }) {
  if (!enabled() || !email) return { skipped: true };

  const res = await fetch(`${API}/subscribers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email,
      fields: {
        name: name || "",
        profile: profile || "",
        result_url: resultUrl || "",
      },
      groups: [process.env.MAILERLITE_GROUP_ID],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`mailerlite ${res.status}: ${detail.slice(0, 200)}`);
  }
  return { ok: true };
}

module.exports = { syncSubscriber, enabled };
