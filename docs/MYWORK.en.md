# MyWork Guide

[中文版本](../docs/MYWORK.md)

`mywork/` is the most important private input for OfferLoom’s personalized answer generation.

It is not an optional attachment. It is the main evidence entry point the system uses to decide what you actually built, how deeply you can talk about it, and which projects should be skipped early.

## What to put there

Try to keep each project complete:

- `README.md`
- paper PDFs / drafts / accepted versions
- code
- notebooks
- experiment logs
- benchmark results
- design docs
- debugging retrospectives
- deployment notes

If a project only contains raw code and no README or design explanation, OfferLoom can still scan it, but the resulting interview answers are usually much weaker.

## Recommended structure

```text
mywork/
├── README.md
├── project-a/
│   ├── README.md
│   ├── paper.pdf
│   ├── notes/
│   ├── notebooks/
│   └── src/
├── project-b/
│   ├── README.md
│   ├── docs/
│   └── code/
```

## Scanning strategy

OfferLoom handles `mywork` conservatively:

1. It first checks whether a directory really looks like a project.
2. If the structure is clearly mismatched, it stops early instead of drilling deeper.
3. For projects that pass the initial check, it recursively reads README files, docs, code, PDFs, notebooks, and other materials.
4. It then decides whether the project is genuinely relevant to the current interview direction.
5. Weakly related or unrelated projects are down-ranked to avoid fake project-based answers.
6. Only strongly related projects are distilled into project facts, follow-up angles, answer entry points, and citations.

## The highest-impact improvements

- keep `mywork/README.md` updated, because it is your cross-project overview
- place at least one strong README in every project root
- add a markdown summary next to important PDFs
- explicitly document ownership, technical decisions, failures, metric changes, and retrospectives
- if a project is unrelated to the target role, you do not need to delete it; OfferLoom will try to stop early and skip it

## Path convention

The recommended default is `./mywork/` under the repository root.

If your real workset lives elsewhere, you can either:

- update the `mywork` path directly in Settings
- use `config/sources.local.example.json` for a private local override

This directory is ignored by default and should not be published with the repository.
