#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if pgrep -f "node dist/server/index.js" >/dev/null 2>&1 && [[ "${OFFERLOOM_ALLOW_LIVE_REBUILD:-0}" != "1" ]]; then
  echo "[OfferLoom] The site is currently running and holds the SQLite DB open."
  echo "[OfferLoom] Stop \`npm start\` first, then run \`npm run refresh:data\` again."
  echo "[OfferLoom] If you really want to try a live rebuild anyway, run with OFFERLOOM_ALLOW_LIVE_REBUILD=1."
  exit 1
fi

echo "[OfferLoom] Refreshing source mirrors"
npm run bootstrap

echo "[OfferLoom] Rebuilding database"
npm run build:data
