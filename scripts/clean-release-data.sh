#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[OfferLoom] Removing generated answers, local mirrors, model caches, and SQLite artifacts"
find data/generated -mindepth 1 ! -name '.gitkeep' -delete
find data/sources -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
find data/models -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
rm -f data/offerloom.db data/offerloom.db-shm data/offerloom.db-wal

echo "[OfferLoom] Public data directories are now clean"
