import { describe, expect, it } from "vitest";
import {
  GRAPH_PERFORMANCE_SHAPES,
  GRAPH_PERFORMANCE_SIZES,
  generateGraphPerformanceFixture
} from "./graph-performance-fixtures";

describe("graph performance fixtures", () => {
  it("generates deterministic fixtures", () => {
    const left = generateGraphPerformanceFixture({ nodes: 30, edges: 60, shape: "mixed", seed: 42 });
    const right = generateGraphPerformanceFixture({ nodes: 30, edges: 60, shape: "mixed", seed: 42 });
    expect(left).toEqual(right);
  });

  it.each(GRAPH_PERFORMANCE_SHAPES)("generates %s graphs with requested counts", (shape) => {
    const fixture = generateGraphPerformanceFixture({ nodes: 50, edges: 100, shape, seed: 7 });
    expect(fixture.documents.filter((document) => document.dtype !== "relation")).toHaveLength(50);
    expect(fixture.documents.filter((document) => document.dtype === "relation")).toHaveLength(100);
  });

  it("defines the required benchmark sizes", () => {
    expect(GRAPH_PERFORMANCE_SIZES).toMatchObject({
      small: { nodes: 250, edges: 500 },
      medium: { nodes: 1_000, edges: 2_000 },
      large: { nodes: 5_000, edges: 10_000 },
      "very-large": { nodes: 10_000, edges: 25_000 },
      stress: { nodes: 25_000, edges: 50_000 }
    });
  });
});
