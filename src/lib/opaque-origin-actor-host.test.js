import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveActorConfiguration } from "./actor-configuration";
import { actorConfigurationForExecution } from "./opaque-origin-actor-host";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

let previousStorage;

beforeEach(() => {
  previousStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: previousStorage
  });
});

describe("browser actor host configuration", () => {
  it("loads actor-local configuration without service-specific mutation", () => {
    const actor = { id: "quasar.actor.runtime-test" };
    saveActorConfiguration(actor, {
      endpoint: "https://example.test/api",
      mode: "test"
    });

    expect(actorConfigurationForExecution(actor)).toEqual({
      endpoint: "https://example.test/api",
      mode: "test"
    });
  });

  it("does not invent configuration for an unconfigured actor", () => {
    expect(actorConfigurationForExecution({ id: "quasar.actor.unconfigured" })).toEqual({});
  });
});
