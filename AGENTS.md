# OBF Tester — Project Rules

## Language

- All code, comments, commit messages, and documentation must be in **English**
- Code is written for international developers

## Code style

- Use **ES modules** (`type: module` in package.json) — no CommonJS (`require`)
- Use **Node.js built-in `fetch`** — no axios, got, or request
- Minimize dependencies; only add when there is no reasonable built-in alternative
- Follow existing code style and patterns in the project
- No semicolons unless required
- 2-space indentation

## Architecture

- `src/http.js` — HTTP transport layer (fetchUrl, normalizeUrl, resolveUrl, isProdUrl, mapConcurrent)
- `src/validate.js` — core validation orchestrator
- `src/validators/` — type-specific validators (xml.js, etc.)
- `src/parsers/` — text-to-data parsers (robots.js, sitemap.js)
- `src/commands/` — CLI command implementations (validate.js, discover.js, check.js)
- `src/cli.js` — yargs command definitions
- `src/logger.js` — user-facing output with [PASS]/[FAIL] tags
- `src/source.js` — file/stdin source reader
- `src/index.js` — CLI entry point (isMain guard)

## Validation philosophy

- The core must be **CMS-agnostic**
- CMS-specific behavior (e.g. Arc XP) belongs in **presets/config examples**, not in the core
- Every check must be independently skippable / configurable
- Return structured results (`{ url, passed, checks }`), never throw for validation failures

## Testing

- Use **vitest** — `npm test` to run, `npm run test:watch` for watch mode
- Mock `globalThis.fetch` for `http.test.js`
- Mock `fetchUrl` export with `vi.hoisted()` + `vi.mock()` factory for `validate.test.js`, `robots.test.js`, and `commands/validate.test.js`
- Mock `node:fs` with `vi.mock()` (not `vi.spyOn`, which doesn't work on ESM module namespace)
- Test files mirror source structure: `test/http.test.js`, `test/validate.test.js`, `test/xml.test.js`, `test/robots.test.js`, `test/sitemap.test.js`, `test/source.test.js`, `test/commands/validate.test.js`
- Guard CLI entry with `isMain` check to prevent `main()` execution on import
- Coverage: `npx vitest run --coverage` (requires `@vitest/coverage-v8`)

## Git

- Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes:
  - `feat:` — new feature
  - `fix:` — bug fix
  - `docs:` — documentation
  - `refactor:` — code restructure
  - `chore:` — tooling, dependencies
- Keep commits small and focused
- Update `CHANGELOG.md` with each feature or meaningful change
- Don't commit secrets, `.env` files, or generated artifacts
