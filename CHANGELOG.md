# Changelog

## [0.3.0] - 2026-07-01

### Added

- **Batch validate**: flag `--source <file>` para validar múltiples rutas desde archivo
- **Flag `--domain`**: dominio base para rutas relativas en el archivo source
- **`npm run validate` script**: comando estándar para ejecutar la herramienta

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
