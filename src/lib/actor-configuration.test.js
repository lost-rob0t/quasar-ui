import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_CONFIGURATION_STORAGE_KEY,
  actorConfigurationStatus,
  clearActorConfiguration,
  loadActorConfiguration,
  saveActorConfiguration
} from "./actor-configuration";

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

describe("actor configuration", () => {
  it("stores arbitrary browser actor JSON by actor id", () => {
    const actor = { id: "quasar.actor.custom", label: "Custom" };
    saveActorConfiguration(actor, { endpoint: "https://example.test", retries: 3 });

    expect(loadActorConfiguration(actor)).toEqual({
      endpoint: "https://example.test",
      retries: 3
    });
    expect(localStorage.getItem(ACTOR_CONFIGURATION_STORAGE_KEY)).toContain("quasar.actor.custom");

    clearActorConfiguration(actor);
    expect(loadActorConfiguration(actor)).toEqual({});
  });

  it("keeps configuration isolated per browser actor", () => {
    const first = { id: "quasar.actor.first" };
    const second = { id: "quasar.actor.second" };
    saveActorConfiguration(first, { token: "FIRST" });

    expect(loadActorConfiguration(first)).toEqual({ token: "FIRST" });
    expect(loadActorConfiguration(second)).toEqual({});
  });

  it("reports generic actor configuration as available", () => {
    expect(actorConfigurationStatus({ id: "quasar.actor.custom" })).toMatchObject({
      configured: true,
      missing: []
    });
  });
});
