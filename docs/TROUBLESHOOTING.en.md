# Troubleshooting

[中文版本](../docs/TROUBLESHOOTING.md)

## The site returns 502 / Bad Gateway

In most cases this is a proxy issue, not an OfferLoom crash.

Check the service directly:

```bash
curl --noproxy '*' http://127.0.0.1:6324/api/health
```

If you get `{"ok":true}`, the server is healthy and your proxy path is the problem.

Fixes:

- add `127.0.0.1` and `localhost` to `NO_PROXY`
- add your LAN IP to the browser or system proxy bypass list
- access the exact URLs printed by OfferLoom on startup

## The UI loads but documents do not refresh

- confirm the file was opened from the document panel
- confirm the server still has access to the underlying local file
- confirm the file watcher is not blocked by network filesystem permissions

## Generated answers show local absolute paths

- run `npm run clean:data`
- rebuild the database from the public-safe default config
- regenerate answers after the rebuild

## The embedded terminal does not connect

- confirm `codex` is installed and available in `PATH`
- confirm websocket traffic is not intercepted by a proxy
- reload the page and click `Restart session`

## New sources do not appear

- confirm the new directory was placed under `sources/documents/` or `sources/question-banks/`
- open Settings and check whether the auto-discovery counter has increased
- save and rebuild the index after adding new sources
- if you do not want a directory auto-detected, move it out of `sources/`
