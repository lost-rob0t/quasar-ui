import { getActiveConversationId } from "./agent-conversations";
import {
  createPermissionRequest,
  decidePermission,
  evaluatePermission
} from "./agent-permissions-v2";

const EVENT_REQUEST = "quasar:agent-permission-request";
const EVENT_UPDATE = "quasar:agent-permission-update";
const PENDING_KEY = "quasar:agent-pending-permissions:v1";
const SESSION_ID = `session:${Date.now()}:${Math.random().toString(16).slice(2)}`;
const pending = new Map();

const TOOL_PERMISSIONS = Object.freeze({
  query_database: "database_read",
  query_graph: "graph_read",
  run_actor: "actor_run",
  web_search: "web_search",
  fetch_url: "url_fetch",
  scrape_website: "url_fetch",
  mcp_call: "mcp_use",
  build_graph: "graph_write",
  propose_graph_operations: "graph_write",
  apply_graph_operations: "graph_write",
  validate_actor: "actor_create",
  save_actor: "actor_create",
  javascript_execute: "javascript_execute"
});

const TOOL_RISKS = Object.freeze({
  query_database: "low",
  query_graph: "low",
  web_search: "low",
  fetch_url: "medium",
  scrape_website: "medium",
  run_actor: "medium",
  mcp_call: "medium",
  validate_actor: "medium",
  javascript_execute: "high",
  build_graph: "high",
  propose_graph_operations: "high",
  apply_graph_operations: "high",
  save_actor: "high"
});

function storage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function dispatch(name, detail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

function loadPending() {
  try {
    const records = JSON.parse(storage()?.getItem(PENDING_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function savePending() {
  const records = [...pending.values()].map(({ request }) => request);
  storage()?.setItem(PENDING_KEY, JSON.stringify(records));
}

function targetFor(args = {}) {
  return args.url || args.path || args.actorId || args.serverId || args.candidateId || args.name || null;
}

export function permissionForTool(toolName) {
  return TOOL_PERMISSIONS[toolName] || null;
}

export function requestRuntimeToolPermission(toolName, args, context = {}) {
  const permission = permissionForTool(toolName);
  if (!permission || typeof window === "undefined") return Promise.resolve(null);
  const request = createPermissionRequest({
    permission,
    conversationId: context.conversationId || getActiveConversationId() || null,
    runId: context.run?.id || context.runId || null,
    toolCallId: context.toolCallId || null,
    reason: `The agent wants to run ${toolName}.`,
    target: targetFor(args),
    arguments: args,
    risk: TOOL_RISKS[toolName] || "medium",
    sideEffects: ["The registered capability may read or modify scoped Quasar state."],
    requestedScope: "action",
    continuation: {
      kind: "tool-call",
      toolName,
      runId: context.run?.id || context.runId || null
    }
  });
  const evaluation = evaluatePermission(request, {
    sessionId: SESSION_ID,
    agentPermissions: context.agent?.permissions || context.agentPermissions || []
  });
  if (evaluation.allowed) return Promise.resolve(evaluation.decision);
  if (!evaluation.needsPrompt) return Promise.reject(Object.assign(new Error(`Permission denied: ${permission}`), {
    code: "permission_denied",
    permissionRequest: request
  }));
  return new Promise((resolve, reject) => {
    pending.set(request.id, { request, resolve, reject });
    savePending();
    dispatch(EVENT_REQUEST, request);
  });
}

export function resolveRuntimeToolPermission(requestId, choice) {
  const entry = pending.get(requestId);
  const request = entry?.request || loadPending().find((candidate) => candidate.id === requestId);
  if (!request) return null;
  const result = decidePermission(request, choice, { sessionId: SESSION_ID });
  pending.delete(requestId);
  savePending();
  dispatch(EVENT_UPDATE, result);
  if (result.status === "allowed") entry?.resolve(result.decision);
  else entry?.reject(Object.assign(new Error(`Permission denied: ${result.permission}`), {
    code: "permission_denied",
    permissionRequest: result
  }));
  return result;
}

export function cancelRuntimeToolPermissions(runId, reason = "Agent run cancelled") {
  for (const [requestId, entry] of pending) {
    if (runId && entry.request.runId !== runId) continue;
    pending.delete(requestId);
    entry.reject(new DOMException(reason, "AbortError"));
    dispatch(EVENT_UPDATE, { ...entry.request, status: "cancelled", decidedAt: new Date().toISOString() });
  }
  savePending();
}

export function subscribeRuntimeToolPermissions(listener) {
  if (typeof window === "undefined") return () => {};
  const onRequest = (event) => listener({ type: "request", request: event.detail });
  const onUpdate = (event) => listener({ type: "update", request: event.detail });
  window.addEventListener(EVENT_REQUEST, onRequest);
  window.addEventListener(EVENT_UPDATE, onUpdate);
  for (const request of loadPending()) listener({ type: "request", request });
  return () => {
    window.removeEventListener(EVENT_REQUEST, onRequest);
    window.removeEventListener(EVENT_UPDATE, onUpdate);
  };
}
