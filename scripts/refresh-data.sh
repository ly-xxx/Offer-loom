#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ALLOW_LIVE_REBUILD="${OFFERPOTATO_ALLOW_LIVE_REBUILD:-0}"

if pgrep -f "node dist/server/index.js" >/dev/null 2>&1 && [[ "$ALLOW_LIVE_REBUILD" != "1" ]]; then
  echo "[OfferPotato] The site is currently running and holds the SQLite DB open."
  echo "[OfferPotato] Stop \`npm start\` first, then run \`npm run refresh:data\` again."
  echo "[OfferPotato] If you really want to try a live rebuild anyway, run with OFFERPOTATO_ALLOW_LIVE_REBUILD=1."
  exit 1
fi

echo "[OfferPotato] Refreshing source mirrors"
npm run bootstrap

echo "[OfferPotato] Rebuilding database"
npm run build:data
