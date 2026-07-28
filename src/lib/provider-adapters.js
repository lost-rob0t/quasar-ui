const PROVIDER_TYPES = new Set(["openrouter", "openai", "anthropic", "openai-compatible", "local"]);
const STREAM_EVENT = "quasar:agent-provider-stream";

export class ProviderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProviderError";
    Object.assign(this, details);
  }
}

function requiredString(value, label) {
  const result = String(value || "").trim();
  if (!result) throw new TypeError(`${label} is required`);
  return result;
}

function normalizeBaseUrl(value) {
  return requiredString(value, "Provider base URL").replace(/\/+$/, "");
}

function parseRetryAfter(headers) {
  const value = headers?.get?.("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1_000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export function normalizeProviderError(error, response) {
  if (error?.name === "AbortError") {
    return new ProviderError("Provider request cancelled", { code: "cancelled", retryable: false });
  }
  if (response) {
    const status = response.status;
    return new ProviderError(
      status === 401 || status === 403
        ? "Provider rejected the key"
        : status === 429
          ? "Provider rate limit reached"
          : status >= 500
            ? "Provider is unavailable"
            : `Provider request failed (${status})`,
      {
        code: status === 429 ? "rate_limit" : status >= 500 ? "provider_unavailable" : "request_failed",
        status,
        retryable: status === 408 || status === 409 || status === 429 || status >= 500,
        retryAfterMs: parseRetryAfter(response.headers)
      }
    );
  }
  return new ProviderError(error?.message || "Provider request failed", {
    code: "network_error",
    retryable: true
  });
}

async function readJson(response) {
  const text = await response.text();
  if (!response.ok) throw normalizeProviderError(null, response);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ProviderError("Provider returned invalid JSON", {
      code: "invalid_response",
      retryable: true
    });
  }
}

function usageFromOpenAi(data) {
  const usage = data?.usage || {};
  return {
    inputTokens: Number(usage.prompt_tokens || usage.input_tokens || 0),
    outputTokens: Number(usage.completion_tokens || usage.output_tokens || 0),
    cachedTokens: Number(usage.prompt_tokens_details?.cached_tokens || usage.input_tokens_details?.cached_tokens || 0),
    exact: Boolean(data?.usage)
  };
}

function normalizedOpenAiResponse(data) {
  const message = data.choices?.[0]?.message;
  if (!message) throw new ProviderError("Provider response has no message", { code: "invalid_response", retryable: true });
  return {
    id: data.id || crypto.randomUUID(),
    text: message.content || "",
    toolCalls: (message.tool_calls || []).map((call) => ({
      id: call.id,
      name: call.function?.name,
      arguments: call.function?.arguments || "{}"
    })),
    finishReason: data.choices?.[0]?.finish_reason || null,
    usage: usageFromOpenAi(data),
    providerMessage: message,
    raw: data
  };
}

function normalizedAnthropicResponse(data) {
  return {
    id: data.id || crypto.randomUUID(),
    text: (data.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n"),
    toolCalls: (data.content || []).filter((part) => part.type === "tool_use").map((part) => ({
      id: part.id,
      name: part.name,
      arguments: JSON.stringify(part.input || {})
    })),
    finishReason: data.stop_reason || null,
    usage: {
      inputTokens: Number(data.usage?.input_tokens || 0),
      outputTokens: Number(data.usage?.output_tokens || 0),
      cachedTokens: Number(data.usage?.cache_read_input_tokens || 0),
      exact: Boolean(data.usage)
    },
    providerMessage: { role: "assistant", content: data.content || [] },
    raw: data
  };
}

function createStreamEmitter(request, provider) {
  const streamId = request.streamId || crypto.randomUUID();
  const emit = (type, detail = {}) => {
    const event = { streamId, provider, type, at: new Date().toISOString(), ...detail };
    request.onStreamEvent?.(event);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STREAM_EVENT, { detail: event }));
    return event;
  };
  emit("start", { model: request.model });
  return { streamId, emit };
}

async function readSse(response, onEvent) {
  if (!response.ok) throw normalizeProviderError(null, response);
  if (!response.body) throw new ProviderError("Provider streaming response has no body", { code: "invalid_response", retryable: true });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const processBlock = (block) => {
    const eventName = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (data) onEvent({ event: eventName, data });
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replaceAll("\r\n", "\n");
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) processBlock(block);
    if (done) break;
  }
  if (buffer.trim()) processBlock(buffer);
}

async function streamOpenAiResponse(response, request, emitter) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const normalized = normalizedOpenAiResponse(await readJson(response));
    if (normalized.text) emitter.emit("delta", { text: normalized.text });
    emitter.emit("complete", { usage: normalized.usage, finishReason: normalized.finishReason });
    return normalized;
  }
  let id = emitter.streamId;
  let text = "";
  let finishReason = null;
  let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, exact: false };
  const calls = [];
  await readSse(response, ({ data }) => {
    if (data === "[DONE]") return;
    let chunk;
    try { chunk = JSON.parse(data); } catch { throw new ProviderError("Provider returned invalid streaming JSON", { code: "invalid_response", retryable: true }); }
    id = chunk.id || id;
    if (chunk.usage) usage = usageFromOpenAi(chunk);
    const choice = chunk.choices?.[0];
    const delta = choice?.delta || {};
    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      emitter.emit("delta", { text: delta.content });
    }
    for (const partial of delta.tool_calls || []) {
      const index = Number(partial.index || 0);
      calls[index] ||= { id: partial.id || `tool:${index}`, name: "", arguments: "" };
      if (partial.id) calls[index].id = partial.id;
      if (partial.function?.name) calls[index].name += partial.function.name;
      if (partial.function?.arguments) calls[index].arguments += partial.function.arguments;
      emitter.emit("tool-delta", { index, toolCall: { ...calls[index] } });
    }
    finishReason = choice?.finish_reason || finishReason;
  });
  const toolCalls = calls.filter(Boolean).map((call) => ({ ...call, arguments: call.arguments || "{}" }));
  const providerMessage = {
    role: "assistant",
    content: text,
    ...(toolCalls.length ? {
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments }
      }))
    } : {})
  };
  const result = { id, text, toolCalls, finishReason, usage, providerMessage, raw: null };
  emitter.emit("complete", { usage, finishReason });
  return result;
}

async function streamAnthropicResponse(response, request, emitter) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const normalized = normalizedAnthropicResponse(await readJson(response));
    if (normalized.text) emitter.emit("delta", { text: normalized.text });
    emitter.emit("complete", { usage: normalized.usage, finishReason: normalized.finishReason });
    return normalized;
  }
  let id = emitter.streamId;
  let text = "";
  let finishReason = null;
  const usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, exact: false };
  const content = [];
  const toolJson = new Map();
  await readSse(response, ({ event, data }) => {
    let chunk;
    try { chunk = JSON.parse(data); } catch { throw new ProviderError("Provider returned invalid streaming JSON", { code: "invalid_response", retryable: true }); }
    if (event === "message_start") {
      id = chunk.message?.id || id;
      usage.inputTokens = Number(chunk.message?.usage?.input_tokens || 0);
      usage.cachedTokens = Number(chunk.message?.usage?.cache_read_input_tokens || 0);
      usage.exact = Boolean(chunk.message?.usage);
      return;
    }
    if (event === "content_block_start") {
      const index = Number(chunk.index || 0);
      content[index] = chunk.content_block || { type: "text", text: "" };
      if (content[index].type === "tool_use") toolJson.set(index, "");
      return;
    }
    if (event === "content_block_delta") {
      const index = Number(chunk.index || 0);
      if (chunk.delta?.type === "text_delta") {
        const deltaText = chunk.delta.text || "";
        text += deltaText;
        content[index] ||= { type: "text", text: "" };
        content[index].text = `${content[index].text || ""}${deltaText}`;
        emitter.emit("delta", { text: deltaText });
      }
      if (chunk.delta?.type === "input_json_delta") {
        const next = `${toolJson.get(index) || ""}${chunk.delta.partial_json || ""}`;
        toolJson.set(index, next);
        emitter.emit("tool-delta", { index, partialJson: chunk.delta.partial_json || "" });
      }
      return;
    }
    if (event === "message_delta") {
      finishReason = chunk.delta?.stop_reason || finishReason;
      usage.outputTokens = Number(chunk.usage?.output_tokens || usage.outputTokens);
      usage.exact = usage.exact || Boolean(chunk.usage);
    }
  });
  for (const [index, json] of toolJson) {
    try { content[index].input = json ? JSON.parse(json) : {}; } catch { content[index].input = {}; }
  }
  const toolCalls = content.filter((part) => part?.type === "tool_use").map((part) => ({
    id: part.id,
    name: part.name,
    arguments: JSON.stringify(part.input || {})
  }));
  const result = {
    id,
    text,
    toolCalls,
    finishReason,
    usage,
    providerMessage: { role: "assistant", content: content.filter(Boolean) },
    raw: null
  };
  emitter.emit("complete", { usage, finishReason });
  return result;
}

function openAiAdapter(config, secret) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const headers = {
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    ...(config.headers || {})
  };
  const requestBody = ({ model, messages, tools = [], toolChoice = "auto", maxTokens, temperature, stream = false }) => ({
    model,
    messages,
    ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {})
  });
  const adapter = {
    type: config.type,
    async listModels({ signal } = {}) {
      try {
        const data = await readJson(await fetch(`${baseUrl}/models`, { headers, signal }));
        return (data.data || data.models || []).map((model) => ({
          id: model.id || model.name,
          name: model.name || model.id,
          contextWindow: model.context_length || model.context_window || null
        }));
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw normalizeProviderError(error);
      }
    },
    async sendMessages(request) {
      return adapter.streamMessages(request);
    },
    async streamMessages(request) {
      const emitter = createStreamEmitter(request, config.type);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { ...headers, Accept: "text/event-stream" },
          signal: request.signal,
          body: JSON.stringify(requestBody({ ...request, stream: true }))
        });
        return await streamOpenAiResponse(response, request, emitter);
      } catch (error) {
        const normalized = error instanceof ProviderError ? error : normalizeProviderError(error);
        emitter.emit("error", { error: { name: normalized.name, code: normalized.code, message: normalized.message } });
        throw normalized;
      }
    },
    cancel(controller) {
      controller?.abort();
    }
  };
  return adapter;
}

function anthropicAdapter(config, secret) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || "https://api.anthropic.com/v1");
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": secret,
    "anthropic-version": config.apiVersion || "2023-06-01"
  };
  const normalizeRequest = ({ model, messages, tools = [], maxTokens = 4_096, temperature, stream = false }) => {
    const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const turns = messages
      .filter((message) => message.role !== "system")
      .map((message) => message.role === "tool"
        ? {
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: message.tool_call_id,
            content: message.content
          }]
        }
        : message);
    return {
      model,
      system,
      messages: turns,
      max_tokens: maxTokens,
      ...(tools.length ? {
        tools: tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        }))
      } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(stream ? { stream: true } : {})
    };
  };
  const adapter = {
    type: "anthropic",
    async listModels({ signal } = {}) {
      try {
        const data = await readJson(await fetch(`${baseUrl}/models`, { headers, signal }));
        return (data.data || []).map((model) => ({ id: model.id, name: model.display_name || model.id, contextWindow: null }));
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw normalizeProviderError(error);
      }
    },
    async sendMessages(request) {
      return adapter.streamMessages(request);
    },
    async streamMessages(request) {
      const emitter = createStreamEmitter(request, "anthropic");
      try {
        const response = await fetch(`${baseUrl}/messages`, {
          method: "POST",
          headers: { ...headers, Accept: "text/event-stream" },
          signal: request.signal,
          body: JSON.stringify(normalizeRequest({ ...request, stream: true }))
        });
        return await streamAnthropicResponse(response, request, emitter);
      } catch (error) {
        const normalized = error instanceof ProviderError ? error : normalizeProviderError(error);
        emitter.emit("error", { error: { name: normalized.name, code: normalized.code, message: normalized.message } });
        throw normalized;
      }
    },
    cancel(controller) {
      controller?.abort();
    }
  };
  return adapter;
}

export const DEFAULT_PROVIDER_CONFIGS = Object.freeze([
  { id: "openrouter", name: "OpenRouter", type: "openrouter", baseUrl: "https://openrouter.ai/api/v1", requiresKey: true },
  { id: "openai", name: "OpenAI", type: "openai", baseUrl: "https://api.openai.com/v1", requiresKey: true },
  { id: "anthropic", name: "Anthropic", type: "anthropic", baseUrl: "https://api.anthropic.com/v1", requiresKey: true },
  { id: "custom", name: "OpenAI-compatible", type: "openai-compatible", baseUrl: "", requiresKey: false },
  { id: "local", name: "Local model", type: "local", baseUrl: "http://localhost:11434/v1", requiresKey: false }
]);

export function normalizeProviderConfig(input) {
  const type = requiredString(input.type, "Provider type");
  if (!PROVIDER_TYPES.has(type)) throw new TypeError(`Unsupported provider type: ${type}`);
  return {
    id: requiredString(input.id, "Provider ID"),
    name: requiredString(input.name || input.id, "Provider name"),
    type,
    baseUrl: String(input.baseUrl || "").trim(),
    requiresKey: input.requiresKey !== false && type !== "local",
    enabled: input.enabled !== false,
    headers: input.headers && typeof input.headers === "object" ? { ...input.headers } : {}
  };
}

export function createProviderAdapter(input, secret = "") {
  const config = normalizeProviderConfig(input);
  if (config.requiresKey && !secret) throw new ProviderError("Provider key is missing", { code: "missing_key", retryable: false });
  if (config.type === "anthropic") return anthropicAdapter(config, secret);
  return openAiAdapter(config, secret);
}

export async function testProviderConnection(config, secret, { signal } = {}) {
  const adapter = createProviderAdapter(config, secret);
  const models = await adapter.listModels({ signal });
  return { connected: true, modelCount: models.length, models: models.slice(0, 100) };
}

export { STREAM_EVENT as PROVIDER_STREAM_EVENT };
