<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="where-you-at logo">
</p>

<h1 align="center">@mtharrison/pkg-profiler</h1>

<p align="center">
  <strong>Where's your wall time going? Find out in one call.</strong><br>
  Zero-dependency sampling profiler that breaks down Node.js wall time by npm package.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mtharrison/pkg-profiler"><img src="https://img.shields.io/npm/v/@mtharrison/pkg-profiler" alt="npm version"></a>
  <img src="https://img.shields.io/node/v/@mtharrison/pkg-profiler" alt="node version">
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@mtharrison/pkg-profiler" alt="license"></a>
</p>

<p align="center">
  <img src="assets/report-screenshot.png" width="660" alt="Example HTML report showing per-package wall time breakdown">
</p>

## Quick Start

```typescript
import { track, report } from '@mtharrison/pkg-profiler';

await track();
// ... your code here ...
const path = await report(); // writes an HTML report to cwd
```

## What You Get

A self-contained HTML report that shows exactly which npm packages are eating your wall time. The summary table gives you the top-level picture; expand the tree to drill into individual files and functions. First-party code is highlighted so you can instantly see whether the bottleneck is yours or a dependency's.

## API

### `track(options?)`

Start the V8 CPU sampling profiler. Safe no-op if already profiling.

| Option     | Type     | Default | Description                        |
|------------|----------|---------|------------------------------------|
| `interval` | `number` | V8 default | Sampling interval in microseconds |

### `report()`

Stop profiling, generate an HTML report, write it to the current directory, and return the absolute file path. Resets all data afterward. Returns `""` if no samples were collected.

### `clear()`

Stop profiling and discard all data without writing a report.

## How It Works

Uses the V8 CPU profiler (`node:inspector`) to sample the call stack at regular intervals. Each sample's leaf frame is attributed the elapsed wall time, then file paths are resolved to npm packages by walking up through `node_modules`. No code instrumentation required.

## Requirements

Node.js >= 20.0.0

## License

MIT
