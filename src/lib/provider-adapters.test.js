import { describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  createProviderAdapter,
  normalizeProviderError
} from "./provider-adapters";

function sse(events) {
  return new Response(events.map((event) => [event.event ? `event: ${event.event}` : "", `data: ${typeof event.data === "string" ? event.data : JSON.stringify(event.data)}`].filter(Boolean).join("\n")).join("\n\n") + "\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

describe("provider adapters", () => {
  it("falls back to a normalized JSON response when an OpenAI-compatible server does not stream", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "response-1",
      choices: [{ message: { content: "ok", tool_calls: [] }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 2 }
    }), { status: 200 }));
    const adapter = createProviderAdapter({
      id: "local",
      name: "Local",
      type: "local",
      baseUrl: "http://localhost:11434/v1",
      requiresKey: false
    });
    const result = await adapter.sendMessages({ model: "test", messages: [{ role: "user", content: "run" }] });
    expect(result.text).toBe("ok");
    expect(result.usage.inputTokens).toBe(10);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/v1/chat/completions", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
    fetchMock.mockRestore();
  });

  it("streams OpenAI text, usage, and tool arguments", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(sse([
      { data: { id: "response-stream", choices: [{ delta: { content: "hel" }, finish_reason: null }] } },
      { data: { choices: [{ delta: { content: "lo", tool_calls: [{ index: 0, id: "call:1", function: { name: "query_", arguments: "{\"depth\":" } }] }, finish_reason: null }] } },
      { data: { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "graph", arguments: "1}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 8, completion_tokens: 4 } } },
      { data: "[DONE]" }
    ]));
    const events = [];
    const adapter = createProviderAdapter({
      id: "openai",
      name: "OpenAI",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      requiresKey: true
    }, "test-key");
    const result = await adapter.streamMessages({
      model: "test",
      messages: [{ role: "user", content: "run" }],
      onStreamEvent: (event) => events.push(event)
    });
    expect(result.text).toBe("hello");
    expect(result.toolCalls).toEqual([{ id: "call:1", name: "query_graph", arguments: "{\"depth\":1}" }]);
    expect(result.usage).toMatchObject({ inputTokens: 8, outputTokens: 4, exact: true });
    expect(events.map((event) => event.type)).toContain("delta");
    expect(events.at(-1).type).toBe("complete");
    fetchMock.mockRestore();
  });

  it("streams Anthropic text and tool input deltas", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(sse([
      { event: "message_start", data: { message: { id: "message:1", usage: { input_tokens: 5 } } } },
      { event: "content_block_start", data: { index: 0, content_block: { type: "text", text: "" } } },
      { event: "content_block_delta", data: { index: 0, delta: { type: "text_delta", text: "done" } } },
      { event: "content_block_start", data: { index: 1, content_block: { type: "tool_use", id: "tool:1", name: "query_graph", input: {} } } },
      { event: "content_block_delta", data: { index: 1, delta: { type: "input_json_delta", partial_json: "{\"depth\":1}" } } },
      { event: "message_delta", data: { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } } },
      { event: "message_stop", data: {} }
    ]));
    const adapter = createProviderAdapter({
      id: "anthropic",
      name: "Anthropic",
      type: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      requiresKey: true
    }, "test-key");
    const result = await adapter.sendMessages({ model: "test", messages: [{ role: "user", content: "run" }] });
    expect(result.text).toBe("done");
    expect(result.toolCalls).toEqual([{ id: "tool:1", name: "query_graph", arguments: "{\"depth\":1}" }]);
    expect(result.usage).toMatchObject({ inputTokens: 5, outputTokens: 3 });
    fetchMock.mockRestore();
  });

  it("normalizes rate limits without response bodies or secrets", () => {
    const response = new Response("", { status: 429, headers: { "retry-after": "2" } });
    const error = normalizeProviderError(null, response);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.code).toBe("rate_limit");
    expect(error.retryAfterMs).toBe(2_000);
  });
});
