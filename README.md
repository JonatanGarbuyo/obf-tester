# OBF Tester

**Outbound Feed Tester** — CLI tool to validate feeds, sitemaps, RSS/Atom, and XML/text endpoints across any CMS.

CMS-agnostic. Configurable via environment variables and route definitions.

## Estado actual

`validate` implementado con soporte para HTTP, XML, RSS, Atom y sitemaps.

## Requisitos

- Node.js >= 22

## Instalación

```bash
npm install
```

## Uso

```bash
# validar una URL
npm run validate -- <url>

# validar con tipo específico
npm run validate -- <url> --type rss

# validar múltiples rutas desde archivo (con dominio base)
npm run validate -- --source ./feeds.txt --domain https://www.example.com

# validar múltiples URLs absolutas desde archivo (sin dominio)
npm run validate -- --source ./urls.txt
```

El exit code es `0` si todas las validaciones pasan, `1` si alguna falla.

### Formato del archivo (`--source`)

```
# comentarios y líneas vacías se ignoran
/ruta/relativa/feed.xml
/ruta/relativa/sitemap.xml?outputType=xml
https://url-absoluta.com/feed.xml
```

- Rutas relativas requieren `--domain`
- URLs absolutas se usan tal cual (o se reescriben con `--domain` si se especifica)
- `--type` y `--content-type` aplican a todas las rutas del batch

### Options

| Flag | Descripción |
|------|-------------|
| `--type <type>` | Feed type: `xml`, `rss`, `atom`, `sitemap` |
| `--content-type <type>` | Expected Content-Type |
| `--source <file>` | File with routes (one per line) |
| `--domain <url>` | Base domain for relative routes in source |

## Validaciones

### HTTP (siempre activas)

| Check | Descripción |
|-------|-------------|
| `status` | HTTP status debe ser 2xx |
| `body-not-empty` | Body con contenido (no vacío) |
| `content-type` | Coincide con `--content-type` o `--type` si se especifica |
| `forbidden-pattern` | Ausencia de stack traces, errores fatales, `[object Object]` |

### XML (se activan con `--type` o si content-type es XML)

| Check | Descripción |
|-------|-------------|
| `xml-well-formed` | XML parseable |
| `xml-root` | Root tag detectado (y no es `<html>`) |

### RSS (auto-detectado o con `--type rss`)

| Check | Descripción |
|-------|-------------|
| `rss-channel` | `<channel>` existe |
| `rss-title` | `<title>` no vacío |
| `rss-link` | `<link>` no vacío |
| `rss-items` | Al menos un `<item>` |
| `rss-item-date` | Fechas en items parseables |

### Atom (auto-detectado o con `--type atom`)

| Check | Descripción |
|-------|-------------|
| `atom-title` | `<title>` existe |
| `atom-link` | `<link>` con atributo `href` |
| `atom-entries` | Al menos un `<entry>` |
| `atom-entry-date` | Fechas (`updated`/`published`) parseables |

### Sitemap (auto-detectado o con `--type sitemap`)

| Check | Descripción |
|-------|-------------|
| `sitemap-urls` | Al menos un `<url>` |
| `sitemap-loc-empty` | Ningún `<loc>` vacío |
| `sitemap-loc-url` | Todos los `<loc>` son URLs válidas (http/https) |
| `sitemap-loc-duplicate` | Sin `<loc>` duplicados |

### Patrones prohibidos (default)

- `    at ` (stack traces JS/Python)
- `Traceback (most recent call last)`
- `Fatal error`
- `Catchable fatal error`
- `[object Object]`

## Tests realizados

### PASS (single URL)

```
npm run validate -- https://hnrss.org/frontpage --type rss
npm run validate -- https://github.blog/feed/atom --type atom
npm run validate -- https://www.sitemaps.org/sitemap.xml --type sitemap
```

### PASS (batch)

```
npm run validate -- --source ./feeds.txt --domain https://www.canal26.com
npm run validate -- --source ./feeds.txt --domain http://localhost
```

### FAIL

```
npm run validate -- https://httpbin.org/status/500
npm run validate -- https://httpbin.org/status/404
npm run validate -- https://httpbin.org/html --type xml
```

## Arquitectura

```
src/
├── index.js              # CLI entry point
├── fetcher.js            # HTTP wrapper (fetch + timeout + redirects)
├── validate.js           # Core de validación
└── validators/
    └── xml.js            # XML parseo, RSS, Atom, sitemap validators
```

### `fetcher.js`

- Wrapper sobre `fetch` nativo de Node.js
- Timeout configurable (default 15s)
- User-Agent: `OBF-tester/0.1`
- Sigue redirects automáticamente
- Retorna `{ url, status, statusText, headers, contentType, body }`

### `validate.js`

- Función `validate(url, options)` asíncrona
- Parámetros: `expectedContentType`, `forbiddenPatterns`, `timeout`, `type`
- Retorna `{ url, passed: boolean, checks: [{ check, passed, detail }] }`

### `validators/xml.js`

- Usa `fast-xml-parser` para parseo
- Detecta automáticamente el tipo: `rss`, `atom`, `sitemap`, `sitemap-index` o `xml`
- Valida estructura específica de cada tipo de feed

### `index.js`

- CLI que parsea argumentos y ejecuta el comando `validate`
- Exit code 0 si pasa, 1 si falla

## Dependencias

- `fast-xml-parser` — parseo y validación de XML

## Licencia

MIT
