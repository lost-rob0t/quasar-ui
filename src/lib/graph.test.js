import { describe, expect, it } from "vitest";
import { buildGraph, findPaths, graphStatistics } from "./graph";

const stamp = "2026-07-25T20:00:00.000Z";
const base = (id, dtype, data) => ({
  _id: id,
  dataset: "test",
  dtype,
  schema_version: "0.9.0",
  version: 1,
  date_added: stamp,
  date_updated: stamp,
  title: id,
  sources: [],
  evidence: [],
  data
});

const documents = [
  base("starintel:person:a", "person", { full_name: "A" }),
  base("starintel:org:b", "org", { name: "B" }),
  base("starintel:org:c", "org", { name: "C" }),
  base("starintel:relation:a-b", "relation", { subject: "starintel:person:a", predicate: "founded", object: "starintel:org:b", confidence: 0.9 }),
  base("starintel:relation:b-c", "relation", { subject: "starintel:org:b", predicate: "owns", object: "starintel:org:c", confidence: 0.8 })
];

describe("StarIntel graph projection", () => {
  it("projects entity documents to nodes and relations to edges", () => {
    const graph = buildGraph(documents);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0].data.predicate).toBe("founded");
  });

  it("retains unresolved relation endpoints", () => {
    const graph = buildGraph([...documents, base("starintel:relation:missing", "relation", {
      subject: "starintel:org:c",
      predicate: "mentions",
      object: "starintel:entity:missing"
    })]);
    expect(graph.nodes.find((node) => node.data.id === "starintel:entity:missing")?.data.unresolved).toBe(true);
  });

  it("finds ranked connection paths", () => {
    const graph = buildGraph(documents);
    const paths = findPaths(graph, "starintel:person:a", "starintel:org:c");
    expect(paths[0].nodes).toEqual(["starintel:person:a", "starintel:org:b", "starintel:org:c"]);
    expect(paths[0].edges).toHaveLength(2);
  });

  it("computes corpus statistics", () => {
    const stats = graphStatistics(documents);
    expect(stats.documents).toBe(5);
    expect(stats.relations).toBe(2);
    expect(stats.topConnected[0].id).toBe("starintel:org:b");
  });
});
