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
