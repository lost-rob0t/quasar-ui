import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendConversationMessage,
  appendConversationTurn,
  conversationById,
  createConversation,
  deriveConversationFromRun,
  getActiveConversationId,
  loadConversationState,
  mapRunState,
  redactConversationValue,
  saveConversationState,
  setActiveConversationId,
  setConversationDraft,
  updateConversationMessage,
  upsertConversation
} from "./agent-conversations";

function localStorageMock() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key)),
    clear: vi.fn(() => values.clear())
  };
}

describe("agent conversations", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock());
  });

  it("persists conversations, turns, messages, and drafts", () => {
    let conversation = createConversation({ id: "conversation:test" });
    conversation = appendConversationMessage(conversation, { id: "message:user", role: "user", content: "Inspect this graph" });
    conversation = appendConversationTurn(conversation, { id: "turn:1", messageId: "message:user" });
    conversation = setConversationDraft(conversation, "next prompt");
    const state = upsertConversation({ version: 1, conversations: [] }, conversation);
    expect(conversationById(state, "conversation:test")?.draft).toBe("next prompt");
    expect(loadConversationState().conversations[0].messages[0].content).toBe("Inspect this graph");
  });

  it("updates a streamed or retried message in place", () => {
    let conversation = createConversation();
    conversation = appendConversationMessage(conversation, { id: "message:1", role: "assistant", content: "partial", status: "streaming" });
    conversation = updateConversationMessage(conversation, "message:1", { content: "complete", status: "completed" });
    expect(conversation.messages[0]).toMatchObject({ content: "complete", status: "completed" });
  });

  it("redacts secret-shaped fields before persistence", () => {
    const redacted = redactConversationValue({ input: { apiKey: "secret", query: "safe" }, authorization: "bearer" });
    expect(redacted).toEqual({ input: { apiKey: "[REDACTED]", query: "safe" }, authorization: "[REDACTED]" });
    saveConversationState({ version: 1, conversations: [{ id: "c", messages: [], token: "bad" }] });
    expect(localStorage.setItem.mock.calls[0][1]).not.toContain("bad");
  });

  it("restores the active conversation ID", () => {
    setActiveConversationId("conversation:active");
    expect(getActiveConversationId()).toBe("conversation:active");
  });

  it("derives auditable assistant and tool cards from persisted run history", () => {
    const conversation = deriveConversationFromRun({
      id: "run:1",
      agentId: "agent:1",
      modelId: "model:1",
      status: "completed",
      history: [
        { id: "model:1", kind: "model", text: "Done" },
        { id: "tool:1", kind: "tool", name: "query_graph", arguments: { depth: 1 }, resultSummary: { nodes: [] }, at: "2026-01-01T00:00:00Z" }
      ]
    });
    expect(conversation.messages.map((message) => message.kind)).toEqual(["message", "tool"]);
    expect(conversation.state).toBe("completed");
  });

  it("maps every supervisor status and active execution phase to a stable UI state", () => {
    expect(mapRunState()).toBe("idle");
    expect(mapRunState("idle")).toBe("idle");
    expect(mapRunState("active")).toBe("thinking");
    expect(mapRunState("active", "thinking")).toBe("thinking");
    expect(mapRunState("active", "running-tool")).toBe("running-tool");
    expect(mapRunState("paused")).toBe("paused");
    expect(mapRunState("failed")).toBe("failed");
    expect(mapRunState("stopped")).toBe("cancelled");
    expect(mapRunState("completed")).toBe("completed");
    expect(mapRunState("budget-exhausted")).toBe("budget-exhausted");
  });
});
