# Embedded CLI Agent

OfferLoom keeps the embedded Codex terminal as a first-class feature.

## What it does

- Opens a touch-friendly terminal inside the web app
- Proxies directly to the local `codex` binary
- Supports model switching and reasoning effort from `low` to `xhigh`
- Shares the same workspace so generated edits can refresh the currently opened file

## Requirements

- `codex` must already be installed on the host machine
- the host running OfferLoom must allow local process execution
- the user should understand that terminal commands run on the local machine

## Why it is documented separately

The embedded agent stays in the product, but its runtime behavior should be documented independently from content metadata.

- Content config decides what guides, question banks, and work files are indexed
- CLI agent runtime decides how local Codex sessions are launched
- Public release materials should talk about both, but they should not be mixed together in one opaque config blob

## Demo guidance

- Use the built-in public `sources/` content for public demos
- Keep `mywork/` empty or only leave the placeholder README in public screenshots
- Avoid showing private local override files in the terminal
- If the browser uses a proxy, fix that first so the terminal websocket is not mistaken for a product bug
