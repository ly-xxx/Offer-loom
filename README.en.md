<p align="center">
  <img src="./README_asset/11cadb915ae5ef40c5dd9c950a097dad.png" alt="OfferPotato repo banner" width="100%" />
</p>

# OfferPotato

<p align="center">
  <a href="https://github.com/ly-xxx/Offer-loom/stargazers"><img src="https://img.shields.io/github/stars/ly-xxx/Offer-loom?style=flat-square" alt="GitHub stars" /></a>
  <a href="https://github.com/ly-xxx/Offer-loom/network/members"><img src="https://img.shields.io/github/forks/ly-xxx/Offer-loom?style=flat-square" alt="GitHub forks" /></a>
  <a href="https://github.com/ly-xxx/Offer-loom/issues"><img src="https://img.shields.io/github/issues/ly-xxx/Offer-loom?style=flat-square" alt="GitHub issues" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/local--first-workspace-0f766e?style=flat-square" alt="local first" />
  <img src="https://img.shields.io/badge/Codex%20CLI-managed-111827?style=flat-square" alt="Codex CLI managed" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/SQLite-indexed-0f80cc?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite indexed" />
  <img src="https://img.shields.io/badge/docs-ZH%20%7C%20EN-2563eb?style=flat-square" alt="Chinese and English docs" />
</p>

<p align="center">
  <a href="./README.md">中文 README</a> ·
  <a href="./docs/TECHNICAL_REPORT.en.md">Technical Report</a> ·
  <a href="./docs/MYWORK.en.md">mywork Guide</a> ·
  <a href="./docs/TROUBLESHOOTING.en.md">Troubleshooting</a>
</p>

> Turn a full guide into a study path, fold interview questions into footnotes, turn your own work into answers you can actually speak out loud, and then let a harsh interviewer keep drilling deeper.

OfferPotato is a local-first interview-preparation workspace.

You bring three kinds of input:

- a study guide
- interview question banks
- your own work materials such as papers, code, design docs, experiment logs, and notes

OfferPotato turns them into a study-and-practice website you can really use:

- the guide stays in its original learning order
- interview questions sink to chapter endings and highlight the matching knowledge points
- each question can generate a personalized answer that cites both guide knowledge and `mywork`
- every question can also enter interviewer pressure mode, where a deliberately tough interviewer keeps following up

If you feel stuck because:

- you have too many docs and no idea what to study first
- interviewers keep asking “tell me about your project” and you do not know how to connect your experience to core concepts
- you can answer surface-level questions but break down when the interviewer keeps digging
- you want Codex to help, but you do not want to hand-build the indexing, prompting, batching, and UI yourself

then this repo is probably worth a try.

## What it does in 30 seconds

| You provide | OfferPotato does | You get |
| --- | --- | --- |
| guide documents | preserves order, extracts anchors, builds a reading path | a guide-centered study site |
| interview question banks | deduplicates, categorizes, and links questions to anchors and chapters | a clear map from concepts to questions |
| `mywork/` | scans recursively, grades relevance, and cites conservatively | answers that sound like your own experience when evidence exists |
| Codex | runs managed jobs with live refresh | translation, answer generation, import, and follow-up workflows |

OfferPotato is not limited to LLM interviews. The same pattern works for any domain where you can provide study material, interview questions, and candidate work evidence.

## Why it is different from a normal question bank

- it does not flatten everything into a giant list of questions
- it does not force every answer to sound project-backed when your work is actually unrelated
- it combines the guide, question bank, `mywork`, and Codex inside one workspace
- it does not stop at generating an answer; it can keep pushing you in interviewer pressure mode

## Core features

- Guide-centered study flow
  Read the guide in source order as your main learning path.
- Interview backlinks and knowledge highlights
  Questions appear at the end of each chapter and at the exact knowledge points they hit.
- Personalized answer generation
  Answers combine guide context, question context, and relevant `mywork` evidence.
- Interviewer pressure mode
  A deliberately harsh interviewer can keep drilling into implementation details, tradeoffs, metrics, and failure cases.
- Managed Codex window
  Use Codex inside the site with file attachment, current-document reference, and model or effort switching.
- Visual first-run setup and task center
  Configure sources, build indexes, and monitor jobs from the UI.
- Interview import
  Add new interview content via pasted text or screenshot OCR and persist it as question-bank content.

## Try it in 3 minutes

Even if you have not prepared your own data yet, you can still clone the repo and explore the built-in public examples first.

```bash
git clone https://github.com/ly-xxx/Offer-loom.git
cd Offer-loom
npm install
npm run setup:serve
```

The default flow will:

1. verify that `codex` or `codex-cli` is available
2. sync public sources from config
3. build the SQLite index
4. build the frontend and backend
5. launch on port `6324`

Then open:

- `http://127.0.0.1:6324`
- or the LAN URL printed by the script

If you do not yet have a practical `codex` / `codex-cli` access path, many users search for a `codex relay` or `codex proxy` service. For light usage, some people keep the daily cost around 1 to 2 CNY, but pricing, stability, and compliance depend on the provider and should be evaluated by you.

## UI preview

### Workspace overview

![OfferPotato workspace overview](./README_asset/292ece0672fc4478abbc501520177393.png)

The guide, highlighted knowledge points, chapter-level interview questions, `mywork` evidence, and the floating Codex window all live in one place.

### Global search is not a separate dead-end page. It keeps the guide, question bank, and Codex in one workspace.

| Search can hit both interview questions and guide chapters | Once you find a hit, you can jump straight back into the guide and keep asking Codex |
| --- | --- |
| ![OfferPotato global search overview](./README_asset/c0a06192043379ef07c1287910a9da7b.png) | ![OfferPotato search-to-guide workflow](./README_asset/acc379d1da56130e7709d2d8062c382b.png) |

### The managed Codex window can edit the currently opened guide document and reflect changes live

| Before edit | Agent editing in progress | Edit completed |
| --- | --- | --- |
| ![Guide document before Codex edit](./README_asset/3c06dd4d2b1e1d46857a3faf832f6cfc.png) | ![Codex actively editing the guide](./README_asset/b635d9f7e98f3f39834d703fb1b0dcb8.png) | ![Guide after Codex edit is applied](./README_asset/8d9928318bf6a07a586fbda7e992eebd.png) |

This is not just a terminal embedded in a browser. It is a managed workflow that ties together the current guide page, file references, instruction input, and live write-back.

### Personalized answers are not one-line outputs. They are structured answer packages you can actually speak from.

![Personalized answer overview](./README_asset/4230928b02ccc7c565f42fc180b560bf.png)

| 20-second opener, project basis, and direct answer | Knowledge skeleton, missing basics, and generation history | High-probability next follow-ups, tracebacks, and interviewer entry |
| --- | --- | --- |
| ![Personalized answer opener and project bridge](./README_asset/3a47b88c2f9cc1e2a837629fad34c8a7.png) | ![Knowledge skeleton and generation history](./README_asset/bd635698aad341192467beb2c8b03546.png) | ![Follow-up prompts and citation tracebacks](./README_asset/b355d4d9c8d5ece9dc92db2405dcccc7.png) |

The system does not stop at a “final answer”. It keeps the evidence trail, project angle, knowledge map, follow-up questions, and generation history in the same answer view.

### Interviewer pressure mode keeps drilling until your answer can survive real follow-ups

| Round one: when you say you do not know, it still forces you to expose your reasoning path | Round two: after you answer, it keeps drilling deeper |
| --- | --- |
| ![Interviewer pressure mode first round after candidate says they do not know](./README_asset/2944eaeb537423af27f22fba3e300831.png) | ![Interviewer pressure mode second round after the candidate answers](./README_asset/876b3f94973160d69c746c5e1b92d6b3.png) |

If you thought answer generation was the finish line, this mode quickly turns it into an actual mock interview. The first round does not let “I do not know” end the exchange; the second round keeps testing your detail level, boundaries, and prioritization even after you respond.

### Themes and configuration are part of the product, not an afterthought

| Mist | Slate | Paper |
| --- | --- | --- |
| ![OfferPotato mist theme](./README_asset/theme/40c6de9cc9168d0321e20da5e4293fb0.png) | ![OfferPotato slate theme](./README_asset/theme/51b64c9c60d7b271429cf4921a4ed835.png) | ![OfferPotato paper theme](./README_asset/theme/93043bb97a58b8615fec834e099e1e55.png) |

## Built-in public example sources

The repo already ships with public example content so a fresh clone can start immediately:

- `sources/documents/llm-agent-interview-guide`
- `sources/question-banks/llm-interview-questions`
- `sources/question-banks/qa-hub`

See [docs/SOURCES.en.md](./docs/SOURCES.en.md) for upstream attribution.

For your own data, the recommended layout is:

- `sources/documents/` for study guides
- `sources/question-banks/` for interview question banks
- `./mywork/` for your own projects, papers, code, and notes

`mywork/` stays out of Git by default.

## What belongs in `mywork`

Useful inputs include:

- project READMEs
- paper PDFs or drafts
- code directories
- notebooks
- experiment logs
- technical design notes
- debugging and retrospective notes

See [docs/MYWORK.en.md](./docs/MYWORK.en.md) for suggested organization.

OfferPotato handles `mywork` conservatively:

- it checks whether a directory looks like a real project before deep indexing
- it stops early on empty shells or structurally mismatched folders
- it only recurses deeply when the materials can support a coherent project profile
- it down-ranks weakly related projects instead of force-matching them

That is why work evidence is graded as:

- `direct`
- `adjacent`
- `none`

The goal is honest personalization, not fake project matching.

## First-run setup flow

Recommended sequence:

1. run `npm run setup:serve`
2. open the site
3. review the default public sources in Settings
4. bind `mywork` to your own directory, or keep `./mywork`
5. start an indexing job from Settings and watch progress in Tasks
6. begin from the guide view, then generate answers or open interviewer pressure mode

If you do not want the default sources, Settings can switch them to:

- local directories
- Git repositories

## Automatic source discovery

OfferPotato auto-discovers this structure:

```text
sources/
├── documents/
│   └── <your-guide-source>/
└── question-banks/
    └── <your-question-bank-source>/
```

In practice, adding a new public source often means placing a new directory there, saving Settings, and rebuilding the index.

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
  execute batch jobs through Codex
- `npm run build`
  build frontend and backend
- `npm run start`
  start the production server
- `npm run setup:serve`
  install, index, build, and launch in one command
- `npm run clean:data`
  clean databases, generated answers, caches, and intermediate artifacts

## Further reading

- [docs/TECHNICAL_REPORT.en.md](./docs/TECHNICAL_REPORT.en.md)
  architecture, managed agents, skills, data flow, and persistence
- [docs/MYWORK.en.md](./docs/MYWORK.en.md)
  how to organize `mywork`
- [docs/CONFIGURATION.en.md](./docs/CONFIGURATION.en.md)
  source configuration and runtime overrides
- [docs/CLI_AGENT.en.md](./docs/CLI_AGENT.en.md)
  embedded CLI agent behavior
- [docs/TROUBLESHOOTING.en.md](./docs/TROUBLESHOOTING.en.md)
  troubleshooting notes

## Release and privacy boundaries

The repo follows a “public base + private workset” publishing model:

- public guides and question banks stay in the repo
- `mywork/` stays out of Git by default
- `config/*.runtime.json` stays out of Git by default
- databases, generated answers, and model caches should not be committed

Before publishing or sharing the repo, read:

- [docs/RELEASE.en.md](./docs/RELEASE.en.md)
- [docs/PRIVACY.en.md](./docs/PRIVACY.en.md)

## Star History

<a href="https://www.star-history.com/#ly-xxx/Offer-loom&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date" />
  </picture>
</a>
