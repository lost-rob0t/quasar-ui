import { assertDocument } from "starintel_doc";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_ACTORS,
  actorApplicability,
  generateUsernameCandidatesActor,
  isBuiltinActor,
  normalizeActorManifest,
  prepareWhatsMyNameSearchesActor
} from "./actors";

const stamp = "2026-07-26T00:00:00.000Z";
const person = {
  _id: "starintel:person:jane-q-doe",
  dataset: "test",
  dtype: "person",
  schema_version: "0.9.0",
  version: 1,
  date_added: stamp,
  date_updated: stamp,
  title: "Jane Q. Doe",
  sources: [],
  evidence: [],
  data: {
    fname: "Jane",
    mname: "Q",
    lname: "Doe",
    external_ids: [{ scheme: "username", value: "@jqdoe" }]
  }
};

describe("actor manifests", () => {
  it("requires an ID and bounded selection contract", () => {
    expect(() => normalizeActorManifest({ label: "Missing", source: "() => ({ documents: [] })" }))
      .toThrow("Actor id is required");
    expect(() => normalizeActorManifest({
      id: "test.actor",
      source: "() => ({ documents: [] })",
      minSelection: 4,
      maxSelection: 2
    })).toThrow("Actor maxSelection");
  });

  it("explains selection and dtype applicability", () => {
    const actor = {
      id: "test.actor",
      label: "Test",
      version: 1,
      accepts: ["person"],
      minSelection: 1,
      maxSelection: 1,
      source: "() => ({ documents: [] })"
    };

    expect(actorApplicability(actor, [])).toEqual({
      applicable: false,
      reason: "Select a graph document."
    });
    expect(actorApplicability(actor, [{ ...person, dtype: "org" }])).toEqual({
      applicable: false,
      reason: "Does not accept org documents."
    });
    expect(actorApplicability(actor, [person])).toEqual({ applicable: true, reason: "" });
  });

  it("recognizes bundled actors by both identity and source", () => {
    expect(BUILTIN_ACTORS.every(isBuiltinActor)).toBe(true);
    expect(isBuiltinActor({ ...BUILTIN_ACTORS[0], source: "() => ({ documents: [] })" })).toBe(false);
  });

  it("ships executable worker function sources", () => {
    for (const actor of BUILTIN_ACTORS) {
      const implementation = Function(`"use strict"; return (${actor.source});`)();
      expect(implementation).toBeTypeOf("function");
    }
  });
});

describe("username actors", () => {
  it("generates canonical username candidates and relations from a person name", () => {
    const result = generateUsernameCandidatesActor({ selection: [person] });
    const candidates = result.documents.filter((document) => document.dtype === "entity");

    expect(candidates.map((document) => document.data.name)).toEqual(expect.arrayContaining([
      "jqdoe",
      "janedoe",
      "jane.doe",
      "jdoe"
    ]));
    expect(result.documents).toHaveLength(candidates.length * 2);
    result.documents.forEach((document) => expect(() => assertDocument(document)).not.toThrow());
  });

  it("prepares bounded WhatsMyName enumeration links from names and identifiers", () => {
    const result = prepareWhatsMyNameSearchesActor({ selection: [person] });
    const searches = result.documents.filter((document) => document.dtype === "entity");
    const jqdoe = searches.find((document) => document.data.external_ids[0].value === "jqdoe");

    expect(jqdoe.data.website).toBe("https://whatsmyname.app/?q=jqdoe");
    expect(searches).toHaveLength(11);
    expect(result.documents).toHaveLength(22);
    result.documents.forEach((document) => expect(() => assertDocument(document)).not.toThrow());
  });

  it("caps work for oversized selections", () => {
    const selection = Array.from({ length: 40 }, (_, index) => ({
      ...person,
      _id: `${person._id}:${index}`
    }));
    const candidates = generateUsernameCandidatesActor({ selection });
    const searches = prepareWhatsMyNameSearchesActor({ selection });

    expect(candidates.documents.length).toBeLessThanOrEqual(8 * 16 * 2);
    expect(searches.documents.length).toBeLessThanOrEqual(16 * 16 * 2);
    expect(candidates.message).toContain("first 8 selected documents");
    expect(searches.message).toContain("first 16 selected documents");
  });
});
