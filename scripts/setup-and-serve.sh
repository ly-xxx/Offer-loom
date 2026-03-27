#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${OFFERPOTATO_SOURCES_CONFIG:-$ROOT_DIR/config/sources.json}"
WORK_MANIFEST_PATH="${OFFERPOTATO_WORK_MANIFEST:-$ROOT_DIR/config/work-manifest.json}"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

cd "$ROOT_DIR"

echo "[OfferPotato] Installing dependencies"
npm install

if ! command -v codex >/dev/null 2>&1; then
  echo "[OfferPotato] codex / codex-cli was not found in PATH."
  echo "[OfferPotato] Install Codex CLI first, then run this script again."
  exit 1
fi

echo "[OfferPotato] Using source config: $CONFIG_PATH"
echo "[OfferPotato] Using work manifest: $WORK_MANIFEST_PATH"
echo "[OfferPotato] Default public sources live under ./sources, and your private project corpus should go in ./mywork or a custom path from Settings."
echo "[OfferPotato] After the first launch, you can finish source selection and mywork binding from the web Settings drawer."

if [[ -n "${http_proxy:-}${HTTP_PROXY:-}${https_proxy:-}${HTTPS_PROXY:-}${ALL_PROXY:-}${all_proxy:-}" ]]; then
  echo "[OfferPotato] Proxy variables detected."
  echo "[OfferPotato] If browser or curl shows 502 / Bad Gateway, bypass proxy for: 127.0.0.1, localhost${LAN_IP:+, ${LAN_IP}}"
fi

echo "[OfferPotato] Syncing guide and question-bank sources"
npm run bootstrap

echo "[OfferPotato] Building SQLite knowledge base"
npm run build:data

if [[ "${PRETRANSLATE_QUESTIONS:-1}" == "1" ]]; then
  echo "[OfferPotato] Translating interview questions into Chinese via Codex"
  npm run batch:translate-questions -- \
    --limit "${TRANSLATE_LIMIT:-all}" \
    --batchSize "${TRANSLATE_BATCH_SIZE:-10}" \
    --concurrency "${TRANSLATE_CONCURRENCY:-2}" \
    --model "${TRANSLATE_MODEL:-gpt-5.4}" \
    --effort "${TRANSLATE_EFFORT:-low}"
fi

if [[ "${PREGENERATE_ANSWERS:-0}" == "1" ]]; then
  echo "[OfferPotato] Pre-generating answer packages"
  npm run batch:generate -- \
    --limit "${BATCH_LIMIT:-20}" \
    --concurrency "${BATCH_CONCURRENCY:-2}" \
    --model "${BATCH_MODEL:-gpt-5.2}" \
    --effort "${BATCH_EFFORT:-medium}"
fi

echo "[OfferPotato] Building frontend and backend"
npm run build

echo "[OfferPotato] Launching on port ${PORT:-6324}"
echo "[OfferPotato] Open http://127.0.0.1:${PORT:-6324}${LAN_IP:+ or http://${LAN_IP}:${PORT:-6324}}"
PORT="${PORT:-6324}" npm start
