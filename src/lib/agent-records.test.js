import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getState: vi.fn(),
  putState: vi.fn(),
  stateDb: {}
}));
import {
  AGENT_RECORD_TYPES,
  normalizeAgent,
  normalizeRole
} from "./agent-records";

describe("agent records", () => {
  it("normalizes persistent agents with bounded defaults", () => {
    const agent = normalizeAgent({
      id: "operator",
      name: "Operator",
      roleId: "researcher",
      providerId: "openrouter",
      modelId: "test/model",
      permissions: ["documents.read"]
    });
    expect(agent.recordType).toBe(AGENT_RECORD_TYPES.agent);
    expect(agent.loop.maxIterations).toBeGreaterThan(0);
    expect(agent.budget.maxCostUsd).toBeGreaterThan(0);
  });

  it("rejects unknown role permissions", () => {
    expect(() => normalizeRole({
      id: "bad",
      name: "Bad",
      permissions: ["root.shell"]
    })).toThrow("Unknown permission");
  });
});
