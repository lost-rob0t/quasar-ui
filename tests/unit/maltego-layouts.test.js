import cytoscape from "cytoscape";
import { describe, expect, it } from "vitest";
import {
  MALTEGO_LAYOUTS,
  maltegoLayoutOptions,
  normalizeMaltegoLayout,
  installMaltegoLayouts
} from "../../src/graph/maltego-layouts";

function createGraph() {
  return cytoscape({
    headless: true,
    styleEnabled: false,
    elements: [
      { data: { id: "root", dtype: "person", label: "Root", document: { weight: 8 } } },
      { data: { id: "org", dtype: "org", label: "Org", document: { weight: 5 } } },
      { data: { id: "event", dtype: "event", label: "Event", document: { weight: 2 } } },
      { data: { id: "leaf", dtype: "entity", label: "Leaf", document: { weight: 1 } } },
      { data: { id: "root-org", source: "root", target: "org", directed: true } },
      { data: { id: "root-event", source: "root", target: "event", directed: true } },
      { data: { id: "org-leaf", source: "org", target: "leaf", directed: true } }
    ]
  });
}

describe("Maltego graph layouts", () => {
  it("exposes the complete Maltego layout set", () => {
    expect(MALTEGO_LAYOUTS.map(({ id }) => id)).toEqual([
      "block",
      "hierarchical",
      "circular",
      "organic",
      "interactive-organic",
      "orthogonal"
    ]);
  });

  it("migrates legacy Cytoscape workspace layouts", () => {
    expect(normalizeMaltegoLayout("cose")).toBe("organic");
    expect(normalizeMaltegoLayout("breadthfirst")).toBe("hierarchical");
    expect(normalizeMaltegoLayout("concentric")).toBe("circular");
    expect(normalizeMaltegoLayout("grid")).toBe("orthogonal");
  });

  it("preserves bounded force-layout iteration options", () => {
    const cy = createGraph();
    expect(maltegoLayoutOptions(cy, { name: "interactive-organic", numIter: 125 })).toMatchObject({
      name: "cose",
      randomize: false,
      numIter: 125
    });
    cy.destroy();
  });

  it.each(MALTEGO_LAYOUTS)("runs $label without invalid positions", ({ id }) => {
    const cy = installMaltegoLayouts(createGraph());
    expect(() => cy.layout({ name: id, animate: false, fit: false }).run()).not.toThrow();

    cy.nodes().forEach((node) => {
      expect(Number.isFinite(node.position("x"))).toBe(true);
      expect(Number.isFinite(node.position("y"))).toBe(true);
    });

    cy.destroy();
  });
});
