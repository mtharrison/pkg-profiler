# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # Run all tests (vitest run)
npm run test:watch    # Run tests in watch mode
npx vitest run test/sampler.test.ts  # Run a single test file
npm run typecheck     # Type-check without emitting (tsc --noEmit)
npm run build         # Build with tsdown (dual ESM/CJS → dist/)
```

## Architecture

Zero-dependency V8 sampling profiler that attributes wall time to npm packages. Data flows through a pipeline:

1. **V8 Sampling** (`sampler.ts`) — Starts/stops the CPU profiler via `node:inspector/promises`. Module-level singleton state (session, store, resolver). `stop()` returns an immutable `PkgProfile`.
2. **Frame Classification** (`frame-parser.ts`) — Classifies each V8 call frame as `user | internal | eval | wasm` using a discriminated union. Converts `file://` URLs to filesystem paths.
3. **Package Resolution** (`package-resolver.ts`) — Maps absolute file paths to package names. Uses the LAST `/node_modules/` segment (critical for pnpm virtual store). Caches `package.json` lookups.
4. **Data Accumulation** (`sample-store.ts`) — Nested `Map<pkg, Map<file, Map<fn, microseconds>>>` with a parallel map for sample counts.
5. **Aggregation** (`reporter/aggregate.ts`) — Pure function transforming `SampleStore` → `ReportData`. Applies 5% threshold at package/file/function levels, sorts by time descending.
6. **HTML Rendering** (`reporter/html.ts`, `reporter/format.ts`) — Self-contained HTML with inline CSS. Summary table + expandable `<details>` tree.

`PkgProfile` (`pkg-profile.ts`) is the public result container with `writeHtml(path?)` for file output.

## TypeScript Conventions

- **All imports use `.js` extensions** — Required by `verbatimModuleSyntax: true` + ESM. Write `import { foo } from './bar.js'` even for `.ts` files.
- **`isolatedDeclarations: true`** — Each file's exported types must be independently resolvable. Don't rely on type inference across module boundaries for exported signatures.
- **`strict: true`** — Full strict mode including `strictNullChecks`.
- **`import type` for type-only imports** — Required by `verbatimModuleSyntax`.

## Test Conventions

- Vitest with global `describe`/`it`/`expect`. Use `vi` for mocking.
- `test/fixtures/cpu-work.ts` provides `burnCpu(iterations)` for real V8 profiler samples.
- Tests that generate HTML files track paths in `generatedFiles[]` and clean up in `afterEach`.
- Profiler state must be reset between tests: call `await clear()` in `afterEach`.

## Public API

Exported from `src/index.ts`: `start`, `stop`, `clear`, `profile`, `PkgProfile`, plus type exports (`PackageEntry`, `StartOptions`, `ProfileCallbackOptions`). Deprecated aliases `track`/`report` re-export `start`/`stop`.
