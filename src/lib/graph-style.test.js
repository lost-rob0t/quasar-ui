import cytoscape from "cytoscape";
import { describe, expect, it } from "vitest";
import { documentTypeIcon } from "./graph-icons";
import { GRAPH_STYLE } from "./graph-style";

describe("Cytoscape graph styling", () => {
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

  it("assigns centered SVG icons to document type nodes", () => {
    const baseNodeRule = GRAPH_STYLE.find((rule) => rule.selector === "node");
    const personRule = GRAPH_STYLE.find((rule) => rule.selector === "node[dtype = 'person']");
    const researchSizingRule = GRAPH_STYLE.find(
      (rule) =>
        rule.selector === "node[dtype = 'research-node']" && rule.style["background-width"] === 24
    );

    expect(baseNodeRule?.style).toMatchObject({
      "background-image": documentTypeIcon("document"),
      "background-width": 20,
      "background-height": 20,
      "background-repeat": "no-repeat"
    });
    expect(personRule?.style["background-image"]).toBe(documentTypeIcon("person"));
    expect(researchSizingRule?.style).toMatchObject({
      "background-width": 24,
      "background-height": 24
    });
  });
});
