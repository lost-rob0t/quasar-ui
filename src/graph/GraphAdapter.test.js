import { describe, expect, it } from "vitest";
import {
  automaticNodePosition,
  createGraphAdapter,
  DEFAULT_WHEEL_SENSITIVITY
} from "./GraphAdapter";

const extent = { x1: -500, y1: -300, x2: 500, y2: 300 };

describe("automaticNodePosition", () => {
  it("uses responsive but controlled wheel zoom sensitivity", () => {
    expect(DEFAULT_WHEEL_SENSITIVITY).toBe(0.42);
  });

  it("spreads a batch of new nodes instead of stacking them", () => {
    const positions = Array.from({ length: 24 }, (_, index) => automaticNodePosition(index, extent));
    const unique = new Set(positions.map(({ x, y }) => `${x.toFixed(4)}:${y.toFixed(4)}`));

    expect(unique.size).toBe(positions.length);
  });

  it("keeps generated positions finite around the visible graph extent", () => {
    const positions = Array.from({ length: 24 }, (_, index) => automaticNodePosition(index, extent));

    for (const position of positions) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
      expect(Math.abs(position.x)).toBeLessThan(1000);
      expect(Math.abs(position.y)).toBeLessThan(1000);
    }
  });

  it("uses native left drag and native single-click selection", () => {
    const cy = createGraphAdapter({
      headless: true,
      styleEnabled: false,
      elements: [],
      selectionType: "additive"
    });

    expect(cy.userPanningEnabled()).toBe(true);
    expect(cy.boxSelectionEnabled()).toBe(false);
    expect(cy.selectionType()).toBe("single");
    cy.destroy();
  });
});
