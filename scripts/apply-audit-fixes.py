#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(text: str, before: str, after: str, label: str) -> str:
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(before, after, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return next_text


# Remove the racy secondary index. Agent records are already prefix-addressable.
path = "src/lib/agent-records.js"
text = read(path)
text = text.replace('const INDEX_ID = `${PREFIX}index`;\n', "")
text = regex_once(
    text,
    r"async function updateIndex\(record\) \{.*?export async function ensureDefaultRoles\(\) \{",
    '''export async function saveAgentRecord(input, expectedType) {
  const record = normalizeAgentRecord(input, expectedType);
  const stored = await putState(record._id, stripPouchFields(record));
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
  const result = await stateDb.allDocs({
    startkey: PREFIX,
    endkey: `${PREFIX}\\ufff0`,
    include_docs: true
  });
  return result.rows
    .map((row) => row.doc)
    .filter(Boolean)
    .filter((record) => !type || record.recordType === type)
    .map(stripPouchFields)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export async function removeAgentRecord(type, id) {
  const key = recordId(type, id);
  const current = await getState(key, null);
  if (!current) return false;
  await stateDb.remove(current);
  return true;
}

export async function ensureDefaultRoles() {''',
    "agent record index replacement"
)
write(path, text)

# Harden provider URLs and prevent user/imported headers from replacing credentials.
path = "src/lib/provider-adapters.js"
text = read(path)
text = replace_once(
    text,
    'const PROVIDER_TYPES = new Set(["openrouter", "openai", "anthropic", "openai-compatible", "local"]);',
    '''const PROVIDER_TYPES = new Set(["openrouter", "openai", "anthropic", "openai-compatible", "local"]);
const PROTECTED_PROVIDER_ENDPOINTS = Object.freeze({
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  local: "http://localhost:11434/v1"
});
const FORBIDDEN_CONFIG_HEADER = /^(?:authorization|proxy-|host$|cookie$|set-cookie$|origin$|referer$|sec-|x-api-key$)/i;''',
    "provider constants"
)
text = replace_once(
    text,
    '''function normalizeBaseUrl(value) {
  return requiredString(value, "Provider base URL").replace(/\/+$/, "");
}''',
    '''function normalizeBaseUrl(value) {
  const url = new URL(requiredString(value, "Provider base URL"));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("Provider URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new TypeError("Provider URL cannot contain embedded credentials");
  }
  const loopback = url.hostname === "localhost"
    || url.hostname === "::1"
    || /^127\\./.test(url.hostname);
  if (url.protocol !== "https:" && !loopback) {
    throw new TypeError("Provider URL must use HTTPS unless it targets loopback");
  }
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/+$/, "");
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => {
    const normalized = String(name || "").trim();
    if (!normalized || FORBIDDEN_CONFIG_HEADER.test(normalized)) {
      throw new TypeError(`Provider header is not allowed: ${normalized || "<empty>"}`);
    }
    return [normalized, String(value)];
  }));
}''',
    "provider URL validation"
)
text = replace_once(
    text,
    '''  const headers = {
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    ...(config.headers || {})
  };''',
    '''  const headers = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
    ...(secret ? { Authorization: `Bearer ${secret}` } : {})
  };''',
    "provider header precedence"
)
text = regex_once(
    text,
    r"export function normalizeProviderConfig\(input\) \{.*?\n\}",
    '''export function normalizeProviderConfig(input) {
  const type = requiredString(input.type, "Provider type");
  if (!PROVIDER_TYPES.has(type)) throw new TypeError(`Unsupported provider type: ${type}`);
  const id = requiredString(input.id, "Provider ID");
  const rawBaseUrl = String(input.baseUrl || "").trim();
  const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : "";
  const protectedEndpoint = PROTECTED_PROVIDER_ENDPOINTS[id];
  if (protectedEndpoint && baseUrl !== protectedEndpoint) {
    throw new TypeError(`${id} must use its built-in reviewed endpoint`);
  }
  return {
    id,
    name: requiredString(input.name || input.id, "Provider name"),
    type,
    baseUrl,
    requiresKey: input.requiresKey !== false && type !== "local",
    enabled: input.enabled !== false,
    headers: sanitizeHeaders(input.headers)
  };
}''',
    "provider config normalization"
)
write(path, text)

# Bind credentials to provider/MCP endpoints, fail closed on unknown pricing, and use the fetch gateway.
path = "src/components/AgentSystem.jsx"
text = read(path)
text = replace_once(
    text,
    'import { getProviderSecret, hasProviderSecret, setProviderSecret } from "../lib/agent-secrets";',
    'import { deleteProviderSecret, getProviderSecret, hasProviderSecret, setProviderSecret } from "../lib/agent-secrets";',
    "agent secret imports"
)
text = replace_once(
    text,
    '''  const quasarRef = useRef(quasar);
  quasarRef.current = quasar;''',
    '''  const quasarRef = useRef(quasar);
  const providersRef = useRef(providers);
  quasarRef.current = quasar;
  providersRef.current = providers;''',
    "provider ref"
)
text = replace_once(
    text,
    '''    fetchUrl(url) {
      return fetchUrlContent(url);
    },
    scrapeWebsite(args) {
      return scrapeWebsite(args.url, {
        maxPages: args.maxPages,
        maxDepth: args.maxDepth,
        sameOrigin: args.sameOrigin
      });
    },''',
    '''    fetchUrl(url) {
      const settings = quasarRef.current.settings || {};
      return fetchUrlContent(url, {
        gatewayUrl: settings.webFetchGatewayUrl,
        gatewayToken: getProviderSecret("web-fetch-gateway", {
          type: "web-fetch-gateway",
          url: settings.webFetchGatewayUrl
        })
      });
    },
    scrapeWebsite(args) {
      const settings = quasarRef.current.settings || {};
      return scrapeWebsite(args.url, {
        maxPages: args.maxPages,
        maxDepth: args.maxDepth,
        sameOrigin: args.sameOrigin,
        gatewayUrl: settings.webFetchGatewayUrl,
        gatewayToken: getProviderSecret("web-fetch-gateway", {
          type: "web-fetch-gateway",
          url: settings.webFetchGatewayUrl
        })
      });
    },''',
    "agent fetch gateway"
)
text = text.replace('getProviderSecret(`mcp:${serverId}`)', 'getProviderSecret(`mcp:${serverId}`, server)')
text = text.replace('createProviderAdapter(provider, getProviderSecret(provider.id))', 'createProviderAdapter(provider, getProviderSecret(provider.id, provider))')
text = replace_once(
    text,
    '''    pricingFor: (_providerId, modelId) => {
      const configured = quasarRef.current.settings?.agentModelPricing?.[modelId];
      return configured || { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0 };
    },''',
    '''    pricingFor: (providerId, modelId) => {
      const configured = quasarRef.current.settings?.agentModelPricing?.[modelId];
      if (configured) return { ...configured, known: true };
      const provider = providersRef.current.find((candidate) => candidate.id === providerId);
      if (provider?.type === "local") return { known: true, free: true };
      return { known: false };
    },''',
    "pricing fail closed"
)
text = text.replace('setProviderSecret(`mcp:${saved.id}`, secret)', 'setProviderSecret(`mcp:${saved.id}`, secret, saved)')
text = text.replace('testMcpServer(server, secret || getProviderSecret(`mcp:${server.id}`))', 'testMcpServer(server, secret || getProviderSecret(`mcp:${server.id}`, server))')
text = replace_once(
    text,
    '''    saveProvider: async (provider, secret) => {
      const normalized = normalizeProviderConfig(provider);
      const saved = await saveAgentRecord({
        ...normalized,
        recordType: AGENT_RECORD_TYPES.provider
      }, AGENT_RECORD_TYPES.provider);
      if (secret) setProviderSecret(saved.id, secret);
      await refresh();
      return saved;
    },
    testProvider: (provider, secret) => testProviderConnection(provider, secret || getProviderSecret(provider.id)),''',
    '''    saveProvider: async (provider, secret) => {
      const normalized = normalizeProviderConfig(provider);
      const existing = await getAgentRecord(AGENT_RECORD_TYPES.provider, normalized.id);
      if (existing && (existing.baseUrl !== normalized.baseUrl || existing.type !== normalized.type)) {
        deleteProviderSecret(normalized.id);
      }
      const saved = await saveAgentRecord({
        ...normalized,
        recordType: AGENT_RECORD_TYPES.provider
      }, AGENT_RECORD_TYPES.provider);
      if (secret) setProviderSecret(saved.id, secret, saved);
      await refresh();
      return saved;
    },
    testProvider: (provider, secret) => testProviderConnection(
      provider,
      secret || getProviderSecret(provider.id, provider)
    ),''',
    "provider save scope"
)
text = text.replace('system.hasProviderSecret(provider.id)', 'system.hasProviderSecret(provider.id, provider)')
text = replace_once(
    text,
    '''    const availableCost = Math.min(
      Number(activeAgent.budget?.maxCostUsd || Infinity),
      Math.max(0, Number(activeAgent.budget?.dailyCostUsd || Infinity) - dailySpent),
      Math.max(0, Number(activeAgent.budget?.monthlyCostUsd || Infinity) - monthlySpent)
    );''',
    '''    const numericBudget = (value) => value === undefined || value === null || value === ""
      ? Number.POSITIVE_INFINITY
      : Number(value);
    const availableCost = Math.min(
      numericBudget(activeAgent.budget?.maxCostUsd),
      Math.max(0, numericBudget(activeAgent.budget?.dailyCostUsd) - dailySpent),
      Math.max(0, numericBudget(activeAgent.budget?.monthlyCostUsd) - monthlySpent)
    );''',
    "zero budget preservation"
)
write(path, text)

# Require an explicit trusted caller for the current same-origin worker and bound its network service.
path = "src/lib/actors.js"
text = read(path)
text = replace_once(
    text,
    '''async function networkFetchService(payload, { signal }) {
  const url = new URL(String(payload?.url || payload || ""));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Actor network.fetch rejects ${url.protocol || "unknown"} URLs`);
  }
  const options = payload?.options && typeof payload.options === "object" ? payload.options : {};
  const response = await fetch(url.href, {
    method: String(options.method || "GET").toUpperCase(),
    headers: options.headers || {},
    body: options.body,
    credentials: "omit",
    redirect: "follow",
    signal
  });
  const responseType = payload?.responseType === "json" ? "json" : "text";
  const body = responseType === "json" ? await response.json() : await response.text();
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers: Object.fromEntries(response.headers.entries()),
    body
  };
}''',
    '''const ACTOR_RESPONSE_LIMIT = 1_048_576;
const FORBIDDEN_ACTOR_HEADER = /^(?:authorization|cookie|proxy-|sec-|host$|origin$|referer$|x-api-key$)/i;

function assertLiteralPublicHost(url) {
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost"
    || host === "0.0.0.0"
    || host === "::1"
    || host.endsWith(".local")
    || /^127\\./.test(host)
    || /^10\\./.test(host)
    || /^192\\.168\\./.test(host)
    || /^169\\.254\\./.test(host)
    || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host)
  ) throw new Error("Actor network.fetch blocks private network URLs");
}

async function readBoundedActorBody(response, signal) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let total = 0;
  for (;;) {
    if (signal?.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ACTOR_RESPONSE_LIMIT) {
      await reader.cancel("Actor response limit exceeded");
      throw new RangeError(`Actor response exceeds ${ACTOR_RESPONSE_LIMIT} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function networkFetchService(payload, { signal }) {
  const url = new URL(String(payload?.url || payload || ""));
  if (url.protocol !== "https:") throw new Error("Actor network.fetch requires HTTPS");
  assertLiteralPublicHost(url);
  const options = payload?.options && typeof payload.options === "object" ? payload.options : {};
  const method = String(options.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) throw new Error(`Actor network.fetch rejects ${method}`);
  const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([name, value]) => {
    if (FORBIDDEN_ACTOR_HEADER.test(name)) throw new Error(`Actor request header denied: ${name}`);
    return [name, String(value)];
  }));
  const response = await fetch(url.href, {
    method,
    headers,
    credentials: "omit",
    redirect: "error",
    signal
  });
  const bytes = await readBoundedActorBody(response, signal);
  const raw = new TextDecoder().decode(bytes);
  const responseType = payload?.responseType === "json" ? "json" : "text";
  const body = responseType === "json" && raw ? JSON.parse(raw) : raw;
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers: Object.fromEntries(response.headers.entries()),
    body
  };
}''',
    "bounded actor network"
)
text = replace_once(
    text,
    '''export async function runBrowserActor(manifest, context, {
  timeout = DEFAULT_ACTOR_TIMEOUT_MS,
  signal,
  onEvent
} = {}) {
  const actor = normalizeActorManifest(manifest);''',
    '''export async function runBrowserActor(manifest, context, {
  timeout = DEFAULT_ACTOR_TIMEOUT_MS,
  signal,
  onEvent,
  trusted = false
} = {}) {
  if (!trusted) {
    throw new Error("Custom browser actor execution is disabled until the opaque-origin sandbox is available");
  }
  const actor = normalizeActorManifest(manifest);''',
    "trusted actor gate"
)
write(path, text)

path = "src/store.jsx"
text = read(path)
text = replace_once(
    text,
    '''      { signal: runOptions.signal }
    );''',
    '''      {
        signal: runOptions.signal,
        trusted: isBuiltinActor(actor)
      }
    );''',
    "store trusted actor flag"
)
write(path, text)

# Route arbitrary web fetches through a configured gateway instead of browser fetch.
path = "src/lib/agent-web.js"
text = read(path)
text = replace_once(
    text,
    '''export async function fetchUrlContent(value, { signal, maxBytes = MAX_CONTENT_BYTES } = {}) {
  const url = publicHttpUrl(value);
  const response = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.1" }
  });
  if (!response.ok) throw new Error(`URL fetch failed (${response.status})`);
  const finalUrl = publicHttpUrl(response.url || url.href);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new RangeError(`URL content exceeds ${maxBytes} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new RangeError(`URL content exceeds ${maxBytes} bytes`);
  const contentType = response.headers.get("content-type") || "";
  const raw = new TextDecoder().decode(bytes);
  const parsed = /html|xhtml/i.test(contentType) ? htmlText(raw, finalUrl.href) : {
    title: "",
    description: "",
    text: raw,
    links: []
  };
  return {
    requestedUrl: url.href,
    finalUrl: finalUrl.href,
    contentType,
    bytes: bytes.byteLength,
    title: parsed.title,
    description: parsed.description,
    text: parsed.text.slice(0, MAX_TEXT_LENGTH),
    truncated: parsed.text.length > MAX_TEXT_LENGTH,
    links: parsed.links.slice(0, 500)
  };
}''',
    '''function gatewayEndpoint(value) {
  if (!value) throw new Error("A trusted web fetch gateway must be configured");
  const url = new URL(String(value));
  const loopback = url.hostname === "localhost" || url.hostname === "::1" || /^127\\./.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Web fetch gateway must use HTTPS unless it targets loopback");
  }
  url.username = "";
  url.password = "";
  return url;
}

export async function fetchUrlContent(value, {
  signal,
  maxBytes = MAX_CONTENT_BYTES,
  gatewayUrl,
  gatewayToken = ""
} = {}) {
  const requested = publicHttpUrl(value);
  const gateway = gatewayEndpoint(gatewayUrl);
  const response = await fetch(gateway, {
    method: "POST",
    credentials: "omit",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {})
    },
    body: JSON.stringify({ url: requested.href, maxBytes: Math.min(MAX_CONTENT_BYTES, maxBytes) })
  });
  if (!response.ok) throw new Error(`Web fetch gateway failed (${response.status})`);
  const payload = await response.json();
  const finalUrl = publicHttpUrl(payload.finalUrl || requested.href);
  const bytes = Number(payload.bytes || 0);
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > maxBytes) {
    throw new RangeError(`URL content exceeds ${maxBytes} bytes`);
  }
  return {
    requestedUrl: requested.href,
    finalUrl: finalUrl.href,
    contentType: String(payload.contentType || ""),
    bytes,
    title: String(payload.title || ""),
    description: String(payload.description || ""),
    text: String(payload.text || "").slice(0, MAX_TEXT_LENGTH),
    truncated: Boolean(payload.truncated) || String(payload.text || "").length > MAX_TEXT_LENGTH,
    links: (Array.isArray(payload.links) ? payload.links : [])
      .map((url) => publicHttpUrl(url).href)
      .slice(0, 500)
  };
}''',
    "web gateway"
)
text = replace_once(
    text,
    '''  sameOrigin = true
} = {}) {''',
    '''  sameOrigin = true,
  gatewayUrl,
  gatewayToken = ""
} = {}) {''',
    "scrape gateway options"
)
text = replace_once(
    text,
    '''      const page = await fetchUrlContent(next.url, {
        signal,
        maxBytes: Math.min(MAX_CONTENT_BYTES, byteLimit - totalBytes)
      });''',
    '''      const page = await fetchUrlContent(next.url, {
        signal,
        maxBytes: Math.min(MAX_CONTENT_BYTES, byteLimit - totalBytes),
        gatewayUrl,
        gatewayToken
      });''',
    "scrape gateway forwarding"
)
write(path, text)

# Surface best-effort rollback survivors as a hard repair-required error.
path = "src/lib/document-batch.js"
text = read(path)
text = replace_once(
    text,
    'import { assertDocument } from "starintel_doc";\n',
    '''import { assertDocument } from "starintel_doc";

export class PartialBatchCommitError extends Error {
  constructor(report) {
    super(`Batch rollback left ${report.saved.length} surviving document write(s)`);
    this.name = "PartialBatchCommitError";
    this.code = "PARTIAL_BATCH_COMMIT";
    this.report = report;
    this.applied = report;
  }
}
''',
    "partial batch error"
)
text = replace_once(
    text,
    '''    return {
      saved: rollback.surviving,
      skipped,
      errors: [...preflight.errors, ...writeErrors, ...rollback.errors],
      atomic,
      rolledBack: rollback.rolledBack
    };''',
    '''    const report = {
      saved: rollback.surviving,
      skipped,
      errors: [...preflight.errors, ...writeErrors, ...rollback.errors],
      atomic: false,
      rollbackAttempted: true,
      rolledBack: rollback.rolledBack
    };
    if (rollback.surviving.length) throw new PartialBatchCommitError(report);
    return report;''',
    "partial batch throw"
)
write(path, text)

# Add bounded streaming JSONL parsing and hard import limits.
path = "src/lib/importer.js"
text = read(path)
text = replace_once(
    text,
    '''export const validatorInfo = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  schemaRevision: SCHEMA_REVISION,
  schemaUri: SCHEMA_URI,
  profile: SCHEMA_PROFILE,
  profileVersion: SCHEMA_PROFILE_VERSION
});''',
    '''export const validatorInfo = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  schemaRevision: SCHEMA_REVISION,
  schemaUri: SCHEMA_URI,
  profile: SCHEMA_PROFILE,
  profileVersion: SCHEMA_PROFILE_VERSION
});

export const IMPORT_LIMITS = Object.freeze({
  maxFiles: 256,
  maxTotalBytes: 1_073_741_824,
  maxFileBytes: 536_870_912,
  maxRecordBytes: 8_388_608,
  maxDocuments: 1_000_000,
  maxErrors: 1_000
});''',
    "import limits"
)
text = regex_once(
    text,
    r"function parseJsonLines\(text, sourceName\) \{.*?\n\}",
    '''async function parseJsonLines(file, sourceName, limits) {
  const documents = [];
  const origins = [];
  const errors = [];
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let line = 0;
  try {
    for (;;) {
      const { value = "", done } = await reader.read();
      buffer += value;
      let boundary;
      while ((boundary = buffer.indexOf("\\n")) !== -1) {
        const raw = buffer.slice(0, boundary).replace(/\\r$/, "");
        buffer = buffer.slice(boundary + 1);
        line += 1;
        if (raw.length > limits.maxRecordBytes) throw new RangeError(`Record ${line} exceeds the import record limit`);
        if (!raw.trim()) continue;
        try {
          documents.push(JSON.parse(raw));
          origins.push({ file: sourceName, line, record: documents.length });
        } catch (error) {
          if (errors.length < limits.maxErrors) errors.push({ file: sourceName, line, message: error.message });
        }
        if (documents.length > limits.maxDocuments) throw new RangeError("Import document limit exceeded");
        if (documents.length % 500 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (buffer.length > limits.maxRecordBytes) throw new RangeError(`Record ${line + 1} exceeds the import record limit`);
      if (done) break;
    }
    if (buffer.trim()) {
      line += 1;
      documents.push(JSON.parse(buffer));
      origins.push({ file: sourceName, line, record: documents.length });
    }
  } finally {
    reader.releaseLock();
  }
  return { documents, origins, errors };
}''',
    "streaming JSONL parser"
)
text = replace_once(
    text,
    '''async function parseFile(file) {
  const text = await file.text();
  const kind = extension(file.name);
  if (["jsonl", "ndjson"].includes(kind)) return parseJsonLines(text, file.name);
  if (kind === "csv") return parseCsv(text, file.name);''',
    '''async function parseFile(file, limits) {
  const kind = extension(file.name);
  if (file.size > limits.maxFileBytes) throw new RangeError(`${file.name} exceeds the import file limit`);
  if (["jsonl", "ndjson"].includes(kind)) return parseJsonLines(file, file.name, limits);
  const text = await file.text();
  if (kind === "csv") return parseCsv(text, file.name);''',
    "bounded parseFile"
)
text = replace_once(
    text,
    '''export async function collectImportDocuments(fileList, options = {}) {
  const files = Array.from(fileList || []);
  const resolveManifestReferences = options.resolveManifestReferences === true;''',
    '''export async function collectImportDocuments(fileList, options = {}) {
  const files = Array.from(fileList || []);
  const limits = { ...IMPORT_LIMITS, ...(options.limits || {}) };
  if (files.length > limits.maxFiles) throw new RangeError(`Import file limit exceeded: ${limits.maxFiles}`);
  const totalBytes = files.reduce((total, file) => total + Number(file.size || 0), 0);
  if (totalBytes > limits.maxTotalBytes) throw new RangeError(`Import byte limit exceeded: ${limits.maxTotalBytes}`);
  const resolveManifestReferences = options.resolveManifestReferences === true;''',
    "collect import limits"
)
text = text.replace('const result = await parseFile(file);', 'const result = await parseFile(file, limits);')
write(path, text)

# Bound provider output tokens before the request and reject unknown remote pricing before incurring a charge.
path = "src/lib/agent-supervisor.js"
text = read(path)
text = replace_once(
    text,
    '''    const context = await this.contextFor(agent, run);
    const adapter = await this.adapterFor(agent);''',
    '''    const context = await this.contextFor(agent, run);
    if (run.pricingSnapshot?.known === false) {
      throw new Error(`Pricing is required before running ${run.modelId}`);
    }
    const remainingOutputTokens = Math.max(
      0,
      Number(run.budget.maxOutputTokens ?? 8_192) - Number(run.usage.outputTokens || 0)
    );
    if (remainingOutputTokens < 1) {
      return this.persist(transition(run, "budget-exhausted", "Output tokens limit reached"));
    }
    const adapter = await this.adapterFor(agent);''',
    "pre-request budget gate"
)
text = replace_once(
    text,
    '          maxTokens: Math.min(8_192, Number(run.budget.maxOutputTokens || 8_192)),',
    '          maxTokens: Math.min(8_192, remainingOutputTokens),',
    "remaining output token cap"
)
write(path, text)

# Tests for the directly changed budget and index behavior.
write("src/lib/agent-budget.test.js", '''import { describe, expect, it } from "vitest";
import { budgetState, calculateCost, remainingBudget } from "./agent-budget";

describe("agent budget fail-closed behavior", () => {
  it("treats an explicit zero limit as a hard stop", () => {
    expect(budgetState({ maxCostUsd: 0 }, {}, {}).state).toBe("hard-stop");
  });

  it("rejects unknown and implicit zero pricing", () => {
    expect(() => calculateCost({ inputTokens: 10 }, { known: false })).toThrow(/pricing/i);
    expect(() => calculateCost({ outputTokens: 10 }, {
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
      cachedInputPerMillionUsd: 0
    })).toThrow(/free/i);
  });

  it("allows explicitly free models", () => {
    expect(calculateCost({ inputTokens: 10, outputTokens: 20 }, { free: true })).toBe(0);
  });

  it("represents absent limits as unbounded", () => {
    expect(remainingBudget({}, {}).costUsd).toBe(Number.POSITIVE_INFINITY);
  });
});
''')

# Remove the one-shot applicator and workflow from the resulting branch commit.
Path("scripts/apply-audit-fixes.py").unlink(missing_ok=True)
Path(".github/workflows/apply-audit-fixes.yml").unlink(missing_ok=True)
