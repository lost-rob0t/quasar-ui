const CHAT_STATE_ID = "agent-chat-state:v2";
const LEGACY_CONVERSATION_KEY = "quasar:agent-conversations:v1";
const LEGACY_ACTIVE_KEY = "quasar:agent-active-conversation:v1";
const LEGACY_STREAM_KEY = "quasar:agent-streams:v1";
const SESSION_VERSION = 2;
const SECRET_KEYS = /(?:token|secret|password|authorization|api[-_]?key|cookie)/i;
let cachedState = emptyState();
let hydrationPromise = null;
let writeQueue = Promise.resolve();

async function readState(id, fallback) {
  const { getState } = await import("./db");
  return getState(id, fallback);
}

async function writeState(id, value) {
  const { putState } = await import("./db");
  return putState(id, value);
}

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${suffix}`;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function redactConversationValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactConversationValue(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEYS.test(key) ? "[REDACTED]" : redactConversationValue(item, seen)
  ]));
}

function emptyState() {
  return {
    version: SESSION_VERSION,
    activeConversationId: "",
    conversations: [],
    streams: []
  };
}

export function loadConversationState() {
  return clone(cachedState);
}

function readLegacyState() {
  if (typeof localStorage === "undefined") return null;
  try {
    const conversations = JSON.parse(localStorage.getItem(LEGACY_CONVERSATION_KEY) || "null");
    const streams = JSON.parse(localStorage.getItem(LEGACY_STREAM_KEY) || "[]");
    if (!conversations || !Array.isArray(conversations.conversations)) return null;
    return {
      version: SESSION_VERSION,
      activeConversationId: localStorage.getItem(LEGACY_ACTIVE_KEY) || "",
      conversations: conversations.conversations,
      streams: Array.isArray(streams) ? streams : []
    };
  } catch {
    return null;
  }
}

function normalizedState(state) {
  const next = {
    version: SESSION_VERSION,
    activeConversationId: String(state?.activeConversationId || ""),
    conversations: (state?.conversations || []).map((conversation) => redactConversationValue(conversation)),
    streams: (state?.streams || []).map((stream) => redactConversationValue(stream))
  };
  return next;
}

function queueStateWrite(state) {
  const next = normalizedState(state);
  cachedState = next;
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => writeState(CHAT_STATE_ID, next));
  return next;
}

export async function hydrateConversationState() {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      const stored = await readState(CHAT_STATE_ID, null);
      if (stored?.version === SESSION_VERSION && Array.isArray(stored.conversations)) {
        cachedState = normalizedState(stored);
        return loadConversationState();
      }
      const migrated = readLegacyState();
      cachedState = normalizedState(migrated || emptyState());
      await writeState(CHAT_STATE_ID, cachedState);
      if (migrated && typeof localStorage !== "undefined") {
        localStorage.removeItem(LEGACY_CONVERSATION_KEY);
        localStorage.removeItem(LEGACY_ACTIVE_KEY);
        localStorage.removeItem(LEGACY_STREAM_KEY);
      }
      return loadConversationState();
    })().catch((error) => {
      hydrationPromise = null;
      throw error;
    });
  }
  return hydrationPromise;
}

export function saveConversationState(state) {
  return queueStateWrite({
    ...cachedState,
    conversations: state?.conversations ?? cachedState.conversations
  });
}

export function flushConversationState() {
  return writeQueue;
}

export function resetConversationStateCache() {
  cachedState = emptyState();
  hydrationPromise = null;
  writeQueue = Promise.resolve();
}

export function createConversation(input = {}) {
  const timestamp = now();
  return {
    id: input.id || id("conversation"),
    title: String(input.title || "New conversation"),
    agentId: input.agentId || null,
    modelId: input.modelId || null,
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
    messages: [],
    turns: [],
    taskList: [],
    draft: "",
    runId: null,
    state: "idle",
    ...clone(input),
    messages: (input.messages || []).map((message) => redactConversationValue(message)),
    turns: (input.turns || []).map((turn) => redactConversationValue(turn)),
    taskList: (input.taskList || []).map((task) => redactConversationValue(task))
  };
}

export function ensureConversation(state, input = {}) {
  if (state.conversations?.length) return { state, conversation: state.conversations[0] };
  const conversation = createConversation(input);
  return { state: saveConversationState({ ...state, conversations: [conversation] }), conversation };
}

export function upsertConversation(state, conversation) {
  const saved = {
    ...clone(conversation),
    updatedAt: now(),
    messages: (conversation.messages || []).map((message) => redactConversationValue(message))
  };
  const conversations = [saved, ...(state.conversations || []).filter((item) => item.id !== saved.id)]
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return saveConversationState({ ...state, conversations });
}

export function removeConversation(state, conversationId) {
  return saveConversationState({
    ...state,
    conversations: (state.conversations || []).filter((conversation) => conversation.id !== conversationId)
  });
}

export function appendConversationMessage(conversation, message) {
  const saved = {
    id: message.id || id("message"),
    role: message.role || "system",
    kind: message.kind || "message",
    content: String(message.content || ""),
    createdAt: message.createdAt || now(),
    status: message.status || "completed",
    ...redactConversationValue(message)
  };
  return {
    ...conversation,
    updatedAt: now(),
    title: conversation.messages?.length ? conversation.title : deriveTitle(saved.content),
    messages: [...(conversation.messages || []), saved]
  };
}

export function updateConversationMessage(conversation, messageId, patch) {
  return {
    ...conversation,
    updatedAt: now(),
    messages: (conversation.messages || []).map((message) => message.id === messageId
      ? { ...message, ...redactConversationValue(patch), updatedAt: now() }
      : message)
  };
}

export function appendConversationTurn(conversation, turn) {
  const saved = {
    id: turn.id || id("turn"),
    createdAt: turn.createdAt || now(),
    status: turn.status || "running",
    ...redactConversationValue(turn)
  };
  return { ...conversation, updatedAt: now(), turns: [...(conversation.turns || []), saved] };
}

export function setConversationDraft(conversation, draft) {
  return { ...conversation, draft: String(draft || ""), updatedAt: now() };
}

export function setActiveConversationId(conversationId) {
  queueStateWrite({
    ...cachedState,
    activeConversationId: String(conversationId || "")
  });
}

export function getActiveConversationId() {
  return cachedState.activeConversationId || "";
}

export function loadConversationStreams() {
  return clone(cachedState.streams || []);
}

export function saveConversationStreams(streams) {
  const next = (streams || []).map((stream) => redactConversationValue(stream));
  queueStateWrite({ ...cachedState, streams: next });
  return next;
}

export function conversationById(state, conversationId) {
  return (state.conversations || []).find((conversation) => conversation.id === conversationId) || null;
}

export function deriveConversationFromRun(run, existing = null) {
  const conversation = existing || createConversation({ agentId: run?.agentId, modelId: run?.modelId });
  if (!run) return conversation;
  const known = new Set((conversation.messages || []).map((message) => message.sourceId).filter(Boolean));
  let next = { ...conversation, runId: run.id, state: mapRunState(run.status, run.phase) };
  for (const entry of run.history || []) {
    if (known.has(entry.id)) continue;
    if (entry.kind === "model") {
      next = appendConversationMessage(next, {
        role: "assistant",
        kind: "message",
        content: entry.text || "",
        sourceId: entry.id,
        usage: entry.usage,
        costUsd: entry.costUsd
      });
    } else if (entry.kind === "tool") {
      next = appendConversationMessage(next, {
        role: "tool",
        kind: "tool",
        content: entry.error?.message || entry.resultSummary?.message || entry.name || "Tool call",
        sourceId: entry.id,
        toolName: entry.name,
        input: entry.arguments,
        output: entry.resultSummary,
        error: entry.error,
        status: entry.error ? "failed" : "completed",
        startedAt: entry.startedAt,
        completedAt: entry.at
      });
    }
  }
  return next;
}

export function mapRunState(status, phase = null) {
  if (status === "active") {
    return ["thinking", "running-tool"].includes(phase) ? phase : "thinking";
  }
  return ({
    idle: "idle",
    paused: "paused",
    completed: "completed",
    failed: "failed",
    stopped: "cancelled",
    "budget-exhausted": "budget-exhausted"
  })[status] || status || "idle";
}

function deriveTitle(content) {
  const value = String(content || "").replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 72) : "New conversation";
}
