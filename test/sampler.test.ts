import { afterEach, describe, expect, it, vi } from "vitest";
import { unlinkSync } from "node:fs";
import { _getStore, clear, report, track } from "../src/sampler.js";
import { burnCpu } from "./fixtures/cpu-work.js";

const generatedFiles: string[] = [];

afterEach(async () => {
  await clear();
  vi.restoreAllMocks();

  // Clean up any HTML files generated during tests
  for (const f of generatedFiles) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }
  generatedFiles.length = 0;
});

describe("sampler", () => {
  describe("SMPL-01: track() starts profiler that captures samples", () => {
    it("produces real samples for synchronous CPU work", async () => {
      await track();
      burnCpu(10_000_000);
      const filepath = await report();

      // report() returns a non-empty filepath when samples were collected
      expect(typeof filepath).toBe("string");
      expect(filepath.length).toBeGreaterThan(0);
      expect(filepath).toContain("where-you-at-");
      generatedFiles.push(filepath);
    });
  });

  describe("SMPL-02: track() when already profiling is a safe no-op", () => {
    it("does not throw on double track()", async () => {
      await track();
      await expect(track()).resolves.toBeUndefined();
      const filepath = await report();
      if (filepath) generatedFiles.push(filepath);
    });
  });

  describe("SMPL-03: clear() stops profiler and resets sample data", () => {
    it("resets SampleStore after clear()", async () => {
      await track();
      burnCpu(5_000_000);
      await clear();

      expect(_getStore().packages.size).toBe(0);
      expect(_getStore().internal).toBe(0);
    });
  });

  describe("SMPL-04: report() attributes samples to correct package", () => {
    it("attributes burnCpu samples to where-you-at (first-party)", async () => {
      const recordSpy = vi.spyOn(_getStore(), "record");

      await track();
      burnCpu(10_000_000);
      const filepath = await report();
      if (filepath) generatedFiles.push(filepath);

      // recordSpy captured every store.record(pkg, file, fn, deltaUs) call made by processProfile()
      // Even though report() calls store.clear(), the spy retains call history
      const packageNames = recordSpy.mock.calls.map(([pkg]) => pkg);
      expect(packageNames).toContain("where-you-at");

      // Verify record receives 4 arguments (pkg, file, fn, deltaUs)
      const firstCall = recordSpy.mock.calls[0]!;
      expect(firstCall).toHaveLength(4);
      expect(typeof firstCall[3]).toBe("number"); // deltaUs is a number
    });
  });

  describe("edge cases", () => {
    it('report() with no profiling returns empty string and prints message', async () => {
      const spy = vi.spyOn(console, "log");

      const result = await report();

      expect(result).toBe("");
      expect(spy).toHaveBeenCalledWith("no samples collected");
    });

    it("clear() with no profiling is safe", async () => {
      await expect(clear()).resolves.toBeUndefined();
    });
  });
});
