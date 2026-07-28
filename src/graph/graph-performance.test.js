import { describe, expect, it } from "vitest";
import {
  detailClasses,
  graphDetailLevel,
  rendererOptionsForGraph,
  runExclusiveGraphLayout,
  shouldRunInitialLayout,
  sizeAwareLayoutOptions,
  stopActiveGraphLayout
} from "./graph-performance";

describe("large graph performance policy", () => {
  it("uses deterministic detail thresholds", () => {
    expect(graphDetailLevel(4_999, 9_999)).toBe("full");
    expect(graphDetailLevel(5_000, 10_000)).toBe("reduced");
    expect(graphDetailLevel(10_000, 25_000)).toBe("minimal");
  });

  it("reduces renderer cost only for large graphs", () => {
    expect(rendererOptionsForGraph(250, 500)).toMatchObject({ hideEdgesOnViewport: false, textureOnViewport: false });
    expect(rendererOptionsForGraph(10_000, 25_000)).toMatchObject({ pixelRatio: 1, hideEdgesOnViewport: true, textureOnViewport: true });
  });

  it("disables animation and bounds force layouts by graph size", () => {
    expect(sizeAwareLayoutOptions("organic", 1_000, { animate: true }).animate).toBe(true);
    expect(sizeAwareLayoutOptions("organic", 2_000, { animate: true }).animate).toBe(false);
    expect(sizeAwareLayoutOptions("organic", 5_000, { animate: true })).toMatchObject({ name: "orthogonal", animate: false });
  });

  it("runs an initial layout only without saved positions", () => {
    expect(shouldRunInitialLayout({ nodeCount: 10, hasAnySavedPosition: false, graphChanged: true })).toBe(true);
    expect(shouldRunInitialLayout({ nodeCount: 10, hasAnySavedPosition: true, graphChanged: true })).toBe(false);
    expect(shouldRunInitialLayout({ nodeCount: 10, hasAnySavedPosition: false, graphChanged: false })).toBe(false);
  });

  it("cancels a prior layout before starting another", () => {
    const events = [];
    const makeLayout = (name) => {
      const layout = {
        one: (_event, callback) => { layout.callback = callback; },
        run: () => events.push(`run-${name}`),
        stop: () => events.push(`stop-${name}`)
      };
      return layout;
    };
    const layouts = [makeLayout("1"), makeLayout("2")];
    const scratch = new Map();
    const cy = {
      scratch(key, value) {
        if (arguments.length === 2) scratch.set(key, value);
        return scratch.get(key);
      },
      layout: () => layouts.shift()
    };

    const first = runExclusiveGraphLayout(cy, { name: "grid" });
    const second = runExclusiveGraphLayout(cy, { name: "circle" });

    expect(first).not.toBe(second);
    expect(events).toEqual(["run-1", "stop-1", "run-2"]);
    expect(stopActiveGraphLayout(cy)).toBe(true);
    expect(events).toEqual(["run-1", "stop-1", "run-2", "stop-2"]);
  });

  it("restores labels when idle and sufficiently zoomed", () => {
    expect(detailClasses({ nodeCount: 5_000, edgeCount: 10_000, zoom: 0.4, interacting: true, labels: true })).toMatchObject({ interaction: true, hideLabels: true });
    expect(detailClasses({ nodeCount: 5_000, edgeCount: 10_000, zoom: 1, interacting: false, labels: true })).toMatchObject({ interaction: false, hideLabels: false });
  });
});
