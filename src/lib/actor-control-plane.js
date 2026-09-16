import { starIntelRequest } from "./starintel-server";

export const ACTOR_CONFIGURATION_SCHEMA = "0.9.1.2";

async function actorRequest(configuration, path, options = {}) {
  try {
    return await starIntelRequest(configuration, `/v1${path}`, options);
  } catch (error) {
    if (!/404|not found/i.test(error.message)) throw error;
    return starIntelRequest(configuration, `/api/v1${path}`, options);
  }
}

function collection(body, ...keys) {
  if (Array.isArray(body)) return body;
  for (const key of keys) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

function actorId(actor) {
  return String(actor?.id || actor?.actor_id || actor?.actorId || actor?.name || "").trim();
}

export function normalizeServerActor(actor) {
  const id = actorId(actor);
  if (!id) throw new TypeError("Server actor ID is required");
  const tenantId = actor.tenant_id || actor.tenantId || actor.tenant || "shared";
  return {
    ...actor,
    id,
    label: actor.label || actor.display_name || actor.displayName || id,
    description: actor.description || "Server-managed actor",
    tenantId,
    scope: actor.scope || actor.visibility || (tenantId === "shared" ? "shared" : "tenant"),
    status: actor.status || (actor.enabled === false ? "disabled" : "available"),
    capabilities: Array.isArray(actor.capabilities) ? actor.capabilities : [],
    remote: true
  };
}

export function normalizeActorConfiguration(body, actor) {
  const record = body?.actor_config || body?.actorConfig || body?.config || body || {};
  const configuration = record.configuration || record.settings || record.values || {};
  return {
    id: record.id || record._id || `actor-config:${actor.id}`,
    actorId: record.actor_id || record.actorId || actor.id,
    tenantId: record.tenant_id || record.tenantId || actor.tenantId,
    enabled: record.enabled !== false,
    schemaVersion: record.schema_version || record.schemaVersion || ACTOR_CONFIGURATION_SCHEMA,
    configuration: configuration && typeof configuration === "object" ? configuration : {},
    revision: record.revision || record._rev || ""
  };
}

export function normalizeActorKey(key) {
  return {
    ...key,
    id: String(key.id || key.key_id || key.keyId || ""),
    actorId: key.actor_id || key.actorId || "",
    name: key.name || key.label || "Actor key",
    mode: key.mode || key.kind || (key.one_run ? "one_run" : "persistent"),
    status: key.status || (key.revoked ? "revoked" : "active"),
    createdAt: key.created_at || key.createdAt || "",
    expiresAt: key.expires_at || key.expiresAt || ""
  };
}

export function normalizeActorQuota(quota) {
  const limit = Number(quota.limit ?? quota.max_runs ?? quota.maxRuns ?? 0);
  const used = Number(quota.used ?? quota.runs_used ?? quota.runsUsed ?? 0);
  const remaining = Number(quota.remaining ?? Math.max(0, limit - used));
  const normalizePeriod = (period, fallback = {}) => ({
    limit: period?.limit == null ? (fallback.limit ?? null) : Number(period.limit),
    used: Number(period?.used ?? fallback.used ?? 0),
    remaining: period?.remaining == null ? (fallback.remaining ?? null) : Number(period.remaining),
    resetAt: period?.reset_at || period?.resetAt || fallback.resetAt || "",
    unlimited: period?.unlimited === true || period?.contract_unlimited === true
  });
  return {
    ...quota,
    id: quota.id || quota.key_id || quota.keyId || quota.actor_id || quota.actorId || "quota",
    actorId: quota.actor_id || quota.actorId || "",
    keyId: quota.key_id || quota.keyId || "",
    tenantId: quota.tenant_id || quota.tenantId || "",
    plan: quota.plan || quota.group || "custom",
    policySchema: quota.policy_schema || quota.policySchema || "starintel.biz.runtime-policy/v1",
    limit,
    used,
    remaining,
    window: quota.window || quota.period || "lifetime",
    resetsAt: quota.resets_at || quota.resetsAt || "",
    perSecond: normalizePeriod(
      quota.requests_per_second || quota.requestsPerSecond || quota.per_second || quota.perSecond
    ),
    monthly: normalizePeriod(quota.requests_per_month || quota.requestsPerMonth || quota.monthly)
  };
}

export async function listServerActors(configuration, options = {}) {
  const body = await actorRequest(configuration, "/actors", {
    signal: options.signal
  });
  return collection(body, "actors", "items", "results").map(normalizeServerActor);
}

export async function getActorConfiguration(configuration, actor, options = {}) {
  const body = await actorRequest(configuration, `/actor-configs/${encodeURIComponent(actor.id)}`, {
    signal: options.signal
  });
  return normalizeActorConfiguration(body, actor);
}

export async function saveActorConfiguration(configuration, actor, value, options = {}) {
  const body = await actorRequest(configuration, `/actor-configs/${encodeURIComponent(actor.id)}`, {
    method: "PUT",
    signal: options.signal,
    body: JSON.stringify({
      schema_version: ACTOR_CONFIGURATION_SCHEMA,
      doctype: "actor-config",
      actor_id: actor.id,
      enabled: value.enabled !== false,
      configuration: value.configuration || {}
    })
  });
  return normalizeActorConfiguration(body, actor);
}

export function startServerActor(configuration, actor, payload = {}, options = {}) {
  return actorRequest(configuration, `/actors/${encodeURIComponent(actor.id)}/runs`, {
    method: "POST",
    signal: options.signal,
    body: JSON.stringify(payload)
  });
}

export async function listActorKeys(configuration, actorId, options = {}) {
  const query = new URLSearchParams({ actor_id: actorId });
  const body = await actorRequest(configuration, `/actor-keys?${query}`, {
    signal: options.signal
  });
  return collection(body, "keys", "actor_keys", "items", "results").map(normalizeActorKey);
}

export async function createActorKey(configuration, value, options = {}) {
  const body = await actorRequest(configuration, "/actor-keys", {
    method: "POST",
    signal: options.signal,
    body: JSON.stringify({
      actor_id: value.actorId,
      name: value.name,
      mode: value.mode,
      quota: value.quota
    })
  });
  const record = body?.key || body?.actor_key || body;
  return {
    key: normalizeActorKey(record || {}),
    secret: String(body?.secret || body?.token || record?.secret || record?.token || "")
  };
}

export function revokeActorKey(configuration, keyId, options = {}) {
  return actorRequest(configuration, `/actor-keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
    signal: options.signal
  });
}

export async function listActorQuotas(configuration, actorId, options = {}) {
  const query = new URLSearchParams({ actor_id: actorId });
  const body = await actorRequest(configuration, `/actor-quotas?${query}`, {
    signal: options.signal
  });
  return collection(body, "quotas", "items", "results").map(normalizeActorQuota);
}
