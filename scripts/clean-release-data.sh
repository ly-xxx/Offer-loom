#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[OfferPotato] Removing generated answers, local mirrors, model caches, and SQLite artifacts"
find data/generated -mindepth 1 ! -name '.gitkeep' -delete
find data/sources -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
find data/models -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
rm -f \
  data/offerpotato.db data/offerpotato.db-shm data/offerpotato.db-wal

echo "[OfferPotato] Public data directories are now clean"
