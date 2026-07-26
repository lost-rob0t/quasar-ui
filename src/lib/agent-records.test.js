import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getState: vi.fn(),
  putState: vi.fn(),
  stateDb: {}
}));
import {
  AGENT_RECORD_TYPES,
  DEFAULT_ROLES,
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

  it("gives the default operator roles graph editing and external sources", () => {
    for (const roleId of ["researcher", "graph-analyst"]) {
      const role = DEFAULT_ROLES.find((candidate) => candidate.id === roleId);
      expect(role.permissions).toContain("graph.edit");
      expect(role.permissions).toContain("sources.external");
    }
  });
});
