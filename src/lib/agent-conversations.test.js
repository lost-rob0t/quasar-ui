import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getState: vi.fn(),
  putState: vi.fn()
}));
import { getState, putState } from "./db";
import {
  appendConversationMessage,
  appendConversationTurn,
  conversationById,
  createConversation,
  deriveConversationFromRun,
  getActiveConversationId,
  hydrateConversationState,
  loadConversationState,
  loadConversationStreams,
  mapRunState,
  redactConversationValue,
  resetConversationStateCache,
  saveConversationState,
  saveConversationStreams,
  flushConversationState,
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
    resetConversationStateCache();
    getState.mockImplementation(async (_id, fallback) => fallback ?? null);
    putState.mockImplementation(async (id, value) => ({ ...value, _id: id, _rev: "1-test" }));
  });

  it("persists conversations, turns, messages, and drafts in the versioned state database", async () => {
    await hydrateConversationState();
    let conversation = createConversation({ id: "conversation:test" });
    conversation = appendConversationMessage(conversation, { id: "message:user", role: "user", content: "Inspect this graph" });
    conversation = appendConversationTurn(conversation, { id: "turn:1", messageId: "message:user" });
    conversation = setConversationDraft(conversation, "next prompt");
    const state = upsertConversation({ version: 1, conversations: [] }, conversation);
    expect(conversationById(state, "conversation:test")?.draft).toBe("next prompt");
    await flushConversationState();
    expect(loadConversationState().conversations[0].messages[0].content).toBe("Inspect this graph");
    expect(putState).toHaveBeenLastCalledWith("agent-chat-state:v2", expect.objectContaining({
      version: 2,
      conversations: [expect.objectContaining({ id: "conversation:test" })]
    }));
  });

  it("updates a streamed or retried message in place", () => {
    let conversation = createConversation();
    conversation = appendConversationMessage(conversation, { id: "message:1", role: "assistant", content: "partial", status: "streaming" });
    conversation = updateConversationMessage(conversation, "message:1", { content: "complete", status: "completed" });
    expect(conversation.messages[0]).toMatchObject({ content: "complete", status: "completed" });
  });

  it("redacts secret-shaped fields before persistence", async () => {
    await hydrateConversationState();
    const redacted = redactConversationValue({ input: { apiKey: "secret", query: "safe" }, authorization: "bearer" });
    expect(redacted).toEqual({ input: { apiKey: "[REDACTED]", query: "safe" }, authorization: "[REDACTED]" });
    saveConversationState({ version: 1, conversations: [{ id: "c", messages: [], token: "bad" }] });
    await flushConversationState();
    expect(JSON.stringify(putState.mock.calls.at(-1)[1])).not.toContain("bad");
  });

  it("restores the active conversation ID and partial streams from PouchDB", async () => {
    await hydrateConversationState();
    setActiveConversationId("conversation:active");
    saveConversationStreams([{ id: "stream:1", text: "partial", status: "streaming" }]);
    await flushConversationState();
    expect(getActiveConversationId()).toBe("conversation:active");
    expect(loadConversationStreams()).toEqual([expect.objectContaining({ id: "stream:1", text: "partial" })]);
  });

  it("migrates legacy local browser state once", async () => {
    localStorage.setItem("quasar:agent-conversations:v1", JSON.stringify({
      version: 1,
      conversations: [{ id: "conversation:legacy", messages: [], turns: [], taskList: [] }]
    }));
    localStorage.setItem("quasar:agent-active-conversation:v1", "conversation:legacy");
    localStorage.setItem("quasar:agent-streams:v1", JSON.stringify([{ id: "stream:legacy", text: "partial" }]));

    const state = await hydrateConversationState();

    expect(state).toMatchObject({
      version: 2,
      activeConversationId: "conversation:legacy",
      conversations: [expect.objectContaining({ id: "conversation:legacy" })],
      streams: [expect.objectContaining({ id: "stream:legacy" })]
    });
    expect(localStorage.removeItem).toHaveBeenCalledTimes(3);
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
