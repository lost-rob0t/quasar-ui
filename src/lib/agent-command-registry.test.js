import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getState: vi.fn(),
  putState: vi.fn(),
  stateDb: {}
}));

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

  it("surfaces dedicated document commands with typed schemas and permissions", () => {
    const registry = createCommandRegistry();

    expect(registry.get("doc-read")).toMatchObject({
      capability: "document_read",
      category: "documents",
      permission: "document_read"
    });
    expect(registry.get("create-doc")?.capability).toBe("document_create");
    expect(registry.get("edit-doc")?.capability).toBe("document_patch");
    expect(registry.get("delete-doc")).toMatchObject({
      capability: "document_delete",
      permission: "document_write",
      risk: "high"
    });
  });

  it("presents filesystem and shell commands as explicitly unavailable without trusted adapters", () => {
    const registry = createCommandRegistry();

    expect(registry.get("file-read")).toMatchObject({
      availability: "unavailable",
      permission: "filesystem_read",
      capability: "filesystem_read"
    });
    expect(registry.get("file-write")).toMatchObject({
      availability: "unavailable",
      permission: "filesystem_write",
      risk: "high"
    });
    expect(registry.get("shell")).toMatchObject({
      availability: "unavailable",
      permission: "shell_execute",
      risk: "high"
    });
    expect(commandHelp(registry.get("shell"))).toContain("No trusted shell adapter is configured");
  });

  it("parses typed document command arguments for the shared agent loop", () => {
    const registry = createCommandRegistry();
    const parsed = parseCommandInput(
      `/doc-create document:'{"_id":"starintel:person:ada","dtype":"person"}' addToGraph:true`,
      registry
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.input).toEqual({
      document: { _id: "starintel:person:ada", dtype: "person" },
      addToGraph: true
    });
    expect(commandToAgentPrompt(parsed)).toContain("`document_create`");
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
    expect(commandSignature(definition)).toContain("--query <string>");
    expect(commandHelp(definition)).toContain("Underlying capability: web_search");
    expect(activeArgumentHint("/search query:test count:", registry)).toMatchObject({ name: "count", type: "integer" });
  });

  it("fuzzy matches aliases and descriptions", () => {
    const registry = createCommandRegistry();
    expect(registry.search("web")[0].command).toBe("search");
    expect(registry.search("public source").some((item) => item.command === "search")).toBe(true);
  });

  it("ranks recent commands without overriding stronger query matches", () => {
    const registry = createCommandRegistry({ recentCommands: ["fetch", "search"] });

    expect(registry.search("").slice(0, 2).map((item) => item.command)).toEqual(["fetch", "search"]);
    expect(registry.search("sea")[0].command).toBe("search");
  });
});
