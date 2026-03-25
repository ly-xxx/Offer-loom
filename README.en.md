# OfferLoom

[中文 README](./README.md)

OfferLoom is an interview-prep workspace that weaves together a guided study track, interview question banks, and your own work materials into one evidence-aware learning flow.

Instead of flattening everything into a giant question list, it does three things:

- treats the full guide as the primary learning path, so you can study in sequence
- folds interview questions into chapter footnotes and highlights the knowledge points they actually hit
- pulls in real projects, papers, code, and notes from `mywork/`, but only cites them when they are genuinely relevant

For GitHub users, the goal is straightforward:

- it runs out of the box with built-in public example sources
- first-run configuration can be completed visually in the web UI
- you only need to prepare `codex` / `codex-cli` and your own `mywork` directory

## What makes it different

OfferLoom splits each knowledge point into three layers:

1. Mainline knowledge
   The guide remains the first-person learning view, so study order stays intact.
2. Interview backlinks
   Questions are attached to knowledge points instead of living in a disconnected list, and the UI marks whether they truly appear in the mainline.
3. Personalized answers
   Answers cite the guide first. They only lean on `mywork` when there is real supporting evidence.

That means OfferLoom does not force project talk into every answer. If a question is foundational, or your work is simply not relevant, the system says so honestly and keeps the answer knowledge-driven.

## Core matching pattern

The release build uses a deliberate “high recall + high precision pruning” pattern:

- the guide is retrieved hierarchically
  it first tries to match concrete knowledge anchors, then chapter-level candidates
- exact hits and chapter fallbacks are separated
  only high-confidence questions are attached to a paragraph; weaker but still chapter-relevant questions go to the end-of-chapter extension bucket
- `mywork` is graded honestly
  `direct`: the project can truly support this answer
  `adjacent`: only neighboring experience exists, so the answer may bridge carefully
  `none`: there is no useful project evidence, so the system does not fake one
- personalized answers follow “answer first, then decide whether project evidence is needed”
  simple and purely foundational questions are allowed to stay project-free

This aligns with mainstream RAG / hybrid retrieval practice:

- hybrid lexical + semantic recall first
- rerank / precision gates second, so weak matches are not disguised as exact hits
- a fallback bucket for theme-level relevance instead of stuffing weak candidates into the wrong chunk

See [docs/TECHNICAL_REPORT.en.md](./docs/TECHNICAL_REPORT.en.md) for the technical details.

## Technical report in one glance

If you found this project from GitHub search, these keywords describe the core shape of OfferLoom:

- hybrid retrieval
- precision gate
- chapter fallback bucket
- interview question backlinking
- personalized interview answer generation
- `mywork` evidence grading
- visual onboarding
- one-command local deploy

The details live in [docs/TECHNICAL_REPORT.en.md](./docs/TECHNICAL_REPORT.en.md). The README is for onboarding; the technical report explains why the system is built this way.

## Built-in public example sources

The repository ships with public sample content so that GitHub users can run it immediately:

- `sources/documents/llm-agent-interview-guide`
- `sources/question-banks/llm-interview-questions`
- `sources/question-banks/qa-hub`

Their public upstream repositories are listed in [docs/SOURCES.en.md](./docs/SOURCES.en.md).

Your private materials only need to live in:

- `./mywork/`

`mywork/` is ignored by default and should not be published.

## What you should prepare before first use

Please confirm two things first:

1. `codex` / `codex-cli` is installed and executable on the host machine.
2. You already have your own work-material directory.

Recommended `mywork` contents include:

- project READMEs
- paper PDFs / drafts
- code directories
- notebooks
- experiment logs
- technical design notes
- debugging retrospectives

More guidance is in [docs/MYWORK.en.md](./docs/MYWORK.en.md).

## One-command startup

```bash
npm install
npm run setup:serve
```

By default, this will:

1. check whether `codex` is available
2. sync Git-backed public sources declared in the config
3. build the SQLite index
4. build the frontend and backend
5. start the service on port `6324`

Then open:

- `http://127.0.0.1:6324`
- or the LAN URL printed by the startup script

## Manual startup

If you want to run the steps separately:

```bash
npm install
npm run bootstrap
npm run build:data
npm run build
npm start
```

## First-run UI flow

The release build supports visual first-run setup in the browser instead of forcing users to edit config files by hand.

Recommended flow:

1. run `npm run setup:serve`
2. open the site
3. review the default public sources in the Settings panel
4. point `mywork` to your own directory, or keep using `./mywork` under the repo root
5. launch the indexing job from Settings and watch the live progress view
6. once indexing finishes, start from the mainline guide or switch to the interview tab

After the first run, the two top-right panels become the main control points:

- Settings manages sources, theme, typography, and index actions
- Tasks shows indexing jobs, answer-generation jobs, and agent status

If you do not want the default sources, the Settings UI can switch them to:

- local directories
- Git repositories

## Automatic source discovery

The app automatically discovers:

```text
sources/
├── documents/
│   └── <your-guide-source>/
└── question-banks/
    └── <your-question-bank-source>/
```

So if a GitHub user drops a new guide or question bank into those folders, then saves settings and rebuilds the index, OfferLoom will bring the new source into the system.

Besides auto-discovery, the Settings UI also supports manual source registration for:

- local directories
- Git repositories

## Conservative `mywork` scanning

OfferLoom does not blindly ingest every file under `mywork`. It scans conservatively:

- it first decides whether a directory really looks like a project
- it stops early if the structure is clearly mismatched or empty
- it only recurses deeply when the directory can form a credible project profile
- projects that barely relate to the current question are down-ranked instead of being force-matched

That is why personalized answers distinguish between:

- `direct`
- `adjacent`
- `none`

The system prefers under-claiming over inventing project-based credibility.

## In-product experience

- the left side is a compact tree sidebar with `Documents / Interviews / My Work`
- the main area expands the guide as a continuous study document, preserving the intended learning order
- each guide section accumulates related interview questions at the bottom; weaker chapter-level matches go into a chapter extension bucket
- the interview tab explicitly shows:
  - whether a question appears in the mainline
  - how many times it appears
  - whether it is an exact hit or only a chapter fallback
  - where the backlinks lead
- clicking a knowledge hit opens a floating knowledge window that shows:
  - related questions
  - personalized answers
  - backlink traces
  - `mywork` evidence quality
- the lower-right corner hosts the managed Codex window
  - it can auto-reference the current document
  - it can search and attach additional files
  - it supports model switching and reasoning effort
- the top-right `+` action can import new interview materials
  - pasted text
  - OCR from screenshots
  - persistent storage into the question bank

## Main scripts

- `npm run bootstrap`
  sync Git-backed public sources declared in config
- `npm run build:data`
  build the SQLite index
- `npm run refresh:data`
  refresh sources and rebuild the index
- `npm run batch:translate-questions`
  batch-translate interview questions
- `npm run batch:generate`
  batch-generate personalized answers
- `npm run batch:codex`
  execute batch tasks through Codex
- `npm run build`
  build both frontend and backend
- `npm run start`
  start the production server
- `npm run setup:serve`
  install, index, build, and launch in one command
- `npm run clean:data`
  clean databases, generated answers, caches, and intermediate artifacts

## Release boundaries

This repository is intentionally structured as “public base + private workset”:

- public sample guides and question banks stay in the repo
- `mywork/` stays out of Git by default
- `config/*.runtime.json` stays out of Git by default
- databases, generated answers, and model caches should not be committed

Before publishing or sharing the repo, read:

- [docs/RELEASE.en.md](./docs/RELEASE.en.md)
- [docs/PRIVACY.en.md](./docs/PRIVACY.en.md)
- [docs/CONFIGURATION.en.md](./docs/CONFIGURATION.en.md)
- [docs/TROUBLESHOOTING.en.md](./docs/TROUBLESHOOTING.en.md)

## Documentation index

- [docs/TECHNICAL_REPORT.en.md](./docs/TECHNICAL_REPORT.en.md)
  retrieval, matching, RAG design, generation strategy, and UI structure
- [docs/SOURCES.en.md](./docs/SOURCES.en.md)
  built-in public example sources and upstream attribution
- [docs/MYWORK.en.md](./docs/MYWORK.en.md)
  recommended structure for `mywork`
- [docs/CONFIGURATION.en.md](./docs/CONFIGURATION.en.md)
  source configuration and runtime overrides
- [docs/RELEASE.en.md](./docs/RELEASE.en.md)
  release checklist
- [docs/PRIVACY.en.md](./docs/PRIVACY.en.md)
  privacy boundaries
- [docs/TROUBLESHOOTING.en.md](./docs/TROUBLESHOOTING.en.md)
  common issue diagnosis
- [docs/CLI_AGENT.en.md](./docs/CLI_AGENT.en.md)
  embedded CLI agent runtime notes
