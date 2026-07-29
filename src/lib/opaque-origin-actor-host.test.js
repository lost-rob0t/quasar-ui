import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveMelissaConfig } from "./melissa-browser-config";
import { runBrowserActor } from "./opaque-origin-actor-host";

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

let previousFetch;
let previousStorage;

beforeEach(() => {
  previousFetch = globalThis.fetch;
  previousStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  });
});

afterEach(() => {
  globalThis.fetch = previousFetch;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: previousStorage
  });
});

describe("browser actor host configuration", () => {
  it("passes Melissa configuration to the actor and injects the exact credit key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ TransmissionResults: "US01", Records: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    );
    globalThis.fetch = fetchMock;
    saveMelissaConfig({
      licenseKey: "License Key Using Credits: CR+ED/IT==",
      transmissionReference: "Quasar credit test"
    });

    const result = await runBrowserActor(
      {
        id: "quasar.actor.melissa-runtime-test",
        label: "Melissa runtime test",
        version: 1,
        capabilities: ["network.fetch"],
        source: `async (context, api) => {
          const response = await api.network.fetch({
            url: "https://personatorsearch.melissadata.net/WEB/doPersonatorSearch?last=Porter&format=JSON",
            responseType: "json"
          });
          return {
            documents: [],
            message: context.configuration.transmissionReference + ":" + response.status
          };
        }`
      },
      { selection: [], documents: [] },
      { trusted: true }
    );

    const requested = String(fetchMock.mock.calls[0][0]);
    const url = new URL(requested);
    expect(url.searchParams.get("id")).toBe("CR+ED/IT==");
    expect(requested).toContain("id=CR%2BED%2FIT%3D%3D");
    expect(result.message).toBe("Quasar credit test:200");
  });
});
