import { fileURLToPath } from 'node:url';
import type { RawCallFrame, ParsedFrame } from './types.js';

/**
 * Classify a V8 CPU profiler call frame and convert its URL to a filesystem path.
 *
 * Every sampled frame from the V8 profiler passes through this function first.
 * It determines the frame kind (user code, internal, eval, wasm) and for user
 * frames converts the URL to a filesystem path and builds a human-readable
 * function identifier.
 *
 * @param frame - Raw call frame from the V8 CPU profiler.
 * @returns A classified frame: `'user'` with file path and function id, or a non-user kind.
 */
export function parseFrame(frame: RawCallFrame): ParsedFrame {
  const { url, functionName, lineNumber } = frame;

  // Empty URL: V8 internal pseudo-frames like (idle), (root), (gc), (program)
  if (url === '') {
    return { kind: 'internal' };
  }

  // Node.js built-in modules -- treated as attributable user frames
  if (url.startsWith('node:')) {
    const functionId = `${functionName || '<anonymous>'}:${lineNumber + 1}`;
    return { kind: 'user', filePath: url, functionId };
  }

  // WebAssembly frames
  if (url.startsWith('wasm:')) {
    return { kind: 'wasm' };
  }

  // Eval frames
  if (url.includes('eval')) {
    return { kind: 'eval' };
  }

  // User code: convert URL to filesystem path
  const filePath = url.startsWith('file://')
    ? fileURLToPath(url)
    : url;

  // Build human-readable function identifier (convert 0-based to 1-based line)
  const functionId = `${functionName || '<anonymous>'}:${lineNumber + 1}`;

  return { kind: 'user', filePath, functionId };
}
