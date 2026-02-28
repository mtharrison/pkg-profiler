# where-you-at

## What This Is

A Node.js sampling profiler library with a minimal API (`track()`, `clear()`, `report()`). It periodically captures stack snapshots and attributes wall time to whichever file is currently executing, then rolls that up by npm package into a console-printed tree. Designed to answer "which packages are eating my time?" during test runs or general execution.

## Core Value

Instantly see the per-package breakdown of wall time so you can distinguish slow application code from slow dependencies.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] `track()` starts the sampling profiler (periodic stack snapshot capture)
- [ ] `clear()` resets all accumulated samples and timing data
- [ ] `report()` prints a package-first tree to console with wall time (s) and % of total
- [ ] Stack samples are attributed to whoever is at the top of the stack at sample time (leaf frame = gets the time)
- [ ] Files are mapped to npm packages via node_modules path parsing
- [ ] First-party code (not in node_modules) is grouped as its own entry in the report
- [ ] Per-file breakdown is shown nested under each package row

### Out of Scope

- Module load time tracking — explicitly not a concern, execution time only
- Browser support — Node.js only
- CLI wrapper — library API only, caller decides when to start/stop/report

## Context

- npm package name: `where-you-at`
- Primary use case: profiling test suites to distinguish slow test code from slow helper/dependency packages
- Secondary use case: general "why is my app slow" profiling of any Node.js process
- Attribution model: "self time" (exclusive) — time goes to whoever is currently on the stack, not the caller

## Constraints

- **Platform**: Node.js only — no browser target
- **API surface**: Minimal by design — track(), clear(), report() only for v1
- **Sampling**: Must be low enough overhead to not itself distort results significantly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Sampling over instrumentation | No code transforms required, works on any code including third-party packages | — Pending |
| Leaf-frame attribution | Time goes to whoever is on the stack — matches intuition for "where is time being spent" | — Pending |
| Package-first tree output | Groups files under packages — answers the package-level question first, then drills down | — Pending |

---
*Last updated: 2026-02-28 after initialization*
