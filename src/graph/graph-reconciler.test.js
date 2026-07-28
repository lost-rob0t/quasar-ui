import { createGraphAdapter } from "./GraphAdapter";
import { describe, expect, it } from "vitest";
import { diffGraphElements, reconcileGraphElements } from "./graph-reconciler";

function graph(nodes, edges = []) {
  return {
    nodes: nodes.map((node) => ({ group: "nodes", ...node })),
    edges: edges.map((edge) => ({ group: "edges", ...edge })),
    elements: [...nodes, ...edges]
  };
}

function createCy(elements = []) {
  return createGraphAdapter({ headless: true, styleEnabled: false, elements, layout: { name: "preset" } });
}

describe("graph differential reconciliation", () => {
  it("adds nodes before their edges", () => {
    const cy = createCy();
    const result = reconcileGraphElements(cy, graph(
      [{ data: { id: "a", label: "A" } }, { data: { id: "b", label: "B" } }],
      [{ data: { id: "a-b", source: "a", target: "b", label: "knows" } }]
    ));

    expect(result.added).toBe(3);
    expect(cy.getElementById("a-b").source().id()).toBe("a");
    cy.destroy();
  });

  it("updates changed fields without replacing unchanged elements", () => {
    const cy = createCy([{ data: { id: "a", label: "A", dataset: "one" }, position: { x: 10, y: 20 } }]);
    const original = cy.getElementById("a");
    const result = reconcileGraphElements(cy, graph([
      { data: { id: "a", label: "Updated", dataset: "one" } }
    ]));

    expect(result.updated).toBe(1);
    expect(cy.getElementById("a")).toBe(original);
    expect(original.data("label")).toBe("Updated");
    expect(original.position()).toMatchObject({ x: 10, y: 20 });
    cy.destroy();
  });

  it("removes obsolete edges before obsolete nodes", () => {
    const cy = createCy([
      { data: { id: "a" } },
      { data: { id: "b" } },
      { data: { id: "a-b", source: "a", target: "b" } }
    ]);
    const result = reconcileGraphElements(cy, graph([{ data: { id: "a" } }]));

    expect(result.removed).toBe(2);
    expect(cy.elements()).toHaveLength(1);
    expect(cy.getElementById("a")).toHaveLength(1);
    cy.destroy();
  });

  it("preserves positions, selection, and viewport for unchanged nodes", () => {
    const cy = createCy([
      { data: { id: "a", label: "A" }, position: { x: 30, y: 40 }, selected: true },
      { data: { id: "b", label: "B" }, position: { x: 80, y: 90 } }
    ]);
    cy.pan({ x: 17, y: 23 });
    cy.zoom(1.7);
    cy.getElementById("a").select();

    reconcileGraphElements(cy, graph([
      { data: { id: "a", label: "A" } },
      { data: { id: "b", label: "B2" } }
    ]));

    expect(cy.getElementById("a").position()).toMatchObject({ x: 30, y: 40 });
    expect(cy.getElementById("a").selected()).toBe(true);
    expect(cy.pan()).toEqual({ x: 17, y: 23 });
    expect(cy.zoom()).toBeCloseTo(1.7);
    cy.destroy();
  });

  it("restores filtered node positions and selection", () => {
    const cy = createCy([
      { data: { id: "a", label: "A" }, position: { x: 45, y: 55 } },
      { data: { id: "b", label: "B" }, position: { x: 90, y: 100 } }
    ]);
    const retainedNodes = new Map();
    cy.getElementById("b").select();

    reconcileGraphElements(cy, graph([{ data: { id: "a", label: "A" } }]), { retainedNodes });
    reconcileGraphElements(cy, graph([
      { data: { id: "a", label: "A" } },
      { data: { id: "b", label: "B" } }
    ]), { retainedNodes });

    expect(cy.getElementById("b").position()).toMatchObject({ x: 90, y: 100 });
    expect(cy.getElementById("b").selected()).toBe(true);
    cy.destroy();
  });

  it("does not update unchanged document payloads with the same revision", () => {
    const cy = createCy([{ data: { id: "a", document: { _id: "a", _rev: "1-a" } } }]);
    const diff = diffGraphElements(cy, graph([
      { data: { id: "a", document: { _id: "a", _rev: "1-a" } } }
    ]));

    expect(diff.nodesToUpdate).toHaveLength(0);
    cy.destroy();
  });

  it("replaces an edge when its endpoints change", () => {
    const cy = createCy([
      { data: { id: "a" } },
      { data: { id: "b" } },
      { data: { id: "c" } },
      { data: { id: "edge", source: "a", target: "b" } }
    ]);
    const before = cy.getElementById("edge");
    reconcileGraphElements(cy, graph(
      [{ data: { id: "a" } }, { data: { id: "b" } }, { data: { id: "c" } }],
      [{ data: { id: "edge", source: "a", target: "c" } }]
    ));

    expect(cy.getElementById("edge")).not.toBe(before);
    expect(cy.getElementById("edge").target().id()).toBe("c");
    cy.destroy();
  });

  it("reports an empty diff for identical references", () => {
    const element = { group: "nodes", data: { id: "a", label: "A" } };
    const cy = createCy([element]);
    const diff = diffGraphElements(cy, { nodes: [element], edges: [] });
    expect(diff.nodesToAdd).toHaveLength(0);
    expect(diff.nodesToUpdate).toHaveLength(0);
    expect(diff.nodesToRemove).toHaveLength(0);
    cy.destroy();
  });
});
