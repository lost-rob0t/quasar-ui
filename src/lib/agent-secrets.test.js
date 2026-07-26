import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteProviderSecret,
  getProviderSecret,
  hasProviderSecret,
  setProviderSecret
} from "./agent-secrets";

function memoryStorage() {
  const values = new Map();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.has(key) ? values.get(key) : null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  };
}

describe("agent secrets", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: memoryStorage()
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: memoryStorage()
    });
  });

  it("persists provider keys in local storage", () => {
    setProviderSecret("openrouter", "secret-value");

    expect(localStorage.getItem("quasar:provider-secret:openrouter")).toBe("secret-value");
    expect(sessionStorage.getItem("quasar:provider-secret:openrouter")).toBeNull();
    expect(getProviderSecret("openrouter")).toBe("secret-value");
    expect(hasProviderSecret("openrouter")).toBe(true);
  });

  it("migrates keys from the old session storage", () => {
    sessionStorage.setItem("quasar:provider-secret:openai", "legacy-key");

    expect(getProviderSecret("openai")).toBe("legacy-key");
    expect(localStorage.getItem("quasar:provider-secret:openai")).toBe("legacy-key");
    expect(sessionStorage.getItem("quasar:provider-secret:openai")).toBeNull();
  });

  it("deletes keys from both stores", () => {
    localStorage.setItem("quasar:provider-secret:anthropic", "local-key");
    sessionStorage.setItem("quasar:provider-secret:anthropic", "session-key");

    deleteProviderSecret("anthropic");

    expect(hasProviderSecret("anthropic")).toBe(false);
    expect(localStorage.getItem("quasar:provider-secret:anthropic")).toBeNull();
    expect(sessionStorage.getItem("quasar:provider-secret:anthropic")).toBeNull();
  });
});
