import { getState, putState, stateDb } from "./db";

export const AGENT_SCHEMA_VERSION = 1;
export const AGENT_RECORD_TYPES = Object.freeze({
  agent: "quasar.agent",
  role: "quasar.agent-role",
  run: "quasar.agent-run",
  step: "quasar.agent-run-step",
  checkpoint: "quasar.agent-checkpoint",
  provider: "quasar.provider-config",
  model: "quasar.model-config",
  budget: "quasar.budget-policy",
  cost: "quasar.cost-record",
  toolCall: "quasar.tool-call",
  loopEvent: "quasar.loop-event",
  recoveryEvent: "quasar.recovery-event",
  memory: "quasar.agent-memory",
  generatedActor: "quasar.agent-generated-actor"
});

export const AGENT_STATUSES = Object.freeze([
  "idle",
  "active",
  "paused",
  "failed",
  "stopped",
  "completed",
  "budget-exhausted"
]);

export const AGENT_PERMISSIONS = Object.freeze([
  "documents.read",
  "documents.create",
  "documents.edit",
  "documents.delete",
  "graph.read",
  "graph.edit",
  "actors.run",
  "actors.create",
  "actors.edit",
  "actors.delete",
  "targets.read",
  "targets.edit",
  "sources.external",
  "data.import",
  "data.export",
  "targets.submit",
  "queues.read",
  "queues.write",
  "server.use",
  "destructive"
]);

export const DEFAULT_ROLES = Object.freeze([
  {
    id: "researcher",
    name: "Researcher",
    instructions: "Investigate the scoped target. Separate sourced facts, claims, inference, hypotheses, user conclusions, and unverified leads. Preserve provenance.",
    permissions: ["documents.read", "documents.create", "documents.edit", "graph.read", "targets.read", "sources.external", "actors.run"],
    actions: ["inspect", "research", "create", "relate", "verify"],
    accepts: ["*"],
    outputs: ["source", "claim", "relation", "person", "org", "event", "location"],
    autonomy: "bounded",
    review: "mutations",
    retry: { maxAttempts: 3, backoffMs: 1_000 },
    budget: { maxCostUsd: 2, maxIterations: 20, maxToolCalls: 60, maxRuntimeMs: 900_000 }
  },
  {
    id: "graph-analyst",
    name: "Graph analyst",
    instructions: "Inspect graph structure and propose precise, reversible graph operations. Explain evidence for relations.",
    permissions: ["documents.read", "graph.read", "graph.edit", "targets.read"],
    actions: ["inspect", "relate", "merge", "layout", "focus"],
    accepts: ["*"],
    outputs: ["relation"],
    autonomy: "bounded",
    review: "destructive",
    retry: { maxAttempts: 2, backoffMs: 1_000 },
    budget: { maxCostUsd: 1, maxIterations: 12, maxToolCalls: 36, maxRuntimeMs: 600_000 }
  },
  {
    id: "actor-builder",
    name: "Actor builder",
    instructions: "Create Quasar actors as declarative transforms. Validate and test them before saving. Never access PouchDB, Cytoscape, application state, or secrets directly.",
    permissions: ["documents.read", "actors.run", "actors.create", "actors.edit"],
    actions: ["inspect", "create_actor", "test_actor", "repair_actor"],
    accepts: ["*"],
    outputs: ["actor"],
    autonomy: "bounded",
    review: "save-actor",
    retry: { maxAttempts: 3, backoffMs: 500 },
    budget: { maxCostUsd: 1, maxIterations: 12, maxToolCalls: 30, maxRuntimeMs: 600_000 }
  },
  {
    id: "supervisor",
    name: "Supervisor",
    instructions: "Drive a bounded run, measure progress, stop on loops or budget limits, and request approval when required.",
    permissions: ["documents.read", "graph.read", "actors.run", "targets.read"],
    actions: ["inspect", "plan", "delegate", "pause", "stop", "recover"],
    accepts: ["*"],
    outputs: ["run-summary"],
    autonomy: "supervised",
    review: "mutations",
    retry: { maxAttempts: 3, backoffMs: 1_500 },
    budget: { maxCostUsd: 2, maxIterations: 25, maxToolCalls: 75, maxRuntimeMs: 1_200_000 }
  },
  {
    id: "recovery",
    name: "Recovery agent",
    instructions: "Inspect the failed step, choose one bounded recovery action, and avoid unchanged retries.",
    permissions: ["documents.read", "graph.read", "actors.run", "targets.read"],
    actions: ["inspect", "retry", "restore", "shrink-context", "fallback-model", "pause", "stop"],
    accepts: ["*"],
    outputs: ["recovery-action"],
    autonomy: "supervised",
    review: "always",
    retry: { maxAttempts: 2, backoffMs: 2_000 },
    budget: { maxCostUsd: 0.5, maxIterations: 5, maxToolCalls: 10, maxRuntimeMs: 300_000 }
  }
]);

const PREFIX = "agent-system:";
const INDEX_ID = `${PREFIX}index`;

function now() {
  return new Date().toISOString();
}

function cleanId(value, label = "ID") {
  const id = String(value || "").trim();
  if (!id) throw new TypeError(`${label} is required`);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)) throw new TypeError(`${label} contains invalid characters`);
  return id;
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function recordId(type, id) {
  return `${PREFIX}${type}:${cleanId(id)}`;
}

function stripPouchFields(record) {
  const result = clone(record);
  delete result._rev;
  return result;
}

export function normalizeAgentRecord(record, expectedType) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Agent record must be an object");
  }
  const type = String(record.recordType || expectedType || "");
  if (!Object.values(AGENT_RECORD_TYPES).includes(type)) throw new TypeError(`Unknown agent record type: ${type || "<missing>"}`);
  if (expectedType && type !== expectedType) throw new TypeError(`Expected ${expectedType}, received ${type}`);
  const id = cleanId(record.id);
  return {
    ...clone(record),
    _id: recordId(type, id),
    id,
    recordType: type,
    schemaVersion: AGENT_SCHEMA_VERSION,
    createdAt: record.createdAt || now(),
    updatedAt: now()
  };
}

export function normalizeRole(input) {
  const role = normalizeAgentRecord({
    ...input,
    id: input.id,
    recordType: AGENT_RECORD_TYPES.role
  }, AGENT_RECORD_TYPES.role);
  role.name = String(input.name || "").trim();
  role.instructions = String(input.instructions || "").trim();
  role.permissions = [...new Set((input.permissions || []).map(String))];
  role.actions = [...new Set((input.actions || []).map(String))];
  role.accepts = [...new Set((input.accepts || ["*"]).map(String))];
  role.outputs = [...new Set((input.outputs || []).map(String))];
  if (!role.name) throw new TypeError("Role name is required");
  for (const permission of role.permissions) {
    if (!AGENT_PERMISSIONS.includes(permission)) throw new TypeError(`Unknown permission: ${permission}`);
  }
  return role;
}

export function normalizeAgent(input) {
  const agent = normalizeAgentRecord({
    ...input,
    recordType: AGENT_RECORD_TYPES.agent
  }, AGENT_RECORD_TYPES.agent);
  agent.name = String(input.name || "").trim();
  agent.description = String(input.description || "").trim();
  agent.roleId = cleanId(input.roleId || "researcher", "Role ID");
  agent.systemPrompt = String(input.systemPrompt || "").trim();
  agent.providerId = cleanId(input.providerId || "openrouter", "Provider ID");
  agent.modelId = String(input.modelId || "").trim();
  agent.permissions = [...new Set((input.permissions || []).map(String))];
  agent.datasetAccess = [...new Set((input.datasetAccess || ["*"]).map(String))];
  agent.graphAccess = [...new Set((input.graphAccess || ["*"]).map(String))];
  agent.targetAccess = [...new Set((input.targetAccess || ["*"]).map(String))];
  agent.actorAccess = [...new Set((input.actorAccess || ["*"]).map(String))];
  agent.enabled = input.enabled !== false;
  agent.loop = {
    maxIterations: 20,
    maxRuntimeMs: 900_000,
    maxToolCalls: 60,
    maxTokens: 200_000,
    maxConsecutiveFailures: 3,
    maxRepeatedActions: 3,
    maxRepeatedResults: 3,
    ...input.loop
  };
  agent.recovery = {
    retries: 3,
    backoffMs: 1_000,
    smallerContext: true,
    fallbackModelId: "",
    ...input.recovery
  };
  agent.memory = {
    run: true,
    agent: true,
    target: true,
    dataset: false,
    ...input.memory
  };
  agent.budget = {
    maxCostUsd: 2,
    dailyCostUsd: 10,
    monthlyCostUsd: 100,
    maxInputTokens: 150_000,
    maxOutputTokens: 50_000,
    maxToolCalls: agent.loop.maxToolCalls,
    maxIterations: agent.loop.maxIterations,
    maxRuntimeMs: agent.loop.maxRuntimeMs,
    softLimitRatio: 0.8,
    ...input.budget
  };
  if (!agent.name) throw new TypeError("Agent name is required");
  if (!agent.modelId) throw new TypeError("Model is required");
  for (const permission of agent.permissions) {
    if (!AGENT_PERMISSIONS.includes(permission)) throw new TypeError(`Unknown permission: ${permission}`);
  }
  return agent;
}

async function updateIndex(record) {
  const index = await getState(INDEX_ID, {
    _id: INDEX_ID,
    schemaVersion: AGENT_SCHEMA_VERSION,
    records: {}
  });
  const records = { ...(index.records || {}) };
  records[record._id] = {
    id: record.id,
    recordType: record.recordType,
    updatedAt: record.updatedAt
  };
  await putState(INDEX_ID, { schemaVersion: AGENT_SCHEMA_VERSION, records });
}

export async function saveAgentRecord(input, expectedType) {
  const record = normalizeAgentRecord(input, expectedType);
  const stored = await putState(record._id, stripPouchFields(record));
  await updateIndex(stored);
  return stripPouchFields(stored);
}

export async function saveAgent(input) {
  return saveAgentRecord(normalizeAgent(input), AGENT_RECORD_TYPES.agent);
}

export async function saveRole(input) {
  return saveAgentRecord(normalizeRole(input), AGENT_RECORD_TYPES.role);
}

export async function getAgentRecord(type, id) {
  const record = await getState(recordId(type, id), null);
  return record ? stripPouchFields(record) : null;
}

export async function listAgentRecords(type) {
  const index = await getState(INDEX_ID, { records: {} });
  const ids = Object.entries(index.records || {})
    .filter(([, item]) => !type || item.recordType === type)
    .map(([id]) => id);
  if (!ids.length) return [];
  const result = await stateDb.allDocs({ keys: ids, include_docs: true });
  return result.rows
    .map((row) => row.doc)
    .filter(Boolean)
    .map(stripPouchFields)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export async function removeAgentRecord(type, id) {
  const key = recordId(type, id);
  const current = await getState(key, null);
  if (!current) return false;
  await stateDb.remove(current);
  const index = await getState(INDEX_ID, { records: {} });
  const records = { ...(index.records || {}) };
  delete records[key];
  await putState(INDEX_ID, { schemaVersion: AGENT_SCHEMA_VERSION, records });
  return true;
}

export async function ensureDefaultRoles() {
  const existing = new Set((await listAgentRecords(AGENT_RECORD_TYPES.role)).map((role) => role.id));
  for (const role of DEFAULT_ROLES) {
    if (!existing.has(role.id)) await saveRole(role);
  }
  return listAgentRecords(AGENT_RECORD_TYPES.role);
}

export async function exportAgentSystemRecords({ includeRuns = false } = {}) {
  const allowed = new Set([
    AGENT_RECORD_TYPES.agent,
    AGENT_RECORD_TYPES.role,
    AGENT_RECORD_TYPES.provider,
    AGENT_RECORD_TYPES.model,
    AGENT_RECORD_TYPES.budget
  ]);
  if (includeRuns) {
    [
      AGENT_RECORD_TYPES.run,
      AGENT_RECORD_TYPES.step,
      AGENT_RECORD_TYPES.checkpoint,
      AGENT_RECORD_TYPES.cost,
      AGENT_RECORD_TYPES.toolCall,
      AGENT_RECORD_TYPES.loopEvent,
      AGENT_RECORD_TYPES.recoveryEvent,
      AGENT_RECORD_TYPES.memory
    ].forEach((type) => allowed.add(type));
  }
  const records = (await listAgentRecords()).filter((record) => allowed.has(record.recordType));
  return {
    format: "quasar-agent-system",
    version: AGENT_SCHEMA_VERSION,
    exportedAt: now(),
    secretsIncluded: false,
    records: records.map(({ secret, apiKey, ...record }) => record)
  };
}

export async function importAgentSystemRecords(payload, { replace = false } = {}) {
  if (payload?.format !== "quasar-agent-system" || !Array.isArray(payload.records)) {
    throw new TypeError("Invalid Quasar agent export");
  }
  const conflicts = [];
  const staged = [];
  for (const input of payload.records) {
    if ("secret" in input || "apiKey" in input) throw new TypeError("Imported records cannot contain secrets");
    const record = input.recordType === AGENT_RECORD_TYPES.agent
      ? normalizeAgent(input)
      : input.recordType === AGENT_RECORD_TYPES.role
        ? normalizeRole(input)
        : normalizeAgentRecord(input);
    const existing = await getState(record._id, null);
    if (existing && !replace) conflicts.push({ id: record.id, recordType: record.recordType });
    else staged.push(record);
  }
  if (conflicts.length) return { applied: 0, conflicts };
  for (const record of staged) await saveAgentRecord(record, record.recordType);
  return { applied: staged.length, conflicts: [] };
}
