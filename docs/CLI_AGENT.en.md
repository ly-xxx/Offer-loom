# Embedded CLI Agent

[中文版本](../docs/CLI_AGENT.md)

OfferLoom keeps the embedded Codex terminal as a first-class product feature.

## What it does

- opens a touch-friendly terminal inside the web app
- proxies directly to the local `codex` binary
- supports model switching and reasoning effort from `low` to `xhigh`
- shares the same workspace so generated edits can refresh the currently opened file

## Requirements

- `codex` must already be installed on the host machine
- the host running OfferLoom must allow local process execution
- users should understand that terminal commands run on the local machine

## Why this is documented separately

The embedded agent stays inside the product, but its runtime behavior should be documented independently from source metadata.

- content config decides what guides, question banks, and work files are indexed
- CLI agent runtime decides how local Codex sessions are launched
- public release docs should describe both, but they should not be mixed into one opaque config blob

## Demo guidance

- use the built-in public `sources/` content for public demos
- keep `mywork/` empty, or leave only the placeholder README in public screenshots
- avoid showing private local override files in the terminal
- if the browser uses a proxy, fix that first so a websocket issue is not mistaken for a product bug
