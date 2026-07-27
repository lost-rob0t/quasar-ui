export const AGENT_JAVASCRIPT_CAPABILITY = Object.freeze({
  name: "javascript_execute",
  description: "Execute short-lived JavaScript in a disposable isolated Worker with bounded input, output, console, timeout, and nested capability calls.",
  permission: "javascript_execute",
  parameters: {
    type: "object",
    required: ["code"],
    properties: {
      code: { type: "string" },
      input: {},
      timeoutMs: { type: "integer", minimum: 50, maximum: 30_000 },
      maxOutputBytes: { type: "integer", minimum: 1_024, maximum: 1_048_576 },
      maxNestedCalls: { type: "integer", minimum: 0, maximum: 100 },
      maxNestedDepth: { type: "integer", minimum: 0, maximum: 8 }
    },
    additionalProperties: false
  }
});

const JAVASCRIPT_EVENT = "quasar:agent-javascript-capability";
const activeExecutions = new Map();

export function invokeJavascriptCapability(args, context = {}) {
  if (typeof window === "undefined") return Promise.reject(new Error("JavaScript execution requires the Quasar browser runtime"));
  return new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent(JAVASCRIPT_EVENT, {
      detail: { args: args || {}, context, resolve, reject }
    }));
  });
}

export function subscribeJavascriptCapability(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail);
  window.addEventListener(JAVASCRIPT_EVENT, listener);
  return () => window.removeEventListener(JAVASCRIPT_EVENT, listener);
}

export function registerJavascriptExecution(runId, execution) {
  const key = runId || `execution:${crypto.randomUUID()}`;
  activeExecutions.set(key, execution);
  return () => activeExecutions.delete(key);
}

export function cancelJavascriptExecutions(runId) {
  for (const [key, execution] of activeExecutions) {
    if (runId && key !== runId) continue;
    execution.cancel?.();
    activeExecutions.delete(key);
  }
}
