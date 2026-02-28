/**
 * Burns CPU for a large number of iterations.
 * Defined in a real file so the V8 profiler sees file:// URLs.
 */
export function burnCpu(iterations: number = 10_000_000): void {
  let x = 0;
  for (let i = 0; i < iterations; i++) {
    x += Math.sqrt(i);
  }
  // Prevent dead code elimination
  if (x < 0) throw new Error('unreachable');
}
