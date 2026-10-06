#!/usr/bin/env bash
# One-shot production setup for Canopy Fashion Studio. Run from the repo root:  bash scripts/ship.sh
# Prereq (once): accept Neon's Marketplace terms in the browser:
#   https://vercel.com/prateekdevashettis-projects/~/integrations/accept-terms/neon?source=cli
# Secrets are read from .env.local and piped straight into Vercel/Railway — never printed.
set -euo pipefail

SCOPE="prateekdevashettis-projects"
PROJECT="canopy-fashion-studio"
APP_URL="${APP_URL:-https://canopy-fashion-studio.vercel.app}"
cd "$(dirname "$0")/.."

val() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2-; }
rand() { node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"; }

echo "▶ 1/7 Neon database (Vercel Marketplace)"
if ! vercel env ls production --scope "$SCOPE" 2>/dev/null | grep -q "DATABASE_URL"; then
  vercel integration add neon --name "$PROJECT" --no-env-pull --scope "$SCOPE"
fi

echo "▶ 2/7 Pull production DATABASE_URL (to a private temp file)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
vercel env pull "$TMP/.env.prod" --environment=production --yes --scope "$SCOPE" >/dev/null
DBURL="$(grep -E '^DATABASE_URL=' "$TMP/.env.prod" | cut -d= -f2- | tr -d '"')"
[ -n "$DBURL" ] || { echo "No DATABASE_URL on the Vercel project yet — accept Neon terms first."; exit 1; }

echo "▶ 3/7 Push schema to Neon"
( cd packages/core && DATABASE_URL="$DBURL" npx drizzle-kit push --force >/dev/null ) && echo "  schema ok"

echo "▶ 4/7 Vercel environment"
CRON="$(rand)"; GUEST="$(rand)"
setv() { # name value
  for env in production preview; do
    vercel env rm "$1" "$env" --yes --scope "$SCOPE" >/dev/null 2>&1 || true
    printf '%s' "$2" | vercel env add "$1" "$env" --scope "$SCOPE" >/dev/null
  done
  echo "  $1"
}
for k in FAL_KEY OPENROUTER_API_KEY GEMINI_API_KEY S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_PREFIX CLERK_SECRET_KEY NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; do
  setv "$k" "$(val "$k")"
done
setv NEXT_PUBLIC_APP_URL "$APP_URL"
setv FASHION_ENGINE_MODE worker
setv CRON_SECRET "$CRON"
setv GUEST_SECRET "$GUEST"

echo "▶ 5/7 Railway worker environment"
railway link --project "$PROJECT" --service fashion-worker >/dev/null 2>&1 || true
railway variables --service fashion-worker --skip-deploys \
  --set "DATABASE_URL=$DBURL" \
  --set "FAL_KEY=$(val FAL_KEY)" \
  --set "OPENROUTER_API_KEY=$(val OPENROUTER_API_KEY)" \
  --set "S3_ENDPOINT=$(val S3_ENDPOINT)" \
  --set "S3_BUCKET=$(val S3_BUCKET)" \
  --set "S3_ACCESS_KEY_ID=$(val S3_ACCESS_KEY_ID)" \
  --set "S3_SECRET_ACCESS_KEY=$(val S3_SECRET_ACCESS_KEY)" \
  --set "S3_PREFIX=$(val S3_PREFIX)" \
  --set "NEXT_PUBLIC_APP_URL=$APP_URL" \
  --set "NODE_ENV=production" \
  --set "WORKER_CONCURRENCY=6" >/dev/null
echo "  worker vars set"

echo "▶ 6/7 Deploy worker (Railway) and web (Vercel)"
railway up --service fashion-worker --detach >/dev/null && echo "  worker deploying"
vercel deploy --prod --yes --scope "$SCOPE" | tail -1

echo "▶ 7/7 Health"
sleep 10
curl -fsS "$APP_URL/api/health" && echo
echo "Done. Open $APP_URL"
