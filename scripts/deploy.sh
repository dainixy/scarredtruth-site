#!/usr/bin/env bash
# Deploy scarredtruth.com.
#
# WHY THIS SCRIPT EXISTS — read before you "simplify" it:
# Render's dashboard says autoDeploy: yes, but there is NO GitHub webhook and no Render
# GitHub App on dainixy/scarredtruth-site. Check it yourself:
#     gh api repos/dainixy/scarredtruth-site/hooks     -> []
# So Render never hears about a push. Every deploy in this service's entire history was
# triggered by `api` or `manual` — not one by a push. `git push` alone does NOTHING.
# It looks like it worked, and the site silently keeps serving the previous commit.
#
# Until someone reconnects the repo in the Render dashboard (Settings -> Build & Deploy ->
# reconnect GitHub, which installs the App/webhook), THIS is how the site ships.
#
# Usage:  ./scripts/deploy.sh            push current branch + deploy + verify
#         ./scripts/deploy.sh --no-push  deploy whatever is already on origin/main
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="https://scarredtruth.com"

# Credentials live in yt-zane/.env (RENDER_API_KEY, RENDER_SCARREDTRUTH_SERVICE_ID).
for f in "$ROOT/.env" "$HOME/Documents/claude/yt-zane/.env"; do
  [ -f "$f" ] && { set -a; . "$f"; set +a; }
done
: "${RENDER_API_KEY:?RENDER_API_KEY not found (expected in yt-zane/.env)}"
: "${RENDER_SCARREDTRUTH_SERVICE_ID:?RENDER_SCARREDTRUTH_SERVICE_ID not found (expected in yt-zane/.env)}"
API="https://api.render.com/v1/services/$RENDER_SCARREDTRUTH_SERVICE_ID"
AUTH=(-H "Authorization: Bearer $RENDER_API_KEY")

if [ "${1:-}" != "--no-push" ]; then
  cd "$ROOT"
  [ -n "$(git status --porcelain)" ] && { echo "uncommitted changes — commit first:"; git status --short; exit 1; }
  echo "==> pushing $(git rev-parse --short HEAD)"
  git push origin "$(git branch --show-current)"
fi

echo "==> triggering deploy (a push alone will NOT do this — see header)"
DID=$(curl -fsS -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
        -d '{"clearCache":"do_not_clear"}' "$API/deploys" \
      | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')

echo "==> deploy $DID"
for i in $(seq 1 60); do
  S=$(curl -fsS "${AUTH[@]}" "$API/deploys/$DID" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')
  printf '    %s\n' "$S"
  case "$S" in
    live) break ;;
    build_failed|update_failed|canceled|pre_deploy_failed)
      echo "DEPLOY FAILED: $S  — logs: https://dashboard.render.com/web/$RENDER_SCARREDTRUTH_SERVICE_ID"
      exit 1 ;;
  esac
  sleep 10
done
[ "$S" = "live" ] || { echo "timed out waiting for deploy"; exit 1; }

echo "==> verifying production"
fail=0
check() { c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE$1"); \
          [ "$c" = "$2" ] && printf '    ok   %-44s %s\n' "$1" "$c" \
                          || { printf '    FAIL %-44s %s (want %s)\n' "$1" "$c" "$2"; fail=1; }; }
check "/"                                            200
check "/zane-story.html"                             200
check "/her-own-woman-quiz.html"                     200
check "/talk-to-zane-ai.html"                        200
check "/quiz-all-profiles.html"                      200
check "/scarred-truth-stories.html"                  200
check "/zane/chat.js"                                200
check "/site-assets/zane-story-narration.mp3"        200
check "/site-assets/fonts/newsreader-roman.woff2"    200
# the old URLs must keep answering a 301 — that's what protects the search traffic
check "/zane-story-light.html"                       301
check "/scarred-truth-quiz-light.html"               301
check "/all-profiles.html"                           301
check "/scarred-truth-stories-light.html"            301
check "/zane/index-light.html"                       301
check "/index-light.html"                            301
# a 7:59 track is unseekable without Range support
r=$(curl -s -o /dev/null -w '%{http_code}' -H "Range: bytes=0-1" --max-time 20 "$SITE/site-assets/zane-story-narration.mp3")
[ "$r" = "206" ] && printf '    ok   %-44s 206\n' "audio HTTP Range (seeking)" \
                 || { printf '    FAIL audio Range -> %s (want 206)\n' "$r"; fail=1; }

[ $fail -eq 0 ] && echo "==> LIVE and verified: $SITE" || { echo "==> deployed but VERIFICATION FAILED"; exit 1; }
