import { AGENT_PERMISSIONS } from "./agent-records";
import { createAgentToolRegistry } from "./agent-tools";

const LEGACY_PERMISSION_MAP = Object.freeze({
  "documents.read": "document_read",
  "documents.create": "document_write",
  "documents.edit": "document_write",
  "documents.delete": "document_write",
  "graph.read": "graph_read",
  "graph.edit": "graph_write",
  "actors.run": "actor_run",
  "actors.create": "actor_create",
  "sources.external": "web_search",
  "server.use": "mcp_use"
});

const TOOL_COMMANDS = Object.freeze({
  query_database: { command: "query", aliases: ["db"], category: "database" },
  query_graph: { command: "graph", aliases: ["g"], category: "graph" },
  run_actor: { command: "run", aliases: ["actor"], category: "actors" },
  web_search: { command: "search", aliases: ["web"], category: "browser", permission: "web_search" },
  fetch_url: { command: "fetch", aliases: ["url"], category: "browser", permission: "url_fetch" },
  scrape_website: { command: "scrape", aliases: ["crawl"], category: "browser", permission: "url_fetch" },
  mcp_call: { command: "mcp", aliases: [], category: "mcp" },
  build_graph: { command: "graph-build", aliases: ["build-graph"], category: "graph" },
  propose_graph_operations: { command: "edit", aliases: ["patch"], category: "graph" },
  apply_graph_operations: { command: "apply", aliases: [], category: "graph" },
  validate_actor: { command: "actor-test", aliases: ["test-actor"], category: "actors" },
  save_actor: { command: "actor-save", aliases: ["save-actor"], category: "actors" }
});

const BUILT_INS = Object.freeze([
  definition("help", "Show generated command help.", "control", schema({ command: stringProperty("Command name") })),
  definition("new", "Create a new conversation.", "control", schema()),
  definition("stop", "Cancel the active run.", "control", schema()),
  definition("pause", "Pause the active run.", "control", schema()),
  definition("resume", "Resume the active run.", "control", schema()),
  definition("retry", "Retry the active turn.", "control", schema()),
  definition("clear", "Clear the current conversation timeline.", "control", schema()),
  definition("js", "Execute JavaScript in a disposable browser sandbox.", "javascript", schema({
    code: stringProperty("JavaScript source", { positional: true, example: "result(2 + 2)" }),
    timeout: integerProperty("Wall-clock timeout in milliseconds", { default: 5000, minimum: 50, maximum: 30000 }),
    input: stringProperty("JSON input passed to readInput()")
  }, ["code"]), { permission: "javascript_execute", risk: "high", sideEffects: ["May call separately permitted capabilities through the typed bridge"] })
]);

function schema(properties = {}, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

function stringProperty(description, extra = {}) {
  return { type: "string", description, ...extra };
}

function integerProperty(description, extra = {}) {
  return { type: "integer", description, ...extra };
}

function definition(command, description, category, inputSchema, extra = {}) {
  return Object.freeze({
    id: `builtin:${command}`,
    command,
    aliases: [],
    description,
    category,
    availability: "available",
    permission: null,
    risk: "low",
    sideEffects: [],
    inputSchema,
    examples: [`/${command}`],
    builtIn: true,
    ...extra
  });
}

function capabilityDefinition(tool) {
  const commandMeta = TOOL_COMMANDS[tool.name] || {
    command: tool.name.replaceAll("_", "-"),
    aliases: [],
    category: "tools"
  };
  return Object.freeze({
    id: tool.name,
    command: commandMeta.command,
    aliases: commandMeta.aliases,
    description: tool.description,
    category: commandMeta.category,
    availability: "available",
    permission: commandMeta.permission || LEGACY_PERMISSION_MAP[tool.permission] || tool.permission,
    legacyPermission: tool.permission,
    risk: tool.destructive ? "high" : "medium",
    sideEffects: tool.destructive ? ["May modify Quasar state"] : [],
    inputSchema: tool.parameters || schema(),
    examples: [`/${commandMeta.command}`],
    capability: tool.name,
    builtIn: false
  });
}

export function createCommandRegistry({ actors = [], mcpServers = [] } = {}) {
  const toolRegistry = createAgentToolRegistry({});
  const allToolsAgent = { permissions: [...AGENT_PERMISSIONS] };
  const tools = toolRegistry.list(allToolsAgent).map(capabilityDefinition);
  const actorCommands = actors.map((actor) => Object.freeze({
    id: `actor:${actor.id}`,
    command: `actor/${actor.id}`,
    aliases: [],
    description: actor.description || actor.label || `Run actor ${actor.id}`,
    category: "actors",
    availability: actor.enabled === false ? "disabled" : "available",
    permission: "actor_run",
    legacyPermission: "actors.run",
    risk: "medium",
    sideEffects: ["Actor output may modify documents"],
    inputSchema: schema({ target: stringProperty("Optional target or document ID", { positional: true }) }),
    examples: [`/actor/${actor.id}`],
    capability: "run_actor",
    fixedInput: { actorId: actor.id },
    builtIn: false
  }));
  const mcpCommands = mcpServers.flatMap((server) => (server.allowedTools || []).map((toolName) => Object.freeze({
    id: `mcp:${server.id}:${toolName}`,
    command: `mcp/${server.id}/${toolName}`,
    aliases: [],
    description: `Call ${toolName} on ${server.name || server.id}`,
    category: "mcp",
    availability: server.enabled === false ? "disabled" : "available",
    permission: "mcp_use",
    legacyPermission: "server.use",
    risk: "medium",
    sideEffects: ["Depends on the remote MCP tool"],
    inputSchema: schema({ arguments: { type: "object", description: "Tool arguments" } }),
    examples: [`/mcp/${server.id}/${toolName}`],
    capability: "mcp_call",
    fixedInput: { serverId: server.id, toolName },
    builtIn: false
  })));
  const definitions = [...BUILT_INS, ...tools, ...actorCommands, ...mcpCommands];
  const byName = new Map();
  for (const item of definitions) {
    byName.set(item.command, item);
    for (const alias of item.aliases || []) byName.set(alias, item);
  }
  return Object.freeze({
    definitions,
    get(name) {
      return byName.get(String(name || "").replace(/^\//, "")) || null;
    },
    search(query) {
      const needle = normalize(query);
      return definitions
        .map((item) => ({ item, score: commandScore(item, needle) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.item.command.localeCompare(right.item.command))
        .map(({ item }) => item);
    }
  });
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/^\//, "").trim();
}

function commandScore(item, needle) {
  if (!needle) return 1;
  const names = [item.command, ...(item.aliases || [])].map(normalize);
  if (names.includes(needle)) return 100;
  if (names.some((name) => name.startsWith(needle))) return 80;
  if (names.some((name) => name.includes(needle))) return 60;
  const haystack = normalize(`${item.command} ${(item.aliases || []).join(" ")} ${item.description} ${item.category}`);
  let cursor = 0;
  for (const character of needle) {
    cursor = haystack.indexOf(character, cursor);
    if (cursor < 0) return 0;
    cursor += 1;
  }
  return 30;
}

export function tokenizeCommand(input) {
  const tokens = [];
  let value = "";
  let quote = null;
  let escaped = false;
  let start = 0;
  const push = (end) => {
    if (!value && start === end) return;
    tokens.push({ value, start, end });
    value = "";
  };
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else value += character;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (value) push(index);
      start = index + 1;
      continue;
    }
    if (!value) start = index;
    value += character;
  }
  if (escaped) value += "\\";
  if (value || quote) push(input.length);
  return tokens;
}

function coerce(value, property) {
  if (property?.type === "boolean") {
    if (value === undefined) return true;
    if (["true", "1", "yes", "on"].includes(String(value).toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(String(value).toLowerCase())) return false;
    return value;
  }
  if (property?.type === "integer") {
    const number = Number(value);
    return Number.isInteger(number) ? number : value;
  }
  if (property?.type === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (property?.type === "array") return Array.isArray(value) ? value : [value];
  if (property?.type === "object") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function assignValue(target, name, value, property) {
  const coerced = coerce(value, property);
  if (property?.type === "array" || Object.hasOwn(target, name)) {
    target[name] = [...(Array.isArray(target[name]) ? target[name] : [target[name]].filter((item) => item !== undefined)), ...(Array.isArray(coerced) ? coerced : [coerced])];
  } else {
    target[name] = coerced;
  }
}

export function parseCommandInput(raw, registry = createCommandRegistry()) {
  const input = String(raw || "");
  if (!input.trimStart().startsWith("/")) return null;
  const offset = input.indexOf("/");
  const tokens = tokenizeCommand(input.slice(offset + 1));
  const commandToken = tokens.shift();
  const definition = registry.get(commandToken?.value);
  if (!definition) {
    return { raw: input, command: commandToken?.value || "", definition: null, input: {}, instruction: "", errors: ["Unknown command"] };
  }
  const properties = definition.inputSchema?.properties || {};
  const positional = Object.entries(properties).filter(([, property]) => property.positional).map(([name]) => name);
  const parsed = { ...(definition.fixedInput || {}) };
  const errors = [];
  const instructionStart = { value: null };
  let positionalIndex = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "--") {
      instructionStart.value = token.end + offset + 1;
      break;
    }
    const named = token.value.match(/^--?([^:=]+)(?:[:=](.*))?$/) || token.value.match(/^([^:=]+)[:=](.*)$/);
    if (named && Object.hasOwn(properties, named[1])) {
      const name = named[1];
      const property = properties[name];
      let value = named[2];
      if (value === undefined && property.type !== "boolean") {
        const next = tokens[index + 1];
        if (next && next.value !== "--") {
          value = next.value;
          index += 1;
        }
      }
      assignValue(parsed, name, value, property);
      continue;
    }
    const positionalName = positional[positionalIndex];
    if (positionalName) {
      assignValue(parsed, positionalName, token.value, properties[positionalName]);
      positionalIndex += 1;
      continue;
    }
    instructionStart.value = token.start + offset + 1;
    break;
  }
  for (const name of definition.inputSchema?.required || []) {
    if (parsed[name] === undefined || parsed[name] === "") errors.push(`Missing required argument: ${name}`);
  }
  for (const [name, value] of Object.entries(parsed)) {
    const property = properties[name];
    if (property?.enum && !property.enum.includes(value)) errors.push(`Invalid ${name}; expected ${property.enum.join(", ")}`);
    if (property?.type === "integer" && !Number.isInteger(value)) errors.push(`Invalid ${name}; expected integer`);
  }
  return {
    raw: input,
    command: definition.command,
    definition,
    input: parsed,
    instruction: instructionStart.value === null ? "" : input.slice(instructionStart.value).trim(),
    errors
  };
}

export function commandSignature(definition) {
  if (!definition) return "";
  const properties = definition.inputSchema?.properties || {};
  const required = new Set(definition.inputSchema?.required || []);
  const parts = [`/${definition.command}`];
  for (const [name, property] of Object.entries(properties)) {
    const label = property.positional ? `<${name}>` : `--${name} <${property.type || "value"}>`;
    parts.push(required.has(name) ? label : `[${label}]`);
  }
  return parts.join(" ");
}

export function commandHelp(definition) {
  if (!definition) return "Command not found.";
  const properties = definition.inputSchema?.properties || {};
  const required = new Set(definition.inputSchema?.required || []);
  const argumentsText = Object.entries(properties).map(([name, property]) => {
    const details = [property.type || "value", required.has(name) ? "required" : "optional"];
    if (property.default !== undefined) details.push(`default ${property.default}`);
    if (property.enum) details.push(`values ${property.enum.join(" | ")}`);
    return `- ${name}: ${details.join(", ")} — ${property.description || ""}`;
  }).join("\n") || "- none";
  return [
    `## /${definition.command}`,
    definition.description,
    `\nSyntax: \`${commandSignature(definition)}\``,
    `\nArguments:\n${argumentsText}`,
    `\nPermission: ${definition.permission || "none"}`,
    `Availability: ${definition.availability}`,
    `Risk: ${definition.risk}`,
    definition.sideEffects?.length ? `Side effects: ${definition.sideEffects.join("; ")}` : "Side effects: none",
    definition.capability ? `Underlying capability: ${definition.capability}` : "Underlying capability: built-in control",
    `Examples:\n${(definition.examples || []).map((example) => `- \`${example}\``).join("\n")}`
  ].join("\n");
}

export function commandToAgentPrompt(parsed) {
  if (!parsed?.definition) return parsed?.raw || "";
  const payload = JSON.stringify(parsed.input || {});
  const instruction = parsed.instruction ? `\nAdditional instruction: ${parsed.instruction}` : "";
  return `Invoke the registered capability \`${parsed.definition.capability || parsed.command}\` with this typed input: ${payload}.${instruction}`;
}

export function activeArgumentHint(raw, registry = createCommandRegistry()) {
  const parsed = parseCommandInput(raw, registry);
  if (!parsed?.definition) return null;
  const cursorToken = tokenizeCommand(String(raw).slice(String(raw).indexOf("/") + 1)).at(-1)?.value || "";
  const name = cursorToken.replace(/^--?/, "").split(/[:=]/)[0];
  const properties = parsed.definition.inputSchema?.properties || {};
  const property = properties[name] || Object.entries(properties).find(([candidate]) => parsed.input[candidate] === undefined)?.[1];
  const propertyName = properties[name] ? name : Object.entries(properties).find(([, candidate]) => candidate === property)?.[0];
  if (!property || !propertyName) return null;
  return {
    name: propertyName,
    type: property.type || "value",
    required: (parsed.definition.inputSchema?.required || []).includes(propertyName),
    description: property.description || "",
    allowedValues: property.enum || [],
    defaultValue: property.default,
    example: property.example
  };
}
