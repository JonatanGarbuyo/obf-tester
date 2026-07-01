# Changelog

## [0.10.0] - 2026-07-01

### Added

- **Crawl-Delay support**: `discover()` extracts `Crawl-Delay` from robots.txt, used as delay between requests
- **`--delay <ms>` flag**: override delay between requests (default 300ms)
- **`sleep()` helper**: awaitable delay function for rate-limited loops

### Changed

- **Default concurrency 3→1**: serial child validation by default to protect upstream
- **`check` output**: shows sitemap count, Crawl-Delay, and effective delay

### Fixed

- **`discover` error shape**: now returns `crawlDelay: null` consistently on errors

## [0.9.0] - 2026-07-01

### Changed

- **Default concurrency 10→3**: reduces pressure on local Fusion during `--recursive`
- **429 retry with backoff**: `fetcher.js` retries 3 times with delays (1s, 2s, 4s + jitter)
- Usage examples updated in README

## [0.8.0] - 2026-07-01

### Added

- **Test suite**: 127 tests across 5 files using vitest
- **`isMain` guard**: prevents `main()` execution on import for testing
- **Exported helpers**: `normalizeUrl`, `resolveUrl`, `extractChildUrls`, `isProdUrl`, `parseOptions`, `mapConcurrent`, `readSource`

### Fixed

- **discover regex**: `\s*` matched across newlines, causing empty `Sitemap:` lines to consume next line
- **ESM mocking**: use `vi.mock('node:fs')` instead of `vi.spyOn` for Node built-in modules

## [0.7.0] - 2026-07-01

### Added

- **`--max-concurrency <N>`**: parallelizes recursive child validation (default 10), maintains output order
- **`mapConcurrent` helper**: runs async tasks in parallel batches with order preservation
- Removed `--max` limit — all children are validated with concurrency instead

## [0.6.0] - 2026-07-01

### Added

- **`check` subcommand**: `npx obf check <url>` — discover + validate + recursive in one command
- **`--local` flag**: shorthand for `--domain http://localhost`
- **`--max <N>` flag**: limit recursive children (default 3, 0 = all)
- **Production warning**: warns when validating against production URLs without `--domain` or `--local`

## [0.5.0] - 2026-07-01

### Added

- **`--recursive` flag**: follows `<sitemapindex>` children and validates each sitemap automatically
- **`validate()` now returns `body` and `contentType`**: enables recursive inspection without re-fetching

## [0.4.0] - 2026-07-01

### Added

- **Discover mode**: `npx obf discover <url>` — fetches robots.txt, extracts Sitemap URLs to stdout
- **Stdin support**: `--source -` reads routes from stdin for pipe workflows
- **Subcomandos**: `validate` y `discover` como comandos de primer nivel

## [0.3.0] - 2026-07-01

### Added

- **Batch validate**: flag `--source <file>` para validar múltiples rutas desde archivo
- **Flag `--domain`**: dominio base para rutas relativas en el archivo source
- **`npx obf validate`**: binario como interfaz principal via npx

## [0.2.0] - 2026-07-01

### Added

- **Validación XML**: parseo, well-formed, detección automática de tipo (RSS, Atom, sitemap, sitemap-index, XML plano)
- **Validación RSS**: `<channel>` existe, `<title>` no vacío, `<link>` no vacío, al menos un `<item>`, fechas parseables
- **Validación Atom**: `<title>` existe, `<link>` con `href`, al menos un `<entry>`, fechas parseables
- **Validación Sitemap**: al menos un `<url>`, ningún `<loc>` vacío, todos los `<loc>` son URLs válidas, sin duplicados
- **Flag `--type`**: forzar tipo de feed (`xml`, `rss`, `atom`, `sitemap`)
- **Content-type flexible**: `application/xml`, `text/xml`, `application/rss+xml`, `application/atom+xml` se tratan como intercambiables
- **Guard HTML en root**: si el root tag es `<html>`, se rechaza como feed XML inválido

## [0.1.0] - 2026-07-01

### Added

- **Proyecto base**: `package.json` con `type: module`, `.gitignore`, `README.md`
- **Módulo `fetcher.js`**: wrapper HTTP con timeout (15s), User-Agent, follows redirects
- **Módulo `validate.js`**: core con checks HTTP status, body no vacío, content-type, patrones prohibidos
- **CLI `obf validate`**: entry point con exit code 0/1
- **Patrones prohibidos**: detección de stack traces (`    at `), `Fatal error`, `Catchable fatal error`, `Traceback`, `[object Object]`
