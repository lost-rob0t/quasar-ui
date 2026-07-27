const DEFAULT_LIMITS = Object.freeze({
  timeoutMs: 5_000,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
  maxConsoleBytes: 32 * 1024,
  maxConsoleEntries: 100,
  maxNestedCalls: 20,
  maxNestedDepth: 4
});

function byteLength(value) {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

export function assertSerializable(value, { maxBytes = DEFAULT_LIMITS.maxOutputBytes } = {}) {
  const seen = new WeakSet();
  const walk = (item) => {
    if (item === null || item === undefined) return;
    if (["function", "symbol", "bigint"].includes(typeof item)) throw new TypeError(`Unsupported result type: ${typeof item}`);
    if (typeof item !== "object") return;
    if (seen.has(item)) throw new TypeError("Cyclic values are not supported");
    seen.add(item);
    if (Array.isArray(item)) item.forEach(walk);
    else Object.values(item).forEach(walk);
  };
  walk(value);
  if (byteLength(value) > maxBytes) throw new RangeError(`Serialized value exceeds ${maxBytes} bytes`);
  return value;
}

export function createSandboxSource() {
  return `
const blocked = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches"];
for (const name of blocked) {
  try { Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false }); }
  catch { try { globalThis[name] = undefined; } catch {} }
}
let settled = false;
let explicitResult;
let inputValue;
let limits;
let consoleBytes = 0;
let consoleEntries = 0;
let nestedCalls = 0;
let nestedDepth = 0;
const pending = new Map();
const sanitize = (value, seen = new WeakSet()) => {
  if (value === undefined || value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (["function", "symbol", "bigint"].includes(typeof value)) throw new TypeError("Unsupported value type: " + typeof value);
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) throw new TypeError("Cyclic values are not supported");
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) output[key] = sanitize(item, seen);
  return output;
};
const encodedBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const safeConsole = Object.freeze({
  log(...values) {
    if (consoleEntries >= limits.maxConsoleEntries) throw new RangeError("Console entry limit exceeded");
    const value = sanitize(values.length === 1 ? values[0] : values);
    consoleBytes += encodedBytes(value);
    if (consoleBytes > limits.maxConsoleBytes) throw new RangeError("Console output limit exceeded");
    consoleEntries += 1;
    postMessage({ type: "console", value });
  }
});
const tools = Object.freeze({
  async call(name, args = {}) {
    nestedCalls += 1;
    if (nestedCalls > limits.maxNestedCalls) throw new RangeError("Nested capability-call limit exceeded");
    nestedDepth += 1;
    if (nestedDepth > limits.maxNestedDepth) throw new RangeError("Nested capability depth exceeded");
    const id = crypto.randomUUID();
    const payload = sanitize(args);
    const result = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      postMessage({ type: "tool-call", id, name: String(name), args: payload, depth: nestedDepth });
    });
    nestedDepth -= 1;
    return result;
  }
});
const readInput = () => inputValue;
const result = (value) => { explicitResult = value; settled = true; };
const execute = async (code) => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction("console", "readInput", "result", "tools", "window", "document", "parent", "top", "opener", "localStorage", "sessionStorage", "navigator", '"use strict";\\n' + code);
  return fn(safeConsole, readInput, result, tools, undefined, undefined, undefined, undefined, undefined, undefined, undefined, Object.freeze({ serviceWorker: undefined }));
};
onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === "tool-result") {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(Object.assign(new Error(message.error.message || "Capability call failed"), message.error));
    else waiter.resolve(message.value);
    return;
  }
  if (message.type !== "execute") return;
  inputValue = sanitize(message.input);
  limits = message.limits;
  try {
    const returned = await execute(String(message.code || ""));
    const value = sanitize(settled ? explicitResult : returned);
    if (encodedBytes(value) > limits.maxOutputBytes) throw new RangeError("Serialized result limit exceeded");
    postMessage({ type: "complete", value, usage: { consoleBytes, consoleEntries, nestedCalls } });
  } catch (error) {
    postMessage({
      type: "error",
      error: {
        name: error?.name || "Error",
        message: error?.message || String(error),
        stack: String(error?.stack || "").split("\\n").slice(0, 8).join("\\n")
      },
      usage: { consoleBytes, consoleEntries, nestedCalls }
    });
  }
};`;
}

export function executeSandboxedJavaScript(options) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const code = String(options.code || "");
  assertSerializable(options.input, { maxBytes: limits.maxInputBytes });
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL?.createObjectURL !== "function") {
    return Promise.reject(new Error("Sandboxed JavaScript requires Web Worker support"));
  }
  const source = createSandboxSource();
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url, { name: "quasar-agent-javascript-sandbox" });
  const started = performance.now();
  const consoleOutput = [];
  const nestedCalls = [];
  let finished = false;
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    worker.terminate();
    URL.revokeObjectURL(url);
  };
  const promise = new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      cleanup();
      callback(value);
    };
    timer = setTimeout(() => finish(resolve, {
      status: "terminated",
      value: null,
      console: consoleOutput,
      nestedCalls,
      runtimeMs: performance.now() - started,
      usage: {},
      terminationReason: "timeout"
    }), Math.max(1, Number(limits.timeoutMs)));
    worker.onerror = (event) => finish(reject, new Error(event.message || "JavaScript sandbox failed"));
    worker.onmessage = async (event) => {
      const message = event.data || {};
      if (message.type === "console") {
        consoleOutput.push(message.value);
        options.onConsole?.(message.value);
        return;
      }
      if (message.type === "tool-call") {
        const call = { id: message.id, name: message.name, input: message.args, depth: message.depth, status: "running", startedAt: new Date().toISOString() };
        nestedCalls.push(call);
        options.onToolCall?.(call);
        try {
          if (!options.bridge) throw new Error("No capability bridge is configured");
          const value = assertSerializable(await options.bridge(message.name, message.args, call), { maxBytes: limits.maxOutputBytes });
          Object.assign(call, { status: "completed", output: value, completedAt: new Date().toISOString() });
          worker.postMessage({ type: "tool-result", id: message.id, value });
        } catch (error) {
          const safeError = { name: error?.name || "Error", message: error?.message || String(error), code: error?.code || "capability_error" };
          Object.assign(call, { status: "failed", error: safeError, completedAt: new Date().toISOString() });
          worker.postMessage({ type: "tool-result", id: message.id, error: safeError });
        }
        return;
      }
      if (message.type === "complete") {
        finish(resolve, {
          status: "completed",
          value: message.value,
          console: consoleOutput,
          nestedCalls,
          runtimeMs: performance.now() - started,
          usage: message.usage || {},
          terminationReason: null
        });
        return;
      }
      if (message.type === "error") {
        finish(resolve, {
          status: "failed",
          value: null,
          console: consoleOutput,
          nestedCalls,
          runtimeMs: performance.now() - started,
          usage: message.usage || {},
          error: message.error,
          terminationReason: "error"
        });
      }
    };
    worker.postMessage({ type: "execute", code, input: options.input, limits });
  });
  return {
    promise,
    cancel() {
      if (finished) return;
      finished = true;
      cleanup();
    }
  };
}

export { DEFAULT_LIMITS as JAVASCRIPT_SANDBOX_LIMITS };
