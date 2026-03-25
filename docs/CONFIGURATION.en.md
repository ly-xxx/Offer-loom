# Configuration

[中文版本](../docs/CONFIGURATION.md)

OfferLoom source configuration has two layers:

- public default config stored in the repository
- private runtime config used on your own machine

## Default config

By default, OfferLoom reads:

- `config/sources.json`
- `config/work-manifest.json`

The default public setup now points at repository-local sources:

- `./sources/documents/llm-agent-interview-guide`
- `./sources/question-banks/llm-interview-questions`
- `./sources/question-banks/qa-hub`
- `./mywork`

Upstream references for the bundled public sources:

- `llm-agent-interview-guide`: <https://github.com/Lau-Jonathan/LLM-Agent-Interview-Guide>
- `llm-interview-questions`: <https://github.com/llmgenai/LLMInterviewQuestions>
- `qa-hub`: <https://github.com/KalyanKS-NLP/LLM-Interview-Questions-and-Answers-Hub>

## Automatic `sources/` discovery

The app automatically scans:

```text
sources/documents/*
sources/question-banks/*
```

If you drop a new source directory there, the Settings panel will show it after discovery. Save the settings and rebuild the index to activate it.

If you no longer want a directory to be auto-detected, move it out of `sources/`.

## Manual source configuration

Besides auto-discovery, both the Settings UI and config files support two source types:

- `type: "local"`
- `type: "git"`

Example:

```json
{
  "id": "custom-guide-repo",
  "type": "git",
  "url": "https://github.com/replace-with-your/guide-repo.git",
  "branch": "main",
  "kind": "guide"
}
```

## Private local overrides

Do not edit the tracked default config directly. Prefer local overrides:

```bash
OFFERLOOM_SOURCES_CONFIG=./config/sources.local.example.json \
OFFERLOOM_WORK_MANIFEST=./config/work-manifest.local.example.json \
npm run setup:serve
```

Runtime-saved config is written to:

- `config/sources.runtime.json`
- `config/work-manifest.runtime.json`

These files should stay out of Git.

## `myWork` fields

`myWork` supports:

- `path`: root of the workset
- `supplementalRoots`: extra retrieval roots
- `manifestPath`: path to the manifest file

## Deduplication and incremental updates

Interview imports go through canonical dedup during indexing:

- question lines, titles, tables, and `Q:` blocks are extracted
- they are normalized into a shared fingerprint
- duplicate questions keep a single primary record

After adding a new question bank, rebuild the index and OfferLoom will import the new questions and deduplicate them automatically.
