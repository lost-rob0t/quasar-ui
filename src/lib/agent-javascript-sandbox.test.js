import { describe, expect, it } from "vitest";
import {
  JAVASCRIPT_SANDBOX_LIMITS,
  assertSerializable,
  createSandboxSource
} from "./agent-javascript-sandbox";

describe("agent JavaScript sandbox", () => {
  it("builds a disposable worker runtime with dangerous ambient APIs blocked", () => {
    const source = createSandboxSource();
    for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"]) {
      expect(source).toContain(`\"${name}\"`);
    }
    expect(source).toContain('new AsyncFunction("console", "readInput", "result", "tools", "window", "document"');
    expect(source).not.toContain("application globals");
  });

  it("rejects cyclic, executable, and oversized host values", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(() => assertSerializable(cyclic)).toThrow("Cyclic");
    expect(() => assertSerializable({ callback() {} })).toThrow("Unsupported result type");
    expect(() => assertSerializable("x".repeat(20), { maxBytes: 4 })).toThrow("exceeds");
  });

  it("ships bounded defaults", () => {
    expect(JAVASCRIPT_SANDBOX_LIMITS.timeoutMs).toBe(5000);
    expect(JAVASCRIPT_SANDBOX_LIMITS.maxNestedCalls).toBeLessThanOrEqual(20);
    expect(JAVASCRIPT_SANDBOX_LIMITS.maxNestedDepth).toBeLessThanOrEqual(4);
    expect(JAVASCRIPT_SANDBOX_LIMITS.maxOutputBytes).toBeGreaterThan(0);
  });
});
