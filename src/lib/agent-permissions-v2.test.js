import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionPermissions,
  createPermissionRequest,
  decidePermission,
  evaluatePermission,
  normalizeAgentPermissions,
  revokePermission,
  sanitizeArguments
} from "./agent-permissions-v2";

function localStorageMock() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key))
  };
}

describe("agent permission runtime", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock());
    clearSessionPermissions();
  });

  it("migrates legacy permissions without granting URL fetch from external search", () => {
    expect(normalizeAgentPermissions(["sources.external"])).toEqual(["web_search"]);
    expect(normalizeAgentPermissions(["documents.read"])).toEqual(["document_read", "database_read"]);
  });

  it("creates sanitized resumable permission requests", () => {
    const request = createPermissionRequest({
      permission: "web_search",
      conversationId: "chat:1",
      toolCallId: "tool:1",
      arguments: { query: "test", apiKey: "hidden" },
      continuation: { step: 2 }
    });
    expect(request.arguments.apiKey).toBe("[REDACTED]");
    expect(request.continuation).toEqual({ step: 2 });
  });

  it("supports chat scope", () => {
    const request = createPermissionRequest({ permission: "javascript_execute", conversationId: "chat:1" });
    const allowed = decidePermission(request, "allow-chat", { sessionId: "session:1" });
    expect(allowed.status).toBe("allowed");
    expect(evaluatePermission(request, { sessionId: "session:1" })).toMatchObject({ allowed: true, needsPrompt: false });
    const otherChat = { ...request, id: "permission:2", conversationId: "chat:2" };
    expect(evaluatePermission(otherChat, { sessionId: "session:1" }).needsPrompt).toBe(true);
  });

  it("shares memory-only session scope across entrypoints", () => {
    const request = createPermissionRequest({ permission: "graph_read" });
    decidePermission(request, "allow-session", { sessionId: "composer-entrypoint" });
    expect(evaluatePermission(request, { sessionId: "tool-runtime-entrypoint" })).toMatchObject({ allowed: true, needsPrompt: false });
  });

  it("consumes action decisions once", () => {
    const request = createPermissionRequest({ permission: "actor_run", target: "actor:test" });
    decidePermission(request, "allow-action");
    expect(evaluatePermission(request)).toMatchObject({ allowed: true, needsPrompt: false });
    expect(evaluatePermission(request)).toMatchObject({ allowed: false, needsPrompt: true });
  });

  it("persists always allow and always deny decisions", () => {
    const request = createPermissionRequest({ permission: "url_fetch", target: "https://example.org" });
    const denied = decidePermission(request, "always-deny");
    expect(evaluatePermission(request)).toMatchObject({ allowed: false, needsPrompt: false });
    expect(revokePermission(denied.decision.id)).toBe(true);
    expect(evaluatePermission(request).needsPrompt).toBe(true);
  });

  it("requires a prompt when no scoped decision exists", () => {
    const request = createPermissionRequest({ permission: "graph_write" });
    expect(evaluatePermission(request, { agentPermissions: ["graph.edit"] })).toMatchObject({ allowed: false, needsPrompt: true });
  });

  it("redacts nested credentials", () => {
    expect(sanitizeArguments({ headers: { Authorization: "Bearer x" }, value: 1 })).toEqual({
      headers: { Authorization: "[REDACTED]" },
      value: 1
    });
  });
});
