# Privacy and Data Handling

[中文版本](../docs/PRIVACY.md)

OfferLoom is intentionally designed as a “public base + private workset” system, so the boundaries should stay explicit.

## Public data

These are suitable for publication with the repository:

- `sources/documents/*`
- `sources/question-banks/*`
- documents and question banks derived from public GitHub sources
- configuration docs and scripts

## Private data

These should stay out of the repository by default:

- real projects inside `mywork/`
- local override / runtime configs
- answers generated from real private projects
- local model caches
- private absolute filesystem paths

## UI display and local paths

The UI tries to keep displayed references public-safe:

- the visible layer uses source labels, relative paths, and logical references
- absolute machine-local paths are mainly kept on the server side

Absolute paths are only used for:

- file watching and live refresh
- local document reads
- launching local Codex execution

## Release advice

- do not publish databases built from real `mywork`
- do not publish answers generated from real `mywork`
- rebuild the database using the public default sources before release
- trim `mywork/` down to a placeholder README before publishing
