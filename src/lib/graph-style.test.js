import cytoscape from "cytoscape";
import { describe, expect, it } from "vitest";
import { GRAPH_STYLE } from "./graph-style";

describe("Cytoscape graph edge styling", () => {
  it("shows arrows only for directed edges", () => {
    const graph = cytoscape({
      headless: true,
      styleEnabled: true,
      style: GRAPH_STYLE,
      elements: [
        { data: { id: "source" } },
        { data: { id: "target" } },
        { data: { id: "directed", source: "source", target: "target", directed: true } },
        { data: { id: "undirected", source: "target", target: "source", directed: false } }
      ]
    });

    expect(graph.getElementById("directed").pstyle("target-arrow-shape").value).toBe("triangle");
    expect(graph.getElementById("undirected").pstyle("target-arrow-shape").value).toBe("none");
    graph.destroy();
  });

  it("uses cheaper deterministic styles while interacting", () => {
    const graph = cytoscape({
      headless: true,
      styleEnabled: true,
      style: GRAPH_STYLE,
      elements: [
        { data: { id: "source", label: "Source" } },
        { data: { id: "target", label: "Target" } },
        { data: { id: "edge", source: "source", target: "target", directed: true, label: "linked" } }
      ]
    });
    const edge = graph.getElementById("edge");
    edge.addClass("interaction-detail");

    expect(edge.pstyle("curve-style").value).toBe("straight");
    expect(edge.pstyle("target-arrow-shape").value).toBe("none");
    expect(edge.pstyle("label").strValue).toBe("");
    graph.destroy();
  });

  it("restores labels for selected elements at low zoom", () => {
    const graph = cytoscape({
      headless: true,
      styleEnabled: true,
      style: GRAPH_STYLE,
      elements: [{ data: { id: "node", label: "Visible" }, selected: true }]
    });
    const node = graph.getElementById("node");
    node.addClass("zoom-labels-hidden");
    node.select();

    expect(node.pstyle("label").strValue).toBe("Visible");
    graph.destroy();
  });
});
