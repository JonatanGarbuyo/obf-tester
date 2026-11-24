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

Run these commands from the repository root after `npm install`.

### Discover and check a published site

```bash
# Print the sitemap URLs from robots.txt without validating them
npx obf discover levelup.com

# Discover and validate the published sitemaps and their children
npx obf check levelup.com

# Save the discovered list to reuse it later
npx obf discover levelup.com > feeds/discovered.txt
npx obf validate --source feeds/discovered.txt --recursive --max-pagination 3
```

### Test a local version

Start your local server first. This example reads the public site's sitemap
list and tests it on `http://localhost:3000`. Use your server's actual port.
The URL passed to `discover` controls where the list comes from. The
`--domain` passed to `validate` controls where the sitemaps are requested.

```bash
# Discover on the public site; validate on localhost
npx obf discover levelup.com |
  npx obf validate --source=- --domain http://localhost:3000 \
    --recursive --max-pagination 3

# Read robots.txt from localhost too
npx obf discover http://localhost:3000 |
  npx obf validate --source=- --domain http://localhost:3000 \
    --recursive --max-pagination 3
```

Keep `--domain` even when discovering locally: `robots.txt` and sitemap indexes
can contain public URLs. With `--recursive`, `--max-pagination 3` tests the
first three children per index. Omit the limit to test all children.

If your local server listens on port 80, `check --local` is a shortcut. It
still reads the public `robots.txt`. Use the pipeline above for a custom port.

```bash
# Serial requests, 300 ms delay, all children
npx obf check levelup.com --local

# First three children per index
npx obf check levelup.com --local --max-pagination 3

# First three children per index, with a one-second delay
npx obf check levelup.com --local --max-pagination 3 --delay 1000

# Up to three concurrent child requests, with no configured delay
npx obf check levelup.com --local --max-concurrency 3 --delay 0
```

### Test a deployed Arc XP bundle

Read the same public sitemap list and send the requests to the Arc XP host
that serves the bundle. Replace the example host and deploy number with yours.

```bash
npx obf discover levelup.com |
  npx obf validate --source=- --domain https://preview.example.com \
    --deploy 57 --recursive --max-pagination 3
```

`--deploy 57` adds `d=57` to sitemap and child requests, not to the
`robots.txt` request. The tester validates the response; it does not verify
which bundle served it.

### Test a URL or a custom list

Pass a URL directly or use a file with one route per line. This is useful for
RSS or other feeds that sitemap discovery does not find.

```bash
# Validate a single URL with automatic type detection
npx obf validate http://localhost:3000/arc/outboundfeeds/rss/

# Require RSS
npx obf validate http://localhost:3000/arc/outboundfeeds/rss/ --type rss

# Check the Content-Type of a text endpoint
npx obf validate http://localhost:3000/arc/outboundfeeds/ads.txt --content-type text/plain

# Validate one sitemap index and up to five of its children locally
npx obf validate 'http://localhost:3000/arc/outboundfeeds/sitemap-index/?outputType=xml' \
  --domain http://localhost:3000 --recursive --max-pagination 5

# Validate a list of routes from a file
npx obf validate --source feeds/resolver-path.example.txt --domain http://localhost:3000
```

### Review failures and retry

Exit code is `0` if all validations pass, `1` otherwise.

If a `--source` run fails, it lists the failures after the summary and saves
their paths (without query strings) to `feeds/.obf-failed.txt`. Use `--output`
to also save a report with the first failed check for each URL.

```bash
npx obf validate --source feeds/resolver-path.example.txt \
  --domain http://localhost:3000 --output ./results.txt

npx obf validate --source feeds/.obf-failed.txt --domain http://localhost:3000
```

## Commands

### `discover`

Fetch `robots.txt` from a URL and print the sitemap URLs to stdout, one per line.

### `validate`

Run validations against one or more feed URLs.

| Flag                    | Description                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `<url>`                 | Feed URL to validate                                                                                                             |
| `--type <type>`         | Feed type: `xml`, `rss`, `atom`, `sitemap`                                                                                       |
| `--source <file>`       | File with one route per line. Use `--source=-` to read from stdin.                                                               |
| `--domain <url>`        | Base URL for source routes and sitemap-index children. Replaces the host of absolute URLs. Does not change a positional `<url>`. |
| `--recursive`           | Follow `<sitemapindex>` children (works with `<url>` or `--source`)                                                              |
| `--local`               | Use `http://localhost` as the base for children when validating a single URL with `--recursive`. Ignored with `--source`.        |
| `--content-type <type>` | Expected Content-Type (e.g. `application/xml`)                                                                                   |
| `--max-concurrency <N>` | Concurrent child sitemap requests (default 1)                                                                                   |
| `--delay <ms>`          | Delay between requests (default 300)                                                                                             |
| `--max-pagination <N>`  | Validate the first N children per sitemap index (0 = all)                                                                        |
| `--output <file>`       | Write failure report to file                                                                                                     |
| `--deploy <N>`          | Add `d=N` to feed and child requests for Arc XP deploy testing                                                                  |

### `check`

Read the site's `robots.txt` and validate the sitemap URLs it lists and their
children in one command. With `--local`, the list still comes from the given
site, but sitemap requests go to `http://localhost` (port 80). To target a
custom host or port, use `discover | validate` as shown above; `check` does not
accept `--domain`.

| Flag                    | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `<url>`                 | Site URL to read `robots.txt` from. The scheme defaults to HTTPS, or HTTP for localhost and loopback addresses supported by the CLI. |
| `--local`               | Send sitemap and child requests to `http://localhost` (port 80). Does not change where `robots.txt` is read. |
| `--max-concurrency <N>` | Concurrent child sitemap requests (default 1)                                                                 |
| `--delay <ms>`          | Delay between requests (default 300)                                                                         |
| `--max-pagination <N>`  | Max children per sitemap-index (0 = all)                                                                     |
| `--deploy <N>`          | Add `d=N` to sitemap and child requests, not to `robots.txt`                                                 |

## Checks

### HTTP (always active)

| Check               | Description                                         |
| ------------------- | --------------------------------------------------- |
| `status`            | HTTP status must be 2xx                             |
| `body-not-empty`    | Response body has content                           |
| `content-type`      | Matches `--content-type` or `--type` if specified   |
| `forbidden-pattern` | No stack traces, fatal errors, or `[object Object]` |

### XML (auto-detected when type is set or content-type is XML)

| Check             | Description                          |
| ----------------- | ------------------------------------ |
| `xml-well-formed` | XML is parseable                     |
| `xml-root`        | Root tag detected (rejects `<html>`) |

### RSS (auto-detected)

| Check           | Description                         |
| --------------- | ----------------------------------- |
| `rss-channel`   | `<channel>` exists                  |
| `rss-title`     | `<title>` not empty                 |
| `rss-link`      | `<link>` not empty                  |
| `rss-items`     | Counts `<item>` elements (0 passes) |
| `rss-item-date` | Item dates are parseable            |

### Atom (auto-detected)

| Check             | Description                                 |
| ----------------- | ------------------------------------------- |
| `atom-title`      | `<title>` exists                            |
| `atom-link`       | `<link>` has `href` attribute               |
| `atom-entries`    | Counts `<entry>` elements (0 passes)        |
| `atom-entry-date` | Dates (`updated`/`published`) are parseable |

### Sitemap (auto-detected)

| Check                   | Description                        |
| ----------------------- | ---------------------------------- |
| `sitemap-urls`          | Counts `<url>` elements (0 passes) |
| `sitemap-loc-empty`     | No empty `<loc>`                   |
| `sitemap-loc-url`       | All `<loc>` are valid URLs         |
| `sitemap-loc-duplicate` | No duplicate `<loc>`               |

### Sitemap Index (auto-detected)

| Check                     | Description                            |
| ------------------------- | -------------------------------------- |
| `sitemap-index-sitemaps`  | Counts `<sitemap>` elements (0 passes) |
| `sitemap-index-loc-empty` | No empty `<loc>`                       |
| `sitemap-index-loc-url`   | All `<loc>` are valid URLs             |

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

| File                              | Tracked         | Purpose                                              |
| --------------------------------- | --------------- | ---------------------------------------------------- |
| `feeds/resolver-path.example.txt` | Yes             | Template — 73 Arc XP routes covering all resolvers   |
| `feeds/sitemap.example.txt`       | Yes             | Fixed list of sitemap and robots routes for `validate --source` |
| `feeds/.obf-failed.txt`           | No (gitignored) | Auto-generated by `--source` — failed URLs for retry |

## Dependencies

- `yargs` — CLI argument parsing
- `fast-xml-parser` — XML parsing
- `fast-xml-validator` — XML well-formed validation

## License

MIT
