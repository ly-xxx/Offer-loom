# Release Guide

[中文版本](../docs/RELEASE.md)

This is the pre-release checklist for publishing OfferLoom to GitHub.

## Public content that must stay

- `sources/documents/*`
- `sources/question-banks/*`
- `sources/README.md`
- `mywork/README.md`
- `config/sources.json`
- the doc site, backend, scripts, and public config docs
- upstream attribution for the default example sources, documented in [docs/SOURCES.en.md](./SOURCES.en.md)

## Content that must never be committed

- your real project materials under `mywork/`
- `config/*.runtime.json`
- `data/offerloom.db*`
- generated answers in `data/generated/*`
- `data/models/*`
- temporary source mirrors in `data/sources/*`
- any files copied in from private directories

## Pre-release flow

1. run `npm run clean:data`
2. confirm `config/sources.json` points to repository-local `sources/` and `./mywork`
3. confirm `mywork/` only contains the placeholder README
4. run `npm run build:data`
5. run `npm run build`
6. open port `6324` locally and do a full smoke test
7. keep upstream GitHub links for the sample sources in the README and release notes

## Smoke test

- `curl --noproxy '*' http://127.0.0.1:6324/api/health`
- the first-run dialog must clearly mention `codex` / `codex-cli` and `mywork`
- Settings must show the auto-discovered `sources/documents` and `sources/question-banks`
- the left sidebar must switch cleanly between `Documents` and `My Work`
- document chapters and footnotes must render correctly
- the knowledge window must open correctly
- the Codex window must be able to send a request, stop a job, and switch both model and effort

## Screenshots and demos

- only use public repository materials
- do not show real `mywork`
- do not show local runtime config or absolute paths
- if you demo with the default public data, explicitly mention that they come from:
  - `Lau-Jonathan/LLM-Agent-Interview-Guide`
  - `llmgenai/LLMInterviewQuestions`
  - `KalyanKS-NLP/LLM-Interview-Questions-and-Answers-Hub`
