import { describe, expect, it } from "vitest";
import { addUsage, budgetState, calculateCost, zeroUsage } from "./agent-budget";

describe("agent budget", () => {
  it("calculates model cost with cached tokens", () => {
    expect(calculateCost({
      inputTokens: 2_000_000,
      cachedTokens: 500_000,
      outputTokens: 1_000_000
    }, {
      inputPerMillionUsd: 2,
      cachedInputPerMillionUsd: 0.5,
      outputPerMillionUsd: 8
    })).toBe(11.25);
  });

  it("warns before the hard limit", () => {
    const state = budgetState({ maxCostUsd: 1, softLimitRatio: 0.8 }, { ...zeroUsage(), costUsd: 0.81 });
    expect(state.state).toBe("warning");
  });

  it("hard stops before projected usage crosses a limit", () => {
    const usage = addUsage(zeroUsage(), { toolCalls: 9 });
    const state = budgetState({ maxToolCalls: 10 }, usage, { toolCalls: 1 });
    expect(state.state).toBe("hard-stop");
    expect(state.reason).toContain("Tool calls");
  });
});
