# Technical Report

[中文版本](../docs/TECHNICAL_REPORT.md)

## 1. Product goal

OfferLoom is not a generic interview-question website. It is an interview-prep system built around three connected ideas: a main learning path, interview-question backflow, and project evidence constrained by your own work materials.

It is designed to solve three common failure modes:

1. Question banks drift away from the knowledge path.
   People solve many questions but cannot tell which knowledge point each question belongs to.
2. Interview experience drifts away from project experience.
   People over-attach projects to foundational questions and under-support project-deep-dive answers with real evidence.
3. Retrieval systems sound overconfident.
   Many RAG systems mistake “roughly related” for “precisely grounded” and end up steering users in the wrong direction.

The design goals are:

- read the guide as the mainline
- fold interview questions into footnotes and backlinks
- treat `mywork` as evidence-constrained material for personalized answers
- make the UI explicitly distinguish between exact hits, chapter fallbacks, and no appearance

## 2. Inputs and outputs

### Inputs

- Guide / mainline documentation
  A knowledge repository organized in study order.
- Question banks / interview material
  Interview questions, interview logs, Q&A repositories, and OCR-imported screenshots.
- `mywork`
  Project READMEs, code, papers, notes, notebooks, experiment logs, and related artifacts.

### Outputs

- Online documentation site
  The guide stays at the center, while interview questions appear as section footnotes and chapter-end extensions.
- Interview tab
  The question becomes the center, with mainline presence, frequency, backlinks, and personalized answers.
- Personalized answers
  Each answer explicitly labels `direct / adjacent / none`.

## 3. Why use “exact hit + chapter fallback”

Mainstream hybrid retrieval / RAG systems usually do more than a single search pass. They tend to combine:

- lexical + semantic recall
- reranking / precision filtering
- a separate place for theme-level but not chunk-level relevance

OfferLoom adapts that idea into two layers:

1. `question_to_section`
   Only questions with high enough confidence to attach to a concrete knowledge point are allowed into section highlights and chapter footnotes.
2. `question_to_document_fallback`
   If a question clearly belongs to the chapter theme but does not accurately map to a specific section, it is placed into the chapter extension bucket instead.

Why this helps:

- users can immediately see which questions truly hit a knowledge point
- weakly related questions are not forced into the wrong paragraph
- study order and question coverage can coexist

## 4. Matching algorithm

### 4.1 Guide matching

For each interview question, OfferLoom jointly evaluates:

- lexical score
- semantic score
- heading match score
- soft overlap score
- topic alignment score
- intent alignment score

Then it applies two filtering stages:

1. can this question enter a concrete section?
2. if not, can it still enter the document-level fallback bucket?

This is more stable than “top-k by embedding similarity” because:

- heading / topic / intent cues reduce vector-only false positives
- the fallback bucket safely absorbs theme-level matches whose paragraph grounding is still too weak

### 4.2 `mywork` matching

The goal of `mywork` is not “attach as many projects as possible.” The goal is “only attach projects when they are truly helpful.”

So OfferLoom distinguishes three outcomes:

1. `question_to_work`
   material that can function as direct evidence
2. `question_to_work_hint`
   only neighboring engineering experience exists, so the answer may bridge carefully
3. no hit
   the answer should not cite projects at all

### 4.3 Direct evidence vs. adjacent evidence

OfferLoom no longer relies on keyword overlap alone. It also introduces:

- family-level precision rules
  for example `prompt/context`, `RAG`, `agent`, `inference-serving`, and `robotics-control`
- compatibility bonuses
  related families may form an adjacent bridge, but they do not automatically upgrade to direct evidence
- precision guards
  if a candidate document does not actually contain the key concept of a precision-sensitive question, it is rejected

Examples:

- a robotics README that merely shows a `prompt` example should not automatically become direct evidence for prompt-engineering questions
- a generic LLM multi-agent project may not directly cover prompt tuning, but it can still count as adjacent evidence for prompt / agent questions

## 5. Why OfferLoom does not force every answer to use projects

Many systems generating personalized answers fall into the same bad habit:

- first assume the answer must mention a project
- then force some project fragment into it

OfferLoom explicitly avoids that.

The current strategy is:

- if the evidence is `direct`
  the answer may use the project, but the citation still has to stay traceable
- if the evidence is `adjacent`
  the answer must say it is neighboring experience rather than pretending the exact question was solved directly
- if the evidence is `none`
  the system should say there is no project evidence and answer from the guide
- if the question is simple
  even with project evidence, the answer may stay project-free so the explanation does not become distorted

## 6. Question deduplication

Interview sources often contain many paraphrases of the same question.

OfferLoom does not deduplicate by exact raw string match only. It combines:

- canonical text normalization
- question fingerprinting
- normalization of common English word-form changes
- another UI-level dedup pass inside the same section

This reduces:

- the same paraphrased question showing up repeatedly under one chapter
- noisy repetition inside interview category lists

## 7. UI structure

### 7.1 Mainline tab

- the left side is a level-1 / level-2 tree
- the main content is a continuous document flow under the same level-1 group
- section footnotes hold the related interview questions
- the end of the document holds the chapter extension bucket

### 7.2 Interview tab

The interview tab is not meant to be a giant list of questions. It is designed to answer four things clearly:

1. does this question appear in the mainline?
2. how many times?
3. is it an exact hit or only a chapter fallback?
4. where can the user jump back to?

That is why the view keeps:

- mainline appearance status
- frequency
- backlink entry points
- `mywork` evidence quality

### 7.3 2.5D status lights

The UI lights are not decorative. They compress state information:

- green: exact mainline hit
- gold: only chapter-level fallback
- gray: not present in the mainline

This lets users judge at a glance:

- which questions should be learned alongside the mainline
- which questions are chapter-end supplements
- which questions currently rely only on the question bank and on-demand generation

## 8. Deployment and release

### 8.1 One-command deploy

The default release flow is:

```bash
npm install
npm run setup:serve
```

It automatically handles:

- dependency installation
- Git-source sync
- database build
- frontend / backend build
- startup on port `6324`

### 8.2 Visual first-run configuration

After the first startup, users can configure the system directly in the UI:

- keep the default public sources or replace them with custom ones
- point OfferLoom at a `mywork` directory
- launch indexing and monitor progress live

This allows GitHub users to complete most initial setup without hand-editing configuration files.

### 8.3 Release boundaries

When publishing to GitHub:

- keep the public sample sources in the repository
- do not commit `mywork/`
- do not commit runtime config
- do not commit databases or generated answers

## 9. Relation to mainstream retrieval systems

OfferLoom’s current strategy is not a reinvention from scratch. It is a task-specific adaptation of mainstream hybrid search / reranking practice for interview preparation.

Relevant references include:

- Weaviate hybrid search
  <https://docs.weaviate.io/weaviate/concepts/search/hybrid-search>
- Qdrant reranking for hybrid search
  <https://qdrant.tech/documentation/search-precision/reranking-hybrid-search/>

On top of those general patterns, OfferLoom adds a documentation-station layer:

- exact paragraph hits
- chapter fallback buckets
- honest `mywork` evidence grading
- visible interview backlinks and mainline presence status

The most recent iteration tightened two additional details:

- `LLM serving / inference` is separated from the generic `llm_model` family and handled with its own family-level precision gate
- question fingerprints now use normalized token sets rather than raw ordered strings, which reduces duplicated paraphrase questions

## 10. Current limitations

- exact hits between guide sections and questions are still driven by strong heuristics rather than a heavier reranker / cross-encoder
- `mywork` relevance is now more conservative, but edge cases can still produce adjacent hints that are not perfectly ranked
- question dedup currently uses fingerprints + rules rather than semantic clustering

These are all upgradeable. For the current release, the priority is:

- do not attach fake project evidence
- do not attach questions to the wrong knowledge point
- make uncertainty explicit in the UI

## 11. Further references

Besides the Weaviate and Qdrant docs above, OfferLoom is also consistent with mainstream hybrid + RRF ideas such as:

- Elasticsearch hybrid search / RRF
  <https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html>

OfferLoom does not directly clone any generic retrieval framework. Instead, it compresses those mature ideas into an implementation better suited to “mainline study + interview backlinks + project-evidence constraints.”
