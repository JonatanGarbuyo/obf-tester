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
npx obf validate --source ./feeds.txt --domain http://localhost

# full check: discover + validate + recursive in one command
npx obf check canal26.com
npx obf check canal26.com --local
npx obf check canal26.com --local                              # serial, 300ms delay
npx obf check canal26.com --local --delay 1000                 # 1s between requests
npx obf check canal26.com --local --max-concurrency 3 --delay 0 # paralelo sin delay

# discover sitemap URLs from robots.txt
npx obf discover canal26.com

# pipe discover into validate
npx obf discover canal26.com | npx obf validate --source - --domain http://localhost
```

Exit code is `0` if all validations pass, `1` otherwise.

## Commands

### `validate`

Run validations against one or more feed URLs.

| Flag | Description |
|------|-------------|
| `<url>` | Feed URL to validate |
| `--type <type>` | Feed type: `xml`, `rss`, `atom`, `sitemap` |
| `--source <file>` | File with routes (one per line), `-` for stdin |
| `--domain <url>` | Base domain for relative routes in source |
| `--recursive` | Follow `<sitemapindex>` children automatically |
| `--max-concurrency <N>` | Concurrent requests (default 1) |
| `--delay <ms>` | Delay between requests (default 300, overrides Crawl-Delay) |

### `check`

Discover + validate + recursive in one command. Shortcut that reads robots.txt, fetches all sitemaps, and validates each one.

| Flag | Description |
|------|-------------|
| `<url>` | Site URL (protocol optional, defaults to https) |
| `--domain <url>` | Override domain for all routes |
| `--local` | Shorthand for `--domain http://localhost` |
| `--max-concurrency <N>` | Concurrent requests (default 1) |
| `--delay <ms>` | Delay between requests (default 300) |

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
| `rss-items` | At least one `<item>` |
| `rss-item-date` | Item dates are parseable |

### Atom (auto-detected)

| Check | Description |
|-------|-------------|
| `atom-title` | `<title>` exists |
| `atom-link` | `<link>` has `href` attribute |
| `atom-entries` | At least one `<entry>` |
| `atom-entry-date` | Dates (`updated`/`published`) are parseable |

### Sitemap (auto-detected)

| Check | Description |
|-------|-------------|
| `sitemap-urls` | At least one `<url>` |
| `sitemap-loc-empty` | No empty `<loc>` |
| `sitemap-loc-url` | All `<loc>` are valid URLs |
| `sitemap-loc-duplicate` | No duplicate `<loc>` |

### Sitemap Index (auto-detected)

| Check | Description |
|-------|-------------|
| `sitemap-index-sitemaps` | At least one `<sitemap>` |
| `sitemap-index-loc-empty` | No empty `<loc>` |
| `sitemap-index-loc-url` | All `<loc>` are valid URLs |

## Architecture

```
src/
├── index.js        # CLI entry point (validate, check, discover)
├── fetcher.js      # HTTP transport (fetch + timeout + redirects)
├── validate.js     # Core validation orchestrator
├── discover.js     # robots.txt parser and sitemap discovery
└── validators/
    └── xml.js      # XML parse, RSS, Atom, sitemap validators
```

## Dependencies

- `fast-xml-parser` — XML parsing and validation

## License

MIT
