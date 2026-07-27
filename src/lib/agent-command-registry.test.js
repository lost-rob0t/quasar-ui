import { describe, expect, it } from "vitest";
import {
  activeArgumentHint,
  commandHelp,
  commandSignature,
  commandToAgentPrompt,
  createCommandRegistry,
  parseCommandInput,
  tokenizeCommand
} from "./agent-command-registry";

describe("agent command registry", () => {
  it("discovers tool commands from the capability registry", () => {
    const registry = createCommandRegistry();
    expect(registry.get("search")?.capability).toBe("web_search");
    expect(registry.get("fetch")?.permission).toBe("url_fetch");
    expect(registry.get("actor")?.capability).toBe("run_actor");
  });

  it("discovers actor and MCP commands without chat-component edits", () => {
    const registry = createCommandRegistry({
      actors: [{ id: "enrich", label: "Enrich" }],
      mcpServers: [{ id: "local", name: "Local", allowedTools: ["read_file"] }]
    });
    expect(registry.get("actor/enrich")?.fixedInput).toEqual({ actorId: "enrich" });
    expect(registry.get("mcp/local/read_file")?.fixedInput).toEqual({ serverId: "local", toolName: "read_file" });
  });

  it("tokenizes quoted and escaped strings", () => {
    expect(tokenizeCommand('search query:"browser \\"actors\\"" limit:10').map((token) => token.value)).toEqual([
      "search",
      'query:browser "actors"',
      "limit:10"
    ]);
  });

  it("parses typed arguments and preserves trailing instructions", () => {
    const parsed = parseCommandInput('/search query:"browser actor frameworks" count:10 Compare the results and recommend one.');
    expect(parsed.input).toEqual({ query: "browser actor frameworks", count: 10 });
    expect(parsed.instruction).toBe("Compare the results and recommend one.");
    expect(parsed.errors).toEqual([]);
    expect(commandToAgentPrompt(parsed)).toContain("Additional instruction: Compare the results");
  });

  it("supports an explicit instruction separator", () => {
    const parsed = parseCommandInput('/search query:test -- explain why');
    expect(parsed.input.query).toBe("test");
    expect(parsed.instruction).toBe("explain why");
  });

  it("reports missing required arguments without rejecting raw input", () => {
    const parsed = parseCommandInput("/fetch");
    expect(parsed.raw).toBe("/fetch");
    expect(parsed.errors).toContain("Missing required argument: url");
  });

  it("generates signatures, help, and cursor hints from schemas", () => {
    const registry = createCommandRegistry();
    const definition = registry.get("search");
    expect(commandSignature(definition)).toContain("<query>");
    expect(commandHelp(definition)).toContain("Underlying capability: web_search");
    expect(activeArgumentHint("/search query:test count:", registry)).toMatchObject({ name: "count", type: "integer" });
  });

  it("fuzzy matches aliases and descriptions", () => {
    const registry = createCommandRegistry();
    expect(registry.search("web")[0].command).toBe("search");
    expect(registry.search("public source").some((item) => item.command === "search")).toBe(true);
  });
});
