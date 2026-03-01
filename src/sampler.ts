import { readFileSync } from "node:fs";
import type { Profiler } from "node:inspector";
import { Session } from "node:inspector";
import { join } from "node:path";
import { AsyncTracker } from "./async-tracker.js";
import { parseFrame } from "./frame-parser.js";
import { PackageResolver } from "./package-resolver.js";
import { PkgProfile } from "./pkg-profile.js";
import { aggregate } from "./reporter/aggregate.js";
import { SampleStore } from "./sample-store.js";
import type {
  ProfileCallbackOptions,
  RawCallFrame,
  StartOptions,
} from "./types.js";

// Module-level state -- lazy initialization
let session: Session | null = null;
let profiling = false;
let startHrtime: [number, number] | null = null;
const store = new SampleStore();
const asyncStore = new SampleStore();
const resolver = new PackageResolver(process.cwd());
let asyncTracker: AsyncTracker | null = null;

/**
 * Promisify session.post for the normal async API path.
 */
function postAsync(method: string, params?: object): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    const cb: any = (err: Error | null, result?: any) => {
      if (err) reject(err);
      else resolve(result);
    };
    if (params !== undefined) {
      session!.post(method, params, cb);
    } else {
      session!.post(method, cb);
    }
  });
}

/**
 * Synchronous session.post — works because the V8 inspector executes
 * callbacks synchronously for in-process sessions.
 */
function postSync(method: string): any {
  let result: any;
  let error: Error | null = null;
  const cb: any = (err: Error | null, params?: any) => {
    error = err;
    result = params;
  };
  session!.post(method, cb);
  if (error) throw error;
  return result;
}

function readProjectName(cwd: string): string {
  try {
    const raw = readFileSync(join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name ?? "app";
  } catch {
    return "app";
  }
}

function buildEmptyProfile(): PkgProfile {
  const projectName = readProjectName(process.cwd());
  return new PkgProfile({
    timestamp: new Date().toLocaleString(),
    totalTimeUs: 0,
    packages: [],
    otherCount: 0,
    projectName,
  });
}

/**
 * Shared logic for stopping the profiler and building a PkgProfile.
 * Synchronous — safe to call from process `exit` handlers.
 */
function stopSync(): PkgProfile {
  if (!profiling || !session) {
    return buildEmptyProfile();
  }

  const elapsed = startHrtime ? process.hrtime(startHrtime) : null;
  const wallTimeUs = elapsed ? elapsed[0] * 1_000_000 + Math.round(elapsed[1] / 1000) : undefined;
  startHrtime = null;

  const { profile } = postSync("Profiler.stop") as Profiler.StopReturnType;
  postSync("Profiler.disable");
  profiling = false;

  let globalAsyncTimeUs: number | undefined;
  if (asyncTracker) {
    asyncTracker.disable();
    globalAsyncTimeUs = asyncTracker.mergedTotalUs;
    asyncTracker = null;
  }

  processProfile(profile);

  const projectName = readProjectName(process.cwd());
  const data = aggregate(
    store,
    projectName,
    asyncStore.packages.size > 0 ? asyncStore : undefined,
    globalAsyncTimeUs,
    wallTimeUs,
  );
  store.clear();
  asyncStore.clear();

  return new PkgProfile(data);
}

/**
 * Start the V8 CPU profiler. If already profiling, this is a safe no-op.
 *
 * @param options - Optional configuration.
 * @param options.interval - Sampling interval in microseconds passed to V8 (defaults to 1000µs). Lower values = higher fidelity but more overhead.
 * @returns Resolves when the profiler is successfully started
 */
export async function start(options?: StartOptions): Promise<void> {
  if (profiling) return;

  if (session === null) {
    session = new Session();
    session.connect();
  }

  await postAsync("Profiler.enable");

  if (options?.interval !== undefined) {
    await postAsync("Profiler.setSamplingInterval", {
      interval: options.interval,
    });
  }

  await postAsync("Profiler.start");
  profiling = true;
  startHrtime = process.hrtime();

  if (options?.trackAsync) {
    asyncTracker = new AsyncTracker(resolver, asyncStore);
    asyncTracker.enable();
  }
}

/**
 * Stop the profiler, process collected samples, and return a PkgProfile
 * containing the aggregated data. Resets the store afterward.
 *
 * @returns A PkgProfile with the profiling results, or a PkgProfile with empty data if no samples were collected.
 */
export async function stop(): Promise<PkgProfile> {
  return stopSync();
}

/**
 * Stop the profiler (if running) and reset all accumulated sample data.
 */
export async function clear(): Promise<void> {
  if (profiling && session) {
    postSync("Profiler.stop");
    postSync("Profiler.disable");
    profiling = false;
  }
  startHrtime = null;
  store.clear();
  if (asyncTracker) {
    asyncTracker.disable();
    asyncTracker = null;
  }
  asyncStore.clear();
}

/**
 * High-level convenience for common profiling patterns.
 *
 * Overload 1: Profile a block of code — runs `fn`, stops the profiler, returns PkgProfile.
 * Overload 2: Long-running mode — starts profiler, registers exit handlers, calls `onExit` on shutdown.
 */
export async function profile(
  fn: () => void | Promise<void>,
): Promise<PkgProfile>;
export async function profile(options: ProfileCallbackOptions): Promise<void>;
export async function profile(
  fnOrOptions: (() => void | Promise<void>) | ProfileCallbackOptions,
): Promise<PkgProfile | void> {
  if (typeof fnOrOptions === "function") {
    await start();
    try {
      await fnOrOptions();
    } finally {
      return stop();
    }
  }

  // Long-running / onExit mode
  const { onExit, ...startOpts } = fnOrOptions;
  await start(startOpts);

  let handled = false;

  const handler = (signal?: NodeJS.Signals) => {
    if (handled) return;
    handled = true;

    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("exit", onProcessExit);

    const result = stopSync();
    onExit(result);

    if (signal) {
      process.kill(process.pid, signal);
    }
  };

  const onSignal = (signal: NodeJS.Signals) => {
    handler(signal);
  };
  const onProcessExit = () => {
    handler();
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("exit", onProcessExit);
}

/**
 * Process a V8 CPUProfile: walk each sample, parse the frame, resolve
 * the package, and record into the store. Uses timeDeltas for wall-time
 * microsecond accumulation.
 */
function processProfile(profile: Profiler.Profile): void {
  const nodeMap = new Map(profile.nodes.map((n) => [n.id, n]));
  const samples = profile.samples ?? [];
  const timeDeltas = profile.timeDeltas ?? [];

  for (let i = 0; i < samples.length; i++) {
    const node = nodeMap.get(samples[i]!);
    if (!node) continue;

    const deltaUs = timeDeltas[i] ?? 0;
    const parsed = parseFrame(node.callFrame as RawCallFrame);

    if (parsed.kind === "user") {
      if (parsed.filePath.startsWith("node:")) {
        // Node.js built-in: attribute to "node (built-in)" package
        const relativePath = parsed.filePath.slice(5);
        store.record(
          "node (built-in)",
          relativePath,
          parsed.functionId,
          deltaUs,
        );
      } else {
        const { packageName, relativePath } = resolver.resolve(parsed.filePath);
        store.record(packageName, relativePath, parsed.functionId, deltaUs);
      }
    } else {
      store.recordInternal(deltaUs);
    }
  }
}

/** @internal -- exposed for testing only */
export function _getStore(): SampleStore {
  return store;
}
