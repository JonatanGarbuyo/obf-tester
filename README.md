# OBF Tester

**Outbound Feed Tester** — CLI tool to validate feeds, sitemaps, RSS/Atom, and XML/text endpoints across any CMS.

CMS-agnostic. Configurable via environment variables and route definitions.

## Requirements

- Node.js >= 22

## Install

```bash
npm install
```

## Usage

```bash
# validate a single URL
npx obf validate <url>

# validate with expected type
npx obf validate <url> --type rss

# batch validate from file
npx obf validate --source ./feeds/resolver-path.example.txt --domain http://localhost

# validate a sitemap-index and follow its children
npx obf validate "http://localhost/.../sitemap-index/?outputType=xml" --recursive --max-pagination 5

# full check: discover + validate + recursive in one command
npx obf check canal26.com
npx obf check canal26.com --local                                         # serial, 300ms, full children
npx obf check canal26.com --local --max-pagination 3                      # solo 3 hijos por sitemapindex
npx obf check canal26.com --local --max-pagination 3 --delay 1000         # 1s entre requests, 3 hijos
npx obf check canal26.com --local --max-concurrency 3 --delay 0           # paralelo sin delay

# discover sitemap URLs from robots.txt
npx obf discover canal26.com

# write failure report to file
npx obf validate --source ./feeds/resolver-path.example.txt --domain http://localhost --output ./results.txt

# pipe discover into validate
npx obf discover canal26.com | npx obf validate --source - --domain http://localhost

# pipe discover into validate with Arc XP deploy number
npx obf discover canal26.com | npx obf validate --source - --domain http://localhost --deploy 57
```

Exit code is `0` if all validations pass, `1` otherwise.

When using `--source`, a `Failed:` section is shown after the summary.
Failed URLs are also written (as relative paths) to `feeds/.obf-failed.txt`
for quick retry:
```bash
npx obf validate --source feeds/.obf-failed.txt --domain http://localhost
```

## Commands

### `validate`

Run validations against one or more feed URLs.

| Flag | Description |
|------|-------------|
| `<url>` | Feed URL to validate |
| `--type <type>` | Feed type: `xml`, `rss`, `atom`, `sitemap` |
| `--source <file>` | File with routes (one per line), `-` for stdin |
| `--domain <url>` | Base domain for relative routes in source |
| `--recursive` | Follow `<sitemapindex>` children (works with `<url>` or `--source`) |
| `--local` | Shorthand for `--domain http://localhost` |
| `--content-type <type>` | Expected Content-Type (e.g. `application/xml`) |
| `--max-concurrency <N>` | Concurrent requests (default 1) |
| `--delay <ms>` | Delay between requests (default 300). Crawl-Delay from robots.txt overrides if this flag is not set |
| `--max-pagination <N>` | Max children per sitemap-index (0 = all). Skips dates, paginations |
| `--output <file>` | Write failure report to file |
| `--deploy <N>` | Append `?d=N` for Arc XP deploy testing |

### `check`

Discover + validate + recursive in one command. Shortcut that reads robots.txt, fetches all sitemaps, and validates each one.

| Flag | Description |
|------|-------------|
| `<url>` | Site URL (protocol optional, defaults to https) |
| `--domain <url>` | Override domain for all routes |
| `--local` | Shorthand for `--domain http://localhost` |
| `--max-concurrency <N>` | Concurrent requests (default 1) |
| `--delay <ms>` | Delay between requests (default 300) |
| `--max-pagination <N>` | Max children per sitemap-index (0 = all) |
| `--deploy <N>` | Append `?d=N` for Arc XP deploy testing |

### `discover`

Fetch robots.txt from a URL and print `Sitemap:` entries to stdout (one per line). Useful with pipes or file redirection.

## Checks

### HTTP (always active)

| Check | Description |
|-------|-------------|
| `status` | HTTP status must be 2xx |
| `body-not-empty` | Response body has content |
| `content-type` | Matches `--content-type` or `--type` if specified |
| `forbidden-pattern` | No stack traces, fatal errors, or `[object Object]` |

### XML (auto-detected when type is set or content-type is XML)

| Check | Description |
|-------|-------------|
| `xml-well-formed` | XML is parseable |
| `xml-root` | Root tag detected (rejects `<html>`) |

### RSS (auto-detected)

| Check | Description |
|-------|-------------|
| `rss-channel` | `<channel>` exists |
| `rss-title` | `<title>` not empty |
| `rss-link` | `<link>` not empty |
| `rss-items` | Counts `<item>` elements (0 passes) |
| `rss-item-date` | Item dates are parseable |

### Atom (auto-detected)

| Check | Description |
|-------|-------------|
| `atom-title` | `<title>` exists |
| `atom-link` | `<link>` has `href` attribute |
| `atom-entries` | Counts `<entry>` elements (0 passes) |
| `atom-entry-date` | Dates (`updated`/`published`) are parseable |

### Sitemap (auto-detected)

| Check | Description |
|-------|-------------|
| `sitemap-urls` | Counts `<url>` elements (0 passes) |
| `sitemap-loc-empty` | No empty `<loc>` |
| `sitemap-loc-url` | All `<loc>` are valid URLs |
| `sitemap-loc-duplicate` | No duplicate `<loc>` |

### Sitemap Index (auto-detected)

| Check | Description |
|-------|-------------|
| `sitemap-index-sitemaps` | Counts `<sitemap>` elements (0 passes) |
| `sitemap-index-loc-empty` | No empty `<loc>` |
| `sitemap-index-loc-url` | All `<loc>` are valid URLs |

## Architecture

```
src/
├── index.js             # CLI entry point (isMain guard)
├── cli.js               # Yargs command definitions
├── http.js              # HTTP transport (fetch + timeout + retry + helpers)
├── validate.js          # Core validation orchestrator
├── source.js            # File/stdin source reader
├── logger.js            # User-facing output ([PASS]/[FAIL] tags)
├── commands/
│   ├── validate.js      # runValidate, runBatch, validateAndRecurse
│   ├── check.js         # runCheck (discover + validate)
│   └── discover.js      # runDiscover
├── parsers/
│   ├── robots.js        # robots.txt parser (discover)
│   └── sitemap.js       # Sitemapindex child URL extraction
└── validators/
    └── xml.js           # XML: well-formed, RSS, Atom, sitemap, sitemap-index
```

### Feeds

Route definition files live under `feeds/`:

| File | Tracked | Purpose |
|------|---------|---------|
| `feeds/resolver-path.example.txt` | Yes | Template — 73 Arc XP routes covering all resolvers |
| `feeds/sitemap.example.txt` | Yes | Quick sitemap-only test for discover/check |
| `feeds/.obf-failed.txt` | No (gitignored) | Auto-generated by `--source` — failed URLs for retry |

## Dependencies

- `yargs` — CLI argument parsing
- `fast-xml-parser` — XML parsing
- `fast-xml-validator` — XML well-formed validation

## License

MIT
