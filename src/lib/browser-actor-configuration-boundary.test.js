import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("browser actor configuration boundary", () => {
  it("does not synthesize or persist actor configuration in browser execution paths", () => {
    const host = source("./opaque-origin-actor-host.js");
    const transforms = source("./actor-transforms.js");
    const main = source("../app/main.tsx");

    for (const text of [host, transforms]) {
      expect(text).not.toContain("actor-configuration");
      expect(text).not.toContain("context.configuration");
      expect(text).not.toContain("configuredContext");
      expect(text).not.toContain("loadActorConfiguration");
      expect(text).not.toContain("saveActorConfiguration");
    }

    expect(main).not.toContain("ActorConfigurationBridge");
    expect(main).not.toContain("actor-configuration.css");
  });
});
