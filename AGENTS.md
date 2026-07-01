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

- `src/fetcher.js` — HTTP transport layer
- `src/validate.js` — core validation orchestrator
- `src/validators/` — type-specific validators (xml.js, etc.)
- `src/index.js` — CLI entry point

## Validation philosophy

- The core must be **CMS-agnostic**
- CMS-specific behavior (e.g. Arc XP) belongs in **presets/config examples**, not in the core
- Every check must be independently skippable / configurable
- Return structured results (`{ url, passed, checks }`), never throw for validation failures

## Testing

- Use **vitest** — `npm test` to run, `npm run test:watch` for watch mode
- Mock `globalThis.fetch` for `fetcher.test.js`
- Mock `fetchUrl` export with `vi.hoisted()` + `vi.mock()` factory for `validate.test.js` and `discover.test.js`
- Mock `node:fs` with `vi.mock()` (not `vi.spyOn`, which doesn't work on ESM module namespace)
- Helper functions exported from `src/index.js` specifically for testing
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
