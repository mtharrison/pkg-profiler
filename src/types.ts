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
}

export interface FunctionEntry extends ReportEntry {}

export interface FileEntry extends ReportEntry {
  functions: FunctionEntry[];
  otherCount: number;
}

export interface PackageEntry extends ReportEntry {
  isFirstParty: boolean;
  files: FileEntry[];
  otherCount: number;
}

export interface ReportData {
  timestamp: string;
  totalTimeUs: number;
  packages: PackageEntry[];
  otherCount: number;
}
