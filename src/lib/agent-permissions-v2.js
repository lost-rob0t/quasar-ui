const STORE_KEY = "quasar:agent-permissions:v2";
const SESSION_DECISIONS = new Map();

export const AGENT_CAPABILITY_PERMISSIONS = Object.freeze([
  "web_search",
  "url_fetch",
  "javascript_execute",
  "database_read",
  "database_write",
  "graph_read",
  "graph_write",
  "document_read",
  "document_write",
  "actor_run",
  "actor_create",
  "filesystem_read",
  "filesystem_write",
  "shell_execute",
  "mcp_use"
]);

export const LEGACY_PERMISSION_MAP = Object.freeze({
  "documents.read": ["document_read", "database_read"],
  "documents.create": ["document_write", "database_write"],
  "documents.edit": ["document_write", "database_write"],
  "documents.delete": ["document_write", "database_write"],
  "graph.read": ["graph_read"],
  "graph.edit": ["graph_write"],
  "actors.run": ["actor_run"],
  "actors.create": ["actor_create"],
  "sources.external": ["web_search"],
  "server.use": ["mcp_use"]
});

export const PERMISSION_DECISIONS = Object.freeze([
  "ask-every-time",
  "allow-action",
  "allow-chat",
  "allow-session",
  "always-allow",
  "deny",
  "always-deny"
]);

function localStore() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function now() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function persistedDecisions() {
  try {
    const value = JSON.parse(localStore()?.getItem(STORE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function savePersisted(decisions) {
  localStore()?.setItem(STORE_KEY, JSON.stringify(decisions));
  return decisions;
}

export function normalizeAgentPermissions(permissions = []) {
  const result = new Set();
  for (const permission of permissions) {
    if (AGENT_CAPABILITY_PERMISSIONS.includes(permission)) result.add(permission);
    for (const mapped of LEGACY_PERMISSION_MAP[permission] || []) result.add(mapped);
  }
  return [...result];
}

export function permissionTarget(permission, target = null) {
  if (!target) return `${permission}:*`;
  if (typeof target === "string") return `${permission}:${target}`;
  const stable = Object.keys(target).sort().map((key) => `${key}=${String(target[key])}`).join("&");
  return `${permission}:${stable || "*"}`;
}

export function createPermissionRequest(input) {
  if (!AGENT_CAPABILITY_PERMISSIONS.includes(input.permission)) throw new TypeError(`Unknown permission: ${input.permission}`);
  return {
    id: input.id || randomId("permission"),
    conversationId: input.conversationId || null,
    turnId: input.turnId || null,
    runId: input.runId || null,
    toolCallId: input.toolCallId || null,
    permission: input.permission,
    reason: String(input.reason || "The agent requested this capability."),
    target: input.target || null,
    arguments: sanitizeArguments(input.arguments),
    risk: input.risk || "medium",
    sideEffects: [...(input.sideEffects || [])],
    requestedScope: input.requestedScope || "action",
    status: "pending",
    createdAt: now(),
    continuation: input.continuation || null
  };
}

export function sanitizeArguments(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeArguments(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /token|secret|password|authorization|api[-_]?key|cookie/i.test(key) ? "[REDACTED]" : sanitizeArguments(item, seen)
  ]));
}

function matches(decision, request) {
  if (decision.permission !== request.permission) return false;
  if (decision.targetKey !== permissionTarget(request.permission, request.target)) return false;
  if (decision.scope === "chat" && decision.conversationId !== request.conversationId) return false;
  if (decision.expiresAt && Date.parse(decision.expiresAt) <= Date.now()) return false;
  return true;
}

export function evaluatePermission(request, context = {}) {
  const sessionMatch = [...SESSION_DECISIONS.entries()].find(([, decision]) => matches(decision, request));
  if (sessionMatch) {
    const [decisionId, decision] = sessionMatch;
    if (decision.scope === "action") SESSION_DECISIONS.delete(decisionId);
    return { allowed: decision.effect === "allow", decision, needsPrompt: false };
  }
  const decision = persistedDecisions().find((item) => matches(item, request));
  if (decision) return { allowed: decision.effect === "allow", decision, needsPrompt: false };
  const declared = new Set(normalizeAgentPermissions(context.agentPermissions || []));
  if (!declared.has(request.permission)) return { allowed: false, decision: null, needsPrompt: true, reason: "Permission is not pre-authorized" };
  if (context.policy === "always") return { allowed: true, decision: null, needsPrompt: false };
  return { allowed: false, decision: null, needsPrompt: true };
}

export function decidePermission(request, choice, context = {}) {
  if (!PERMISSION_DECISIONS.includes(choice)) throw new TypeError(`Unknown permission decision: ${choice}`);
  const sessionId = context.sessionId || "default";
  if (choice === "ask-every-time") return { ...request, status: "pending" };
  const effect = ["allow-action", "allow-chat", "allow-session", "always-allow"].includes(choice) ? "allow" : "deny";
  const scope = ({
    "allow-action": "action",
    "allow-chat": "chat",
    "allow-session": "session",
    "always-allow": "always",
    deny: "action",
    "always-deny": "always"
  })[choice];
  const decision = {
    id: randomId("permission-decision"),
    requestId: request.id,
    permission: request.permission,
    targetKey: permissionTarget(request.permission, request.target),
    effect,
    scope,
    conversationId: request.conversationId,
    sessionId,
    createdAt: now(),
    expiresAt: context.expiresAt || null
  };
  if (scope === "session" || scope === "action" || scope === "chat") {
    SESSION_DECISIONS.set(decision.id, decision);
  } else {
    const persistent = persistedDecisions().filter((item) => !(item.permission === decision.permission && item.targetKey === decision.targetKey && item.scope === "always"));
    savePersisted([decision, ...persistent]);
  }
  return { ...request, status: effect === "allow" ? "allowed" : "denied", decision, decidedAt: now() };
}

export function revokePermission(decisionId) {
  const sessionRemoved = SESSION_DECISIONS.delete(decisionId);
  const persistent = persistedDecisions();
  const next = persistent.filter((decision) => decision.id !== decisionId);
  if (next.length !== persistent.length) savePersisted(next);
  return sessionRemoved || next.length !== persistent.length;
}

export function clearSessionPermissions() {
  SESSION_DECISIONS.clear();
}
