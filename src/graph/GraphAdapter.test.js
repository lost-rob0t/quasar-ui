import { describe, expect, it } from "vitest";
import { automaticNodePosition } from "./GraphAdapter";

const extent = { x1: -500, y1: -300, x2: 500, y2: 300 };

describe("automaticNodePosition", () => {
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
});
