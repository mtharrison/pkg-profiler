<p align="center">
  <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none">
    <rect x="10" y="50" width="22" height="60" rx="4" fill="#6366f1" opacity="0.5"/>
    <rect x="38" y="30" width="22" height="80" rx="4" fill="#6366f1" opacity="0.7"/>
    <rect x="66" y="10" width="22" height="100" rx="4" fill="#6366f1" opacity="0.9"/>
    <circle cx="21" cy="40" r="6" fill="#f59e0b"/>
    <circle cx="49" cy="22" r="6" fill="#f59e0b"/>
    <circle cx="77" cy="6" r="6" fill="#f59e0b"/>
    <line x1="21" y1="40" x2="49" y2="22" stroke="#f59e0b" stroke-width="2"/>
    <line x1="49" y1="22" x2="77" y2="6" stroke="#f59e0b" stroke-width="2"/>
    <rect x="94" y="45" width="16" height="12" rx="2" fill="#6366f1"/>
    <rect x="94" y="61" width="16" height="12" rx="2" fill="#6366f1" opacity="0.7"/>
    <rect x="94" y="77" width="16" height="12" rx="2" fill="#6366f1" opacity="0.4"/>
  </svg>
</p>

<h1 align="center">@mtharrison/pkg-profiler</h1>

<p align="center">
  Zero-dependency sampling profiler that shows which npm packages consume your wall time.
</p>

---

## The Problem

You have a slow Node.js process -- maybe a test suite that takes too long, a server that's sluggish to start, or a CLI tool that lags. You fire up a profiler and get a wall of individual function timings. You can see *what* is slow, but not *where* the time is going at the package level.

What you really want to know is: **is the bottleneck in my code, or in a dependency?** And if it's a dependency, *which one*?

`@mtharrison/pkg-profiler` gives you a per-package wall-time breakdown so you can instantly see whether you should be optimizing your own code or looking for a faster alternative to that one heavy dependency.

## Installation

```bash
npm install @mtharrison/pkg-profiler
```

## Usage

```typescript
import { track, report } from '@mtharrison/pkg-profiler';

await track();

// ... your code here ...

const reportPath = await report();
console.log(`Report written to ${reportPath}`);
```

The generated HTML report shows a breakdown of wall time by package, with expandable trees to drill down into individual files and functions.

## API

### `track(options?)`

Starts the V8 CPU sampling profiler. If already profiling, this is a safe no-op.

**Options:**

| Option     | Type     | Description                                    |
|------------|----------|------------------------------------------------|
| `interval` | `number` | Sampling interval in microseconds (optional)   |

**Returns:** `Promise<void>`

### `report()`

Stops the profiler, processes collected samples, generates an HTML report, and returns the absolute path to the report file. Resets all accumulated data after reporting (clean slate for the next cycle).

Returns an empty string if no samples were collected.

**Returns:** `Promise<string>` -- absolute path to the generated HTML report

### `clear()`

Stops the profiler (if running) and resets all accumulated sample data without generating a report.

**Returns:** `Promise<void>`

## How It Works

The library uses the V8 CPU profiler (via `node:inspector`) to periodically sample the call stack. Each sample's leaf frame (the function currently executing) is attributed the elapsed wall time. File paths are resolved to npm packages by detecting `node_modules` segments, giving you a per-package time breakdown without any code instrumentation.

## Requirements

- Node.js >= 20.0.0

## License

MIT
