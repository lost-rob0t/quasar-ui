import { describe, expect, it } from "vitest";
import {
  actorTouchedDocumentIds,
  linkedDocumentIds,
  mergeTransformationDocuments,
  transformationBatches,
  transformationCandidates
} from "./run-all-transformations";

function actor(overrides = {}) {
  return {
    id: "actor.test",
    label: "Test actor",
    version: 1,
    accepts: ["entity"],
    minSelection: 1,
    maxSelection: 2,
    source: "() => ({ documents: [] })",
    ...overrides
  };
}

function entity(id, extension = null) {
  return {
    _id: id,
    dtype: "entity",
    extensions: extension ? { "quasar.actor": extension } : {}
  };
}

function relation(id, subject, object) {
  return {
    _id: id,
    dtype: "relation",
    data: { subject, object, predicate: "related-to" }
  };
}

describe("run-all transformation planning", () => {
  it("collects relation endpoints as linked documents", () => {
    expect([...linkedDocumentIds([
      relation("r1", "a", "b"),
      { _id: "r2", dtype: "relation", data: { source: "b", target: "c" } }
    ])].sort()).toEqual(["a", "b", "c"]);
  });

  it("treats actor outputs and their inputs as already touched", () => {
    const touched = actorTouchedDocumentIds([
      entity("output", { actor_id: "actor.test", input_ids: ["input"] }),
      entity("other", { actor_id: "actor.other", input_ids: ["ignored"] })
    ], "actor.test");

    expect([...touched].sort()).toEqual(["input", "output"]);
  });

  it("runs inputs with no links or no prior actor run", () => {
    const documents = [
      entity("unlinked-ran", { actor_id: "actor.test", input_ids: ["unlinked-ran"] }),
      entity("linked-new"),
      entity("linked-ran", { actor_id: "actor.test", input_ids: ["linked-ran"] }),
      relation("r1", "linked-new", "anchor"),
      relation("r2", "linked-ran", "anchor")
    ];

    expect(transformationCandidates(actor(), documents, documents).map((document) => document._id))
      .toEqual(["unlinked-ran", "linked-new"]);
  });

  it("rejects relation documents and unsupported dtypes", () => {
    const documents = [
      entity("accepted"),
      { _id: "person", dtype: "person" },
      relation("relation", "accepted", "person")
    ];

    expect(transformationCandidates(actor(), documents, documents).map((document) => document._id))
      .toEqual(["accepted"]);
  });

  it("batches candidates by actor limits and drops an undersized tail", () => {
    const candidates = [entity("a"), entity("b"), entity("c"), entity("d"), entity("e")];
    const batches = transformationBatches(actor({ minSelection: 2, maxSelection: 2 }), candidates);

    expect(batches.map((batch) => batch.map((document) => document._id)))
      .toEqual([["a", "b"], ["c", "d"]]);
  });

  it("merges actor outputs into the corpus for later transformations", () => {
    const merged = mergeTransformationDocuments(
      [entity("a"), entity("replace")],
      [entity("b"), { ...entity("replace"), title: "updated" }]
    );

    expect(merged.map((document) => document._id).sort()).toEqual(["a", "b", "replace"]);
    expect(merged.find((document) => document._id === "replace")?.title).toBe("updated");
  });
});
