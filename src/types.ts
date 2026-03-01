/**
 * Raw V8 CPU profiler call frame matching Chrome DevTools Protocol Runtime.CallFrame.
 */
export interface RawCallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

/**
 * Parsed and classified stack frame.
 * Discriminated union on the `kind` field.
 */
export type ParsedFrame =
  | { kind: 'user'; filePath: string; functionId: string }
  | { kind: 'internal' }
  | { kind: 'eval' }
  | { kind: 'wasm' };

/**
 * Report data types for the aggregate/HTML pipeline.
 */
export interface ReportEntry {
  name: string;
  timeUs: number;       // accumulated microseconds
  pct: number;          // percentage of total (0-100)
  sampleCount: number;  // number of samples attributed
  asyncTimeUs?: number;   // accumulated async wait microseconds
  asyncPct?: number;      // percentage of total async time (0-100)
  asyncOpCount?: number;  // number of async operations attributed
}

export interface StackFrame {
  pkg: string;
  file: string;
  functionId: string;
}

export interface FunctionEntry extends ReportEntry {
  sourceHtml?: string;
  asyncCallStack?: StackFrame[];
}

export interface FileEntry extends ReportEntry {
  functions: FunctionEntry[];
  otherCount: number;
}

export interface PackageEntry extends ReportEntry {
  isFirstParty: boolean;
  depChain?: string[];
  files: FileEntry[];
  otherCount: number;
}

export interface ReportData {
  timestamp: string;
  totalTimeUs: number;
  packages: PackageEntry[];
  otherCount: number;
  projectName: string;
  totalAsyncTimeUs?: number;
  wallTimeUs?: number;
  projectRoot?: string;
}

/**
 * Options for `start()`.
 */
export interface StartOptions {
  /** Sampling interval in microseconds. Default: 1000 */
  interval?: number;
  /** Enable async I/O wait time tracking via async_hooks. Default: false */
  trackAsync?: boolean;
}

/**
 * Options for `profile()` when used in long-running/server mode with an exit callback.
 */
export interface ProfileCallbackOptions extends StartOptions {
  /** Called with the PkgProfile when the process receives SIGINT/SIGTERM or beforeExit fires. */
  onExit: (result: import('./pkg-profile.js').PkgProfile) => void;
}
