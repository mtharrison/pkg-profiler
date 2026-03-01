<p align="center">
  <img src="assets/logo-removebg-preview.png" width="180" height="180" alt="where-you-at logo">
</p>

<h1 align="center">pkg-profiler</h1>

<p align="center">
  <strong>See which packages own your wall time.</strong><br>
  Zero-dependency sampling profiler that breaks down Node.js wall time consumed by CPU and IO bound operations by npm package.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mtharrison/pkg-profiler"><img src="https://img.shields.io/npm/v/@mtharrison/pkg-profiler" alt="npm version"></a>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="zero dependencies">
  <img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white" alt="TypeScript strict">
  <a href="https://www.npmjs.com/package/@mtharrison/pkg-profiler"><img src="https://img.shields.io/npm/dm/@mtharrison/pkg-profiler" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@mtharrison/pkg-profiler" alt="license"></a>
  <br>
  <a href="https://github.com/mtharrison/pkg-profiler/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mtharrison/pkg-profiler/ci.yml?logo=node.js&label=Node%2020" alt="Node 20"></a>
  <a href="https://github.com/mtharrison/pkg-profiler/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mtharrison/pkg-profiler/ci.yml?logo=node.js&label=Node%2022" alt="Node 22"></a>
  <a href="https://github.com/mtharrison/pkg-profiler/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/mtharrison/pkg-profiler/ci.yml?logo=node.js&label=Node%2024" alt="Node 24"></a>
</p>

<p align="center"><strong><a href="#installation">Installation</a></strong> | <strong><a href="#quick-start">Quick Start</a></strong> | <strong><a href="#api">API</a></strong> | <strong><a href="#async-io-tracking">Async I/O Tracking</a></strong> | <strong><a href="#how-it-works">How It Works</a></strong></p>

<p align="center">
  <img src="assets/report-screenshot.png" width="660" alt="Example HTML report showing per-package wall time breakdown">
</p>

## Installation

```bash
npm install @mtharrison/pkg-profiler
```

Works with both ESM (`import`) and CommonJS (`require`).

## Quick Start

```typescript
import { profile } from "@mtharrison/pkg-profiler";

await profile({
  trackAsync: true,
  onExit: (result) => result.writeHtml(),
});

const app = createApp();
app.listen(3000);
// Ctrl+C -> profiler stops -> HTML report written -> process exits
```

Profile a block of code:

```typescript
import { profile } from "@mtharrison/pkg-profiler";

const result = await profile(async () => {
  await build();
});
result.writeHtml();
```

Or use the lower-level start/stop API:

```typescript
import { start, stop } from "@mtharrison/pkg-profiler";

await start({ trackAsync: true });
// ... your code here ...
const result = await stop();
result.writeHtml();
```

## What You Get

A self-contained HTML report that shows exactly which npm packages are eating your wall time. The summary table gives you the top-level picture; expand the tree to drill into individual files and functions. First-party code is highlighted so you can instantly see whether the bottleneck is yours or a dependency's.

## API

### `start(options?)`

Start the V8 CPU sampling profiler. Safe no-op if already profiling.

| Option       | Type      | Default | Description                                           |
| ------------ | --------- | ------- | ----------------------------------------------------- |
| `interval`   | `number`  | `1000`  | Sampling interval in microseconds                     |
| `trackAsync` | `boolean` | `false` | Enable async I/O wait time tracking via `async_hooks` |

### `stop()`

Stop the profiler and return a `PkgProfile` containing the aggregated data. Resets the sample store afterward.

### `clear()`

Stop profiling and discard all data without generating a profile.

### `profile(fn)`

Profile a block of code. Starts the profiler, runs `fn`, stops the profiler, and returns a `PkgProfile`.

```typescript
const result = await profile(async () => {
  await runBuild();
  await runTests();
});
const path = result.writeHtml();
```

### `profile({ onExit })`

Long-running mode for servers. Starts the profiler and registers shutdown handlers for SIGINT, SIGTERM, and `beforeExit`. When triggered, stops the profiler and calls `onExit` with the result.

`StartOptions` (`interval`, `trackAsync`) can be passed alongside `onExit`:

```typescript
await profile({
  trackAsync: true,
  onExit: (result) => result.writeHtml(),
});

const app = createApp();
app.listen(3000);
// Ctrl+C -> stop() called -> onExit fires -> writeHtml() -> process exits
```

### `PkgProfile`

Returned by `stop()` and `profile()`. Contains aggregated profiling data.

| Property           | Type                  | Description                                                       |
| ------------------ | --------------------- | ----------------------------------------------------------------- |
| `timestamp`        | `string`              | When the profile was captured                                     |
| `totalTimeUs`      | `number`              | Total sampled CPU time in microseconds                            |
| `wallTimeUs`       | `number \| undefined` | Elapsed wall time from `start()` to `stop()` in microseconds      |
| `totalAsyncTimeUs` | `number \| undefined` | Total async I/O wait time in microseconds (requires `trackAsync`) |
| `packages`         | `PackageEntry[]`      | Package breakdown sorted by time descending                       |
| `otherCount`       | `number`              | Number of packages below reporting threshold                      |
| `projectName`      | `string`              | Project name from `package.json`                                  |

#### `writeHtml(path?)`

Write a self-contained HTML report to disk. Returns the absolute path to the written file.

- **Default**: writes to `./where-you-at-{timestamp}.html` in the current directory
- **With path**: writes to the specified location

## Async I/O Tracking

Enable `trackAsync: true` to measure time spent waiting on async I/O (network requests, file reads, timers, etc.) in addition to CPU sampling. This uses Node.js `async_hooks` to track when async operations start and complete, attributing wait time to the originating package.

When enabled, each `PackageEntry` gains additional fields:

| Property       | Type                  | Description                                  |
| -------------- | --------------------- | -------------------------------------------- |
| `asyncTimeUs`  | `number \| undefined` | Async wait time for this package             |
| `asyncPct`     | `number \| undefined` | Percentage of total async time               |
| `asyncOpCount` | `number \| undefined` | Number of async operations from this package |

The HTML report will include async timing data alongside CPU time when available.

### Dependency Chains

Each `PackageEntry` includes an optional `depChain` field showing how a transitive dependency is reached. For example, if `raw-body` is used via `express -> body-parser -> raw-body`, the `depChain` will be `["express", "body-parser", "raw-body"]`. Direct dependencies and first-party code will not have a `depChain`.

## How It Works

Uses the V8 CPU profiler (`node:inspector`) to sample the call stack at regular intervals. Each sample's leaf frame is attributed the elapsed wall time, then file paths are resolved to npm packages by walking up through `node_modules`. No code instrumentation required.

When `trackAsync` is enabled, `async_hooks` are used to additionally measure time spent waiting on async I/O and attribute it to the originating package.

## Requirements

Node.js >= 20.0.0

## License

MIT
