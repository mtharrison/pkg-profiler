import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { _getStore, clear, start, stop, profile } from "../src/sampler.js";
import { PkgProfile } from "../src/pkg-profile.js";
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
  describe("SMPL-01: start() starts profiler that captures samples", () => {
    it("produces real samples for synchronous CPU work", async () => {
      await start();
      burnCpu(10_000_000);
      const result = await stop();

      expect(result).toBeInstanceOf(PkgProfile);
      expect(result.totalTimeUs).toBeGreaterThan(0);
      expect(result.packages.length).toBeGreaterThan(0);
    });
  });

  describe("SMPL-02: start() when already profiling is a safe no-op", () => {
    it("does not throw on double start()", async () => {
      await start();
      await expect(start()).resolves.toBeUndefined();
      await stop();
    });
  });

  describe("SMPL-03: clear() stops profiler and resets sample data", () => {
    it("resets SampleStore after clear()", async () => {
      await start();
      burnCpu(5_000_000);
      await clear();

      expect(_getStore().packages.size).toBe(0);
      expect(_getStore().internal).toBe(0);
    });
  });

  describe("SMPL-04: stop() attributes samples to correct package", () => {
    it("attributes burnCpu samples to @mtharrison/pkg-profiler (first-party)", async () => {
      const recordSpy = vi.spyOn(_getStore(), "record");

      await start();
      burnCpu(10_000_000);
      await stop();

      // recordSpy captured every store.record(pkg, file, fn, deltaUs) call made by processProfile()
      // Even though stop() calls store.clear(), the spy retains call history
      const packageNames = recordSpy.mock.calls.map(([pkg]) => pkg);
      expect(packageNames).toContain("@mtharrison/pkg-profiler");

      // Verify record receives 4 arguments (pkg, file, fn, deltaUs)
      const firstCall = recordSpy.mock.calls[0]!;
      expect(firstCall).toHaveLength(4);
      expect(typeof firstCall[3]).toBe("number"); // deltaUs is a number
    });
  });

  describe("PkgProfile", () => {
    it("writeHtml() writes an HTML file and returns the path", async () => {
      await start();
      burnCpu(10_000_000);
      const result = await stop();

      const filepath = result.writeHtml();
      generatedFiles.push(filepath);

      expect(filepath).toContain("where-you-at-");
      expect(existsSync(filepath)).toBe(true);
    });

    it("writeHtml(path) writes to the specified path", async () => {
      await start();
      burnCpu(10_000_000);
      const result = await stop();

      const filepath = result.writeHtml("./test-output.html");
      generatedFiles.push(filepath);

      expect(existsSync(filepath)).toBe(true);
    });

    it("exposes readonly profiling data", async () => {
      await start();
      burnCpu(10_000_000);
      const result = await stop();

      expect(typeof result.timestamp).toBe("string");
      expect(typeof result.totalTimeUs).toBe("number");
      expect(typeof result.projectName).toBe("string");
      expect(Array.isArray(result.packages)).toBe(true);
      expect(typeof result.otherCount).toBe("number");
    });
  });

  describe("profile()", () => {
    it("profiles a function and returns PkgProfile", async () => {
      const result = await profile(() => {
        burnCpu(10_000_000);
      });

      expect(result).toBeInstanceOf(PkgProfile);
      expect(result.totalTimeUs).toBeGreaterThan(0);
    });

    it("profiles an async function and returns PkgProfile", async () => {
      const result = await profile(async () => {
        burnCpu(5_000_000);
        await Promise.resolve();
      });

      expect(result).toBeInstanceOf(PkgProfile);
      expect(result.totalTimeUs).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("stop() with no profiling returns empty PkgProfile", async () => {
      const result = await stop();

      expect(result).toBeInstanceOf(PkgProfile);
      expect(result.totalTimeUs).toBe(0);
      expect(result.packages).toEqual([]);
    });

    it("clear() with no profiling is safe", async () => {
      await expect(clear()).resolves.toBeUndefined();
    });
  });
});
