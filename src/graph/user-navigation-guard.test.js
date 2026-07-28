import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installUserNavigationGuard,
  isUserNavigationActive,
  markUserNavigation
} from "./user-navigation-guard";

afterEach(() => vi.restoreAllMocks());

describe("user navigation guard", () => {
  it("tracks the active navigation window", () => {
    const state = { until: 0 };
    markUserNavigation(state, 100, 360);

    expect(isUserNavigationActive(state, 459)).toBe(true);
    expect(isUserNavigationActive(state, 460)).toBe(false);
  });

  it("blocks delayed recenter panBy calls after user navigation", () => {
    const nativePanBy = vi.fn();
    let navigationHandler = null;
    const cy = {
      panBy: nativePanBy,
      on: vi.fn((events, handler) => {
        if (events.includes("dragpan")) navigationHandler = handler;
      }),
      off: vi.fn()
    };
    const restore = installUserNavigationGuard(cy, 360);

    vi.spyOn(Date, "now").mockReturnValue(100);
    navigationHandler();

    Date.now.mockReturnValue(200);
    expect(cy.panBy({ x: 10, y: 5 })).toBe(cy);
    expect(nativePanBy).not.toHaveBeenCalled();

    Date.now.mockReturnValue(500);
    cy.panBy({ x: 10, y: 5 });
    expect(nativePanBy).toHaveBeenCalledWith({ x: 10, y: 5 });

    restore();
    expect(cy.off).toHaveBeenCalled();
  });
});
