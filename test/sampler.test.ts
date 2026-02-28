import { afterEach, describe, expect, it, vi } from "vitest";
import { _getStore, clear, report, track } from "../src/sampler.js";
import { burnCpu } from "./fixtures/cpu-work.js";

afterEach(async () => {
  await clear();
  vi.restoreAllMocks();
});

describe("sampler", () => {
  describe("SMPL-01: track() starts profiler that captures samples", () => {
    it("produces real samples for synchronous CPU work", async () => {
      const spy = vi.spyOn(console, "log");

      await track();
      burnCpu(10_000_000);
      await report();

      // report() should NOT have printed "no samples collected"
      const calls = spy.mock.calls.flat();
      expect(calls).not.toContain("no samples collected");
    });
  });

  describe("SMPL-02: track() when already profiling is a safe no-op", () => {
    it("does not throw on double track()", async () => {
      await track();
      await expect(track()).resolves.toBeUndefined();
      await report();
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
      await report();

      // recordSpy captured every store.record(pkg, file, fn) call made by processProfile()
      // Even though report() calls store.clear(), the spy retains call history
      const packageNames = recordSpy.mock.calls.map(([pkg]) => pkg);
      expect(packageNames).toContain("where-you-at");
    });
  });

  describe("edge cases", () => {
    it('report() with no profiling prints "no samples collected"', async () => {
      const spy = vi.spyOn(console, "log");

      await report();

      expect(spy).toHaveBeenCalledWith("no samples collected");
    });

    it("clear() with no profiling is safe", async () => {
      await expect(clear()).resolves.toBeUndefined();
    });
  });
});
