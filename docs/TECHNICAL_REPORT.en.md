# OfferLoom Technical Report

[中文版本](./TECHNICAL_REPORT.md)

## 1. Overview

OfferLoom is a local-first interview-preparation system that unifies three classes of input:

- structured study guides
- interview question banks
- user-provided work materials such as papers, code, design notes, experiment logs, and notebooks

The current implementation is designed to:

- preserve study order by making the guide the primary reading surface
- build traceable links from questions to knowledge anchors and work evidence
- generate personalized answers only when sufficient project evidence exists
- keep public release assets cleanly separated from private `mywork`

The current release is a single-host system composed of a web frontend, an Express/WebSocket backend, a SQLite data layer, and a local `codex-cli` execution layer.

## 2. Scope and non-goals

### 2.1 Scope

The current system covers:

- source discovery, synchronization, and index construction
- guide-centered rendering with interview backlinks
- `mywork` project scanning, summarization, and evidence grading
- question translation, answer generation, and persistence
- an in-site managed Codex console and an interactive PTY terminal
- first-run visual configuration, task management, and live refresh

### 2.2 Non-goals

The current implementation is not intended to be:

- a general-purpose multi-agent orchestration platform
- a cloud multi-tenant SaaS system
- a heavy online retrieval stack that depends on an external vector database

The system does contain multiple managed agent roles, but they are task-oriented execution components rather than a general autonomous orchestration stack.

## 3. Overall architecture

The system can be described as five layers:

```text
┌─────────────────────────────────────────────────────────────┐
│ Web UI                                                     │
│ Docs / Interviews / My Work / Settings / Jobs / Codex pane │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ HTTP + WebSocket Service                                   │
│ /api/* /ws/codex /ws/watch                                 │
│ Express + ws + job managers                                │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼────────────────┬──────────────────┐
          ▼               ▼                ▼                  ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Index Agent    │ │ Answer Agent   │ │ Console Agent  │ │ PTY Runtime    │
│ build-db       │ │ answer package │ │ managed codex  │ │ interactive CLI│
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
          │               │                │                  │
          ▼               ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│ SQLite + Generated Files + Runtime Config                  │
│ documents / sections / questions / links / work / answers  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Sources + mywork + manual imports + codex-cli              │
│ local dirs / Git repos / OCR imports / work materials      │
└─────────────────────────────────────────────────────────────┘
```

These layers are responsible for:

- Web UI: reading, navigation, task management, and Codex interaction
- HTTP/WebSocket service: APIs, job orchestration, and live events
- Agent/runtime layer: indexing, answer generation, managed console, and PTY execution
- Persistence layer: SQLite, generated artifacts, and runtime configuration
- Source layer: public sources, `mywork`, manual imports, and local Codex execution

## 4. Execution components and managed agents

### 4.1 Index Agent

Implementation:

- `server/lib/indexer.ts`
- API entry: `POST /api/index/jobs`

Responsibilities:

- persist runtime source configuration
- synchronize Git-backed sources or load local ones
- invoke `scripts/build-db.mjs`
- build into a temporary database first
- swap the live database only after a successful build
- stream stage updates, logs, and progress to the UI

The indexing path uses a hot-swap strategy: work is written to `tempDbPath`, and the live database is replaced only after the build succeeds.

Primary stage names include:

- `writing_config`
- `syncing_sources`
- `building_index`
- `swapping_database`
- `ready`

### 4.2 Answer Agent

Implementation:

- `server/lib/codex.ts`
- class: `AnswerJobManager`
- API entry: `POST /api/generated`

Responsibilities:

- load question detail and linked context
- gather guide anchors
- gather `direct` and `adjacent` `mywork` evidence
- merge explicit document references selected by the user
- build the final prompt with skills
- call `codex exec`
- constrain output with JSON Schema
- persist results to SQLite and `data/generated/`

This component is optimized for stable, structured answer generation rather than free-form chat. Its output is validated by `schemas/answer-package.schema.json`, including:

- `elevator_pitch`
- `full_answer_markdown`
- `work_story`
- `work_evidence_status`
- `work_evidence_note`
- `knowledge_map`
- `citations`
- `follow_ups`
- `missing_basics`

The frontend uses these fields to render short openings, full answers, work-based talking points, knowledge maps, citations, and likely follow-up questions.

### 4.3 Managed Codex Console Agent

Implementation:

- `server/lib/codex.ts`
- class: `ManagedCodexConsoleManager`
- API entry: `POST /api/codex-console/jobs`

Responsibilities:

- accept natural-language messages from the floating console
- attach recent conversation history
- auto-attach the current document
- attach explicitly selected files and project summaries
- call `codex exec`
- return structured replies under `schemas/codex-console.schema.json`

This component is intended for in-site collaboration. Typical tasks include:

- explaining the current document
- answering with chapter context
- reviewing selected files
- editing selected files
- returning chat-style results with citations, warnings, and changed-file summaries

Its output contains:

- `mode`
- `headline`
- `summary`
- `reply_markdown`
- `warnings`
- `changed_files`
- `citations`
- `follow_ups`

### 4.4 Interactive PTY Codex Runtime

Implementation:

- `attachCodexPty()` in `server/lib/codex.ts`
- `scripts/codex_pty_bridge.py`
- WebSocket endpoint: `/ws/codex`

This component provides true terminal semantics rather than schema-constrained batch execution. The flow is:

1. the browser sends `start`, `input`, and `resize`
2. the server launches a Python PTY bridge
3. the bridge starts the real local `codex` process
4. stdout and stderr are streamed back to the browser
5. the frontend renders a draggable, collapsible, resizable terminal pane

This path preserves native `codex-cli` interaction while allowing OfferLoom to add model selection, file injection, document references, and live refresh.

### 4.5 Supporting workers

The current implementation also includes two important helper workers:

1. interview import worker
   `InterviewImportModal` supports pasted text and screenshot OCR; the screenshot path uses `tesseract.js` in the browser and persists the result through `POST /api/questions/import`
2. file watch worker
   `server/index.ts` establishes `/ws/watch`, so the frontend can refresh document state immediately after Codex modifies a file

## 5. Skill-layer design

The repository currently contains six skill files under `skills/`:

- `answer-composer.md`
- `mywork-triage.md`
- `project-interviewer.md`
- `codex-console.md`
- `question-linker.md`
- `work-summarizer.md`

### 5.1 Skills loaded directly in runtime

The following skills are already on the main execution path:

- `answer-composer.md`
  defines answer-package structure, quality bar, and output style
- `mywork-triage.md`
  constrains `mywork` relevance judgment and reinforces early stopping when evidence is weak
- `project-interviewer.md`
  reads project material from an interviewer’s perspective and surfaces defensible contributions and likely follow-ups
- `codex-console.md`
  standardizes console response style, citation handling, and changed-file summaries

These skills are loaded by:

- `server/lib/codex.ts`
- `scripts/batch-generate.mjs`

### 5.2 Skills present but not yet wired as standalone stages

The following skills exist but are not yet inserted as separate LLM stages:

- `question-linker.md`
  intended for fine-grained question-to-guide linking; the current linker still lives primarily in the heuristic/hybrid logic inside `scripts/build-db.mjs`
- `work-summarizer.md`
  intended for project summarization; the current project summary path is still largely rule-based in `server/lib/projectPrep.ts`

### 5.3 Architectural role of skills

In the current design, skills function primarily as task-specific instruction templates rather than as a dynamic plugin runtime. Their role is to:

- stabilize output shape across jobs
- reduce prompt drift
- keep Answer Agent, Console Agent, and batch scripts aligned on the same task constraints

## 6. Collaboration modes with `codex-cli`

OfferLoom integrates with `codex-cli` through three complementary paths.

### 6.1 Schema-constrained batch mode

Used for:

- question translation
- personalized answer generation
- structured replies in the managed console

Typical invocation shape:

```text
codex exec
  --skip-git-repo-check
  --cd <ROOT_DIR>
  --output-schema <schema.json>
  --output-last-message <outputFile>
  -m <model>
  -c model_reasoning_effort="<effort>"
  -
```

Properties:

- prompts are sent through stdin
- outputs are schema-constrained
- the backend consumes the final structured message only
- results are easy to persist and render reliably

### 6.2 Managed console mode

This mode is built on `codex exec`, but OfferLoom controls the surrounding context. In addition to the user’s current message, the system injects:

- recent conversation history
- the current document
- explicitly selected files
- explicitly selected project summaries
- the response contract defined by `codex-console.md`

The division of responsibilities is therefore:

- `codex-cli` performs reasoning and file operations
- OfferLoom assembles context, governs the task, and structures the result

### 6.3 PTY interactive mode

This mode starts the real CLI directly. The command shape is close to:

```text
codex
  --cd <ROOT_DIR>
  --no-alt-screen
  -a never
  -s danger-full-access
  -m <model>
  -c model_reasoning_effort="<effort>"
```

This path preserves:

- streaming terminal output
- native keyboard interaction
- dynamic resize behavior
- longer exploratory editing workflows

### 6.4 Why all three paths are kept

The three modes support different operational needs:

- schema-constrained batch: stable, structured, and persistable
- managed console: document collaboration with controlled context
- PTY runtime: full terminal semantics for exploratory sessions

This separation allows the product to provide both batch-quality generation and real-time interactive CLI access inside one UI.

## 7. Data flow

### 7.1 First-run flow

The first-run path is:

```text
config/sources.json
   ↓
auto-discover sources/documents/* and sources/question-banks/*
   ↓
bootstrap.mjs synchronizes Git-backed sources
   ↓
build-db.mjs reads guide / question bank / mywork
   ↓
build SQLite, FTS, and link relations
   ↓
frontend consumes /api/meta /api/documents /api/questions
```

### 7.2 Index construction

`scripts/build-db.mjs` can be summarized in six steps:

1. load source configuration and translation cache
2. parse guides, question banks, and `mywork`
3. normalize documents, split sections, extract questions, scan projects, and chunk work documents
4. optionally build embeddings
5. compute question-to-guide and question-to-work relations
6. write SQLite tables, FTS tables, and `app_meta`

The build emits stage events such as:

- `sources`
- `mywork_scan`
- `embedding_prepare`
- `embedding_run`
- `linking`
- `finalize`
- `done`

The Index Agent maps these events to frontend progress and logs.

### 7.3 Question translation

Question translation is handled by `scripts/batch-translate-questions.mjs`:

```text
questions
   ↓
batched requests to codex exec
   ↓
question-translation schema output
   ↓
write translatedText into questions.metadata_json
   ↓
update questions_fts
   ↓
persist translation cache
```

### 7.4 Personalized answer generation

When a user requests a personalized answer, the path is:

```text
Question ID
   ↓
db.getQuestion()
   ↓
guideMatches / guideFallbackMatches / workMatches / workHintMatches
   ↓
attach current document and explicit references
   ↓
load answer-composer + mywork-triage + project-interviewer
   ↓
codex exec + answer schema
   ↓
persist to generated_answers
   ↓
persist JSON under data/generated/<questionId>.json
   ↓
frontend polls job state and renders the package
```

### 7.5 Managed console flow

The managed console path is:

```text
user message
   ↓
recent conversation
   ↓
current document / selected files / selected project summaries
   ↓
load codex-console skill
   ↓
codex exec + console schema
   ↓
return structured reply
   ↓
frontend renders markdown / changed_files / citations / warnings
```

### 7.6 Interview import and live refresh

Screenshot import flow:

```text
user pastes screenshot
   ↓
frontend OCR via tesseract.js
   ↓
POST /api/questions/import
   ↓
persist markdown under sources/question-banks/manual-mianjing/imports/<month>/<file>.md
   ↓
included on the next index rebuild
```

Live refresh flow:

```text
Codex edits a file
   ↓
/ws/watch detects file-system change
   ↓
browser receives changed event
   ↓
current document state refreshes
```

## 8. Indexing, retrieval, and linking

### 8.1 Guide layer

Guides are decomposed into:

- `documents`
- `sections`
- `sections_fts`

Each `section` acts as a knowledge anchor for highlighting and question attachment.

### 8.2 Question-bank layer

Question-bank processing includes:

- question extraction
- canonical normalization
- fingerprint-based deduplication
- type and difficulty inference
- optional translation
- insertion into `questions` and `questions_fts`

### 8.3 `mywork` layer

`mywork` follows a conservative indexing path:

- detect candidate projects first
- decide whether a project is worth indexing
- store source documents in `documents`
- store project summaries in `work_projects`
- store chunk-level retrieval units in `work_chunks` and `work_chunks_fts`

The system also prepares interview-oriented project summaries, including:

- `openingPitch`
- `whyThisProjectMatters`
- `interviewArc`
- `highlightFacts`
- `deepDiveQuestions`

These are currently produced mainly by `server/lib/projectPrep.ts`.

### 8.4 Persisted link relations

The main persisted relations are:

- `question_to_section`
- `question_to_document_fallback`
- `question_to_work_chunk`
- `question_to_work`
- `question_to_work_hint`

Their roles are:

- `question_to_section`: precise knowledge-point attachment
- `question_to_document_fallback`: chapter-level extension questions
- `question_to_work` and `question_to_work_hint`: direct versus adjacent project evidence

### 8.5 Precision control

The current release uses a two-tier policy of precise attachment plus chapter fallback:

- only high-confidence matches attach to a concrete `section`
- questions that are clearly relevant to the chapter but not precise enough for a paragraph attach to `question_to_document_fallback`

On the work side, evidence is graded as:

- `direct`
- `adjacent`
- `none`

This policy is intended to reduce two specific failure modes:

- weakly related questions being presented as exact knowledge hits
- irrelevant project material being forced into foundational answers

### 8.6 Retrieval modes

The build records:

- `retrieval_mode`
- `embedding_model`
- `embedding_error`
- `work_index_summary`

As a result, the system can operate in hybrid mode when embeddings are available and fall back to lexical/heuristic mode when they are not.

## 9. Data model and schemas

### 9.1 Source configuration

Core configuration types include:

- `OfferLoomSource`
- `OfferLoomWorkSource`
- `OfferLoomSourcesConfig`

A simplified example is:

```json
{
  "guides": [
    {
      "id": "llm-agent-interview-guide",
      "type": "local",
      "path": "./sources/documents/llm-agent-interview-guide",
      "kind": "guide"
    }
  ],
  "questionBanks": [
    {
      "id": "qa-hub",
      "type": "local",
      "path": "./sources/question-banks/qa-hub",
      "kind": "question_bank"
    }
  ],
  "myWork": {
    "id": "candidate-workspace",
    "type": "local",
    "path": "./mywork",
    "kind": "work_root",
    "supplementalRoots": [],
    "manifestPath": "./config/work-manifest.json"
  }
}
```

### 9.2 Persistent storage

Primary tables:

- `app_meta`
- `sources`
- `documents`
- `sections`
- `questions`
- `links`
- `work_projects`
- `generated_answers`
- `work_chunks`

FTS tables:

- `sections_fts`
- `questions_fts`
- `work_chunks_fts`

Semantic layering:

- `documents`: raw source documents
- `sections`: guide knowledge anchors
- `questions`: interview questions
- `links`: question-to-guide and question-to-work relations
- `work_projects`: project summary layer
- `work_chunks`: chunk-level work retrieval layer
- `generated_answers`: persisted LLM outputs

### 9.3 Core frontend types

The frontend primarily revolves around:

- `QuestionDetail`
- `DocumentData`
- `WorkProjectDetail`
- `GeneratedAnswer`
- `AgentJob`

In practice:

- `QuestionDetail` contains question text, translation, guide matches, work evidence, and generated answers
- `DocumentData` contains document metadata, sectioned content, hit counts, and chapter extensions
- `WorkProjectDetail` contains project summaries, representative documents, and interview-oriented questions
- `AgentJob` unifies answer jobs, console jobs, and indexing jobs inside the task center

These types are defined in `web/src/types.ts`.

### 9.4 Answer-package schema

Personalized answers are constrained by `schemas/answer-package.schema.json`. A simplified shape is:

```json
{
  "question": "...",
  "elevator_pitch": "...",
  "full_answer_markdown": "...",
  "work_story": "...",
  "work_evidence_status": "direct | adjacent | none",
  "work_evidence_note": "...",
  "knowledge_map": [
    {
      "concept": "...",
      "why_it_matters": "...",
      "confidence": "high | medium | low"
    }
  ],
  "citations": [
    {
      "label": "...",
      "path": "...",
      "kind": "guide | question_bank | work | dynamic"
    }
  ],
  "follow_ups": ["..."],
  "missing_basics": ["..."]
}
```

### 9.5 Console-reply schema

Managed-console output is constrained by `schemas/codex-console.schema.json`. A simplified shape is:

```json
{
  "mode": "answer | edit | review | plan | mixed",
  "headline": "...",
  "summary": "...",
  "reply_markdown": "...",
  "warnings": ["..."],
  "changed_files": [
    {
      "path": "...",
      "summary": "..."
    }
  ],
  "citations": [
    {
      "label": "...",
      "path": "...",
      "kind": "current_document | selected_file | selected_project | guide | work | dynamic"
    }
  ],
  "follow_ups": ["..."]
}
```

Unlike the answer package, this structure is optimized for conversational collaboration and therefore includes `changed_files` rather than forcing fields such as `knowledge_map` or `work_story`.

## 10. Frontend data consumption

The frontend is not just a markdown renderer. It projects structured data into three primary views.

### 10.1 Guide view

Centered on `DocumentData.sections`, it:

- renders section content
- highlights sections with `knowledgeHitCount > 0`
- displays `relatedQuestions` beneath each section
- displays `looseRelatedQuestions` at chapter end

### 10.2 Interview view

Centered on `QuestionDetail`, it:

- shows exact and chapter-level guide matches
- shows work-evidence status
- renders generated answer packages
- exposes jump-back links and regeneration actions

### 10.3 My Work view

Centered on `WorkProjectDetail`, it:

- renders project opening pitches
- explains why the project matters
- surfaces interview arcs and deep-dive questions
- lists related questions and representative files

### 10.4 Settings, jobs, and Codex pane

In addition to the three content views, the frontend also handles:

- source configuration and first-run onboarding
- unified task monitoring for indexing, answer generation, and console jobs
- the floating managed Codex console and PTY terminal

## 11. Release and privacy boundary

OfferLoom is intended to be published as a public base plus a private work layer:

- public sample sources can stay in the repository
- `mywork/` should remain outside version control
- `config/*.runtime.json` should remain outside version control
- databases, generated answers, caches, and model artifacts should not be committed

This boundary is important for three reasons:

- the repository remains runnable with sample content
- each user can attach private work material locally
- local paths, project aliases, and private documents stay out of public release history

## 12. Current implementation status

The current codebase already implements:

- unified discovery and configuration for local and Git-backed sources
- one-time indexing for guides, question banks, and `mywork`
- layered indexing over sections, questions, and work chunks
- exact-hit plus chapter-fallback attachment
- `direct` / `adjacent` / `none` work-evidence grading
- question translation, personalized answer generation, and persistence
- the managed Codex console
- the interactive PTY Codex terminal
- live file refresh after edits
- text and screenshot interview import
- a unified task center

## 13. Current limitations and next steps

The current release still has several clear boundaries:

1. `question-linker.md` is not yet wired as a standalone LLM linker/reranker stage; linking still relies mainly on the heuristic and optional-embedding logic in `build-db.mjs`.
2. `work-summarizer.md` is not yet on the main path; project summarization is still mostly rule-based in `projectPrep.ts`.
3. Question deduplication already uses normalization and fingerprints, but it is not yet a full semantic clustering pipeline.
4. `generated_answers` is persisted, but prompt lineage and answer-version management are still limited.

The most natural next steps are:

- wiring `question-linker.md` into a dedicated linking/reranking stage
- wiring `work-summarizer.md` into project-summary generation
- adding stronger semantic deduplication and clustering
- introducing answer versioning, prompt lineage, and regression comparison
- tightening the interaction between console edits, document jumps, and explicit reference selection
