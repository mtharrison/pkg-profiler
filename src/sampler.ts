import { Session } from 'node:inspector/promises';
import type { Profiler } from 'node:inspector';
import { parseFrame } from './frame-parser.js';
import { PackageResolver } from './package-resolver.js';
import { generateReport } from './reporter.js';
import { SampleStore } from './sample-store.js';
import type { RawCallFrame } from './types.js';

// Module-level state -- lazy initialization
let session: Session | null = null;
let profiling = false;
const store = new SampleStore();
const resolver = new PackageResolver(process.cwd());

/**
 * Start the V8 CPU profiler. If already profiling, this is a safe no-op.
 */
export async function track(options?: { interval?: number }): Promise<void> {
  if (profiling) return;

  if (session === null) {
    session = new Session();
    session.connect();
  }

  await session.post('Profiler.enable');

  if (options?.interval !== undefined) {
    await session.post('Profiler.setSamplingInterval', {
      interval: options.interval,
    });
  }

  await session.post('Profiler.start');
  profiling = true;
}

/**
 * Stop the profiler (if running) and reset all accumulated sample data.
 */
export async function clear(): Promise<void> {
  if (profiling && session) {
    await session.post('Profiler.stop');
    await session.post('Profiler.disable');
    profiling = false;
  }
  store.clear();
}

/**
 * Stop the profiler, process collected samples through the data pipeline
 * (parseFrame -> PackageResolver -> SampleStore), generate an HTML report,
 * and return the file path. Resets the store after reporting (clean slate
 * for next cycle).
 *
 * Returns the absolute path to the generated HTML file, or empty string
 * if no samples were collected.
 */
export async function report(): Promise<string> {
  if (!profiling || !session) {
    console.log('no samples collected');
    return '';
  }

  const { profile } = await session.post('Profiler.stop');
  await session.post('Profiler.disable');
  profiling = false;

  processProfile(profile);

  let filepath = '';

  if (store.packages.size > 0) {
    filepath = generateReport(store);
  } else {
    console.log('no samples collected');
  }

  store.clear();
  return filepath;
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

    if (parsed.kind === 'user') {
      if (parsed.filePath.startsWith('node:')) {
        // Node.js built-in: attribute to "node (built-in)" package
        const relativePath = parsed.filePath.slice(5);
        store.record('node (built-in)', relativePath, parsed.functionId, deltaUs);
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
