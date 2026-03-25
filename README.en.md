# OfferLoom

[中文 README](./README.md)

OfferLoom is a local-first interview-preparation workspace that applies one indexing, retrieval, and generation pipeline to three classes of input:

- structured study guides
- interview question banks
- personal work materials such as papers, code, design notes, experiment logs, and notebooks

The system is built around two principles:

- preserve study order by treating the guide as the primary reading surface
- keep answer generation evidence-aware by introducing project experience only when `mywork` contains sufficiently relevant support

OfferLoom is not limited to LLM interviews. The same workflow can be applied to any domain as long as you can provide study materials, interview questions, and candidate work materials for that domain.

## Main capabilities

- Guide-centered study flow
  The main UI follows the document order of the guide instead of flattening everything into a question list.
- Interview backlinks
  Questions are attached to concrete knowledge points and chapter endings, with exact hits separated from chapter-level extensions.
- Personalized answers
  Answers are generated from guide context, question context, and `mywork` evidence; when project evidence is weak or absent, the answer remains knowledge-driven.
- Conservative `mywork` scanning
  The system evaluates whether a directory forms a credible project before indexing it deeply.
- In-site Codex collaboration
  A managed floating Codex console can reference the current document, attach files, and switch to a true PTY terminal path when needed.
- Visual first-run setup
  Source selection, indexing, and job monitoring can be completed in the browser.
- Interview import
  New interview material can be added through pasted text or screenshot OCR and persisted as question-bank content.

## Built-in public example sources

The repository already includes public sample content so a fresh clone can start immediately:

- `sources/documents/llm-agent-interview-guide`
- `sources/question-banks/llm-interview-questions`
- `sources/question-banks/qa-hub`

Their upstream repositories are listed in [docs/SOURCES.en.md](./docs/SOURCES.en.md).

Private work materials are expected under:

- `./mywork/`

`mywork/` is ignored by default and should not be published.

## Prerequisites

Before first use, confirm the following:

1. `codex` or `codex-cli` is installed and executable on the host machine
2. you have prepared your own work-material directory

Recommended `mywork/` contents include:

- project READMEs
- paper PDFs or drafts
- code directories
- notebooks
- experiment logs
- technical design notes
- debugging and retrospective notes

See [docs/MYWORK.en.md](./docs/MYWORK.en.md) for a suggested structure.

## Quick start

```bash
npm install
npm run setup:serve
```

The default flow will:

1. check whether `codex` is available
2. sync Git-backed sources declared in the config
3. build the SQLite index
4. build the frontend and backend
5. start the service on port `6324`

Then open:

- `http://127.0.0.1:6324`
- or the LAN URL printed by the startup script

## Step-by-step startup

If you want to control each stage explicitly:

```bash
npm install
npm run bootstrap
npm run build:data
npm run build
npm start
```

## First-run setup in the UI

Recommended first-run sequence:

1. run `npm run setup:serve`
2. open the site
3. review the default public sources in Settings
4. point `mywork` to your own directory, or keep `./mywork` under the repo root
5. start the indexing job from Settings and monitor progress in the Tasks panel
6. begin from the guide view or switch to the interview view after indexing completes

Settings is responsible for:

- source configuration
- theme and typography
- index actions

Tasks is responsible for:

- indexing jobs
- personalized answer generation jobs
- managed Codex jobs

If you do not want the default sources, the Settings panel can switch them to:

- local directories
- Git repositories

## Automatic source discovery

OfferLoom automatically discovers sources under:

```text
sources/
├── documents/
│   └── <your-guide-source>/
└── question-banks/
    └── <your-question-bank-source>/
```

In practice, adding a new public source often means placing a directory in the correct location, saving settings, and rebuilding the index.

The Settings UI also supports manual registration for:

- local directories
- Git repositories

## How `mywork` is handled

OfferLoom scans `mywork` conservatively:

- it first checks whether a directory forms a credible project
- it stops early for clearly empty or structurally mismatched directories
- it only recurses deeply when the material can support a coherent project profile
- it down-ranks weakly related projects instead of force-matching them

For that reason, work evidence is graded into:

- `direct`
- `adjacent`
- `none`

The goal is to keep personalized answers honest and traceable rather than making every answer sound project-backed.

## Technical notes

Implementation details are documented in [docs/TECHNICAL_REPORT.en.md](./docs/TECHNICAL_REPORT.en.md), including:

- system architecture and component boundaries
- managed agents and supporting workers
- skills and their current integration status
- collaboration modes with `codex-cli`
- data flow, indexing, and persistence
- frontend data models and UI responsibilities

The README is intended for onboarding. The technical report is intended for architecture, execution model, and schema-level details.

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

## Release and privacy boundaries

The repository is intended to be published as a public base with a private workset layered on top:

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
  system architecture, agents, skills, data flow, and schemas
- [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)
  Chinese system report
- [docs/SOURCES.en.md](./docs/SOURCES.en.md)
  built-in public sources and upstream attribution
- [docs/SOURCES.md](./docs/SOURCES.md)
  Chinese source list
- [docs/MYWORK.en.md](./docs/MYWORK.en.md)
  recommended structure for `mywork`
- [docs/MYWORK.md](./docs/MYWORK.md)
  Chinese `mywork` guide
- [docs/CONFIGURATION.en.md](./docs/CONFIGURATION.en.md)
  source configuration and runtime overrides
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
  Chinese configuration guide
- [docs/RELEASE.en.md](./docs/RELEASE.en.md)
  release checklist
- [docs/RELEASE.md](./docs/RELEASE.md)
  Chinese release checklist
- [docs/PRIVACY.en.md](./docs/PRIVACY.en.md)
  privacy notes
- [docs/PRIVACY.md](./docs/PRIVACY.md)
  Chinese privacy notes
- [docs/TROUBLESHOOTING.en.md](./docs/TROUBLESHOOTING.en.md)
  troubleshooting notes
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
  Chinese troubleshooting notes
- [docs/CLI_AGENT.en.md](./docs/CLI_AGENT.en.md)
  embedded CLI agent runtime notes
- [docs/CLI_AGENT.md](./docs/CLI_AGENT.md)
  Chinese embedded CLI agent notes
