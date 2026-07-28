import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Expand,
  FilePlus2,
  GripVertical,
  Maximize2,
  Minimize2,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Square,
  TerminalSquare,
  Trash2,
  X
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useQuasar } from "../store";
import { useAgentSystem } from "./AgentSystem";
import {
  activeArgumentHint,
  commandHelp,
  commandSignature,
  commandToAgentPrompt,
  createCommandRegistry,
  parseCommandInput
} from "../lib/agent-command-registry";
import {
  appendConversationMessage,
  appendConversationTurn,
  conversationById,
  createConversation,
  deriveConversationFromRun,
  getActiveConversationId,
  hydrateConversationState,
  loadConversationState,
  mapRunState,
  removeConversation,
  setActiveConversationId,
  setConversationDraft,
  updateConversationMessage,
  upsertConversation
} from "../lib/agent-conversations";
import {
  createPermissionRequest,
  decidePermission,
  evaluatePermission
} from "../lib/agent-permissions-v2";
import { executeSandboxedJavaScript } from "../lib/agent-javascript-sandbox";

const UI_KEY = "quasar:agent-chat-ui:v1";
const COMMAND_USAGE_KEY = "quasar:agent-command-usage:v1";
const SESSION_ID = `session:${Date.now()}:${Math.random().toString(16).slice(2)}`;

function loadUi() {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || "null") || {
      expanded: false,
      position: { right: 24, bottom: 24 },
      modal: { width: 680, height: 760 }
    };
  } catch {
    return { expanded: false, position: { right: 24, bottom: 24 }, modal: { width: 680, height: 760 } };
  }
}

function saveUi(value) {
  localStorage.setItem(UI_KEY, JSON.stringify(value));
  return value;
}

function loadRecentCommands() {
  try {
    const value = JSON.parse(localStorage.getItem(COMMAND_USAGE_KEY) || "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((command) => typeof command === "string" && command.trim()).map((command) => command.trim()))].slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function saveRecentCommands(value) {
  localStorage.setItem(COMMAND_USAGE_KEY, JSON.stringify(value));
  return value;
}

function stamp() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stringify(value) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function Markdown({ content }) {
  const parts = String(content || "").split(/```([\w-]*)\n([\s\S]*?)```/g);
  return (
    <div className="agent-chat-markdown">
      {parts.map((part, index) => index % 3 === 2
        ? <pre key={index}><code className={`language-${parts[index - 1] || "text"}`}>{part}</code></pre>
        : index % 3 === 1
          ? null
          : <span key={index}>{part}</span>)}
    </div>
  );
}

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="agent-chat-icon-button"
      type="button"
      title={label}
      aria-label={label}
      onClick={() => navigator.clipboard?.writeText(String(value || "")).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })}
    >
      <Clipboard size={14} />
      {copied && <span className="agent-chat-copy-state">copied</span>}
    </button>
  );
}

function ToolCard({ message, onRetry }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`agent-tool-card agent-tool-${message.status || "completed"} ${message.parentToolCallId ? "agent-tool-child" : ""}`}>
      <button className="agent-tool-summary" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <TerminalSquare size={15} />
        <strong>{message.toolName || "tool"}</strong>
        {message.parentToolCallId && <span>nested · depth {message.nestedDepth || 1}</span>}
        <span>{message.status || "completed"}</span>
        <time>{formatTime(message.completedAt || message.createdAt)}</time>
      </button>
      {open && (
        <div className="agent-tool-details">
          <section>
            <header>Input <CopyButton value={stringify(message.input)} label="Copy tool input" /></header>
            <pre>{stringify(message.input)}</pre>
          </section>
          <section>
            <header>{message.error ? "Error" : "Output"} <CopyButton value={stringify(message.error || message.output)} label="Copy tool output" /></header>
            <pre>{stringify(message.error || message.output)}</pre>
          </section>
          {message.error && <button className="button" type="button" onClick={() => onRetry(message)}>Retry</button>}
        </div>
      )}
    </article>
  );
}

function PermissionCard({ message, onDecision }) {
  const request = message.permissionRequest;
  const pending = request?.status === "pending";
  return (
    <article className={`agent-permission-card permission-${request?.risk || "medium"}`}>
      <header><ShieldCheck size={17} /><strong>{request?.permission}</strong><span>{request?.risk || "medium"} risk</span></header>
      <p>{request?.reason}</p>
      {request?.target && <p><b>Target:</b> {stringify(request.target)}</p>}
      {request?.sideEffects?.length > 0 && <p><b>Side effects:</b> {request.sideEffects.join("; ")}</p>}
      {request?.arguments && <details><summary>Proposed arguments</summary><pre>{stringify(request.arguments)}</pre></details>}
      {pending ? (
        <div className="agent-permission-actions">
          <button className="button primary" type="button" onClick={() => onDecision(message, "allow-action")}>Allow action</button>
          <button className="button" type="button" onClick={() => onDecision(message, "allow-chat")}>Allow chat</button>
          <button className="button" type="button" onClick={() => onDecision(message, "allow-session")}>Allow session</button>
          <button className="button" type="button" onClick={() => onDecision(message, "always-allow")}>Always allow</button>
          <button className="button danger" type="button" onClick={() => onDecision(message, "deny")}>Deny</button>
          <button className="button danger" type="button" onClick={() => onDecision(message, "always-deny")}>Always deny</button>
        </div>
      ) : <p className="agent-permission-result">{request?.status}</p>}
    </article>
  );
}

function Message({ message, onEdit, onRetry, onPermissionDecision }) {
  if (message.kind === "tool") return <ToolCard message={message} onRetry={onRetry} />;
  if (message.kind === "permission") return <PermissionCard message={message} onDecision={onPermissionDecision} />;
  return (
    <article className={`agent-chat-message agent-message-${message.role} agent-message-${message.status || "completed"}`}>
      <header>
        <strong>{message.role === "user" ? "You" : message.role === "assistant" ? "Agent" : message.role}</strong>
        <time>{formatTime(message.createdAt)}</time>
        <CopyButton value={message.content} />
      </header>
      <Markdown content={message.content} />
      <footer>
        {message.role === "user" && <button type="button" onClick={() => onEdit(message)}>Edit and resubmit</button>}
        {(message.status === "failed" || message.role === "assistant") && <button type="button" onClick={() => onRetry(message)}><RotateCcw size={13} /> Retry</button>}
        {message.usage && <span>{Number(message.usage.inputTokens || 0) + Number(message.usage.outputTokens || 0)} tokens</span>}
      </footer>
    </article>
  );
}

function CommandPalette({ items, selected, onSelect, recentCommands }) {
  if (!items.length) return null;
  const recent = new Set(recentCommands);
  return (
    <div className="agent-command-palette" role="listbox" aria-label="Agent commands">
      {items.slice(0, 12).map((item, index) => (
        <button
          className={`${index === selected ? "selected" : ""} ${item.availability !== "available" ? "unavailable" : ""}`.trim()}
          type="button"
          role="option"
          aria-selected={index === selected}
          aria-disabled={item.availability !== "available"}
          key={item.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(item)}
        >
          <code>/{item.command}</code>
          <span>{item.description}</span>
          <small>{recent.has(item.command) ? "recent · " : ""}{item.availability !== "available" ? `${item.availability} · ` : ""}{item.category} · {item.permission || "no permission"}</small>
        </button>
      ))}
    </div>
  );
}

function ConversationPicker({ conversations, activeConversation, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef(null);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => [
      conversation.title,
      conversation.messages?.at(-1)?.content
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [conversations, query]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (event.key === "Escape" || !pickerRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  function choose(conversationId) {
    onSelect(conversationId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      className="agent-conversation-picker"
      ref={pickerRef}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="agent-conversation-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{activeConversation?.title || "Select conversation"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <section className="agent-conversation-menu" role="dialog" aria-label="Switch conversation">
          <label className="agent-conversation-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search conversations"
              autoFocus
            />
          </label>
          <div className="agent-conversation-list" role="listbox" aria-label="Conversations">
            {matches.map((conversation) => (
              <button
                className={conversation.id === activeConversation?.id ? "active" : ""}
                type="button"
                role="option"
                aria-selected={conversation.id === activeConversation?.id}
                key={conversation.id}
                onClick={() => choose(conversation.id)}
              >
                <strong>{conversation.title}</strong>
                <span>{formatTime(conversation.updatedAt)} · {conversation.state || "idle"}</span>
              </button>
            ))}
            {!matches.length && <p>No matching chats</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function stateLabel(activeRun, pendingPermission) {
  if (pendingPermission) return "waiting-for-permission";
  return mapRunState(activeRun?.status, activeRun?.phase);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function AgentChatBubble() {
  const agentSystem = useAgentSystem();
  const quasar = useQuasar();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [ui, setUi] = useState(loadUi);
  const [conversationState, setConversationState] = useState(loadConversationState);
  const [conversationReady, setConversationReady] = useState(false);
  const [activeConversationId, setActiveConversationIdState] = useState(getActiveConversationId);
  const [composer, setComposer] = useState("");
  const [recentCommands, setRecentCommands] = useState(loadRecentCommands);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [manualScroll, setManualScroll] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [pendingPermission, setPendingPermission] = useState(null);
  const timelineRef = useRef(null);
  const textareaRef = useRef(null);
  const permissionResolvers = useRef(new Map());
  const activeExecution = useRef(null);
  const dragging = useRef(null);
  const resizing = useRef(null);

  useEffect(() => {
    let active = true;
    hydrateConversationState().then((state) => {
      if (!active) return;
      setConversationState(state);
      setActiveConversationIdState(state.activeConversationId || state.conversations[0]?.id || "");
      setConversationReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const registry = useMemo(() => createCommandRegistry({
    actors: quasar.actors || [],
    mcpServers: agentSystem.mcpServers || [],
    recentCommands
  }), [quasar.actors, agentSystem.mcpServers, recentCommands]);

  useEffect(() => {
    if (!conversationReady || conversationState.conversations.length) return;
    const conversation = createConversation({ agentId: agentSystem.activeAgent?.id, modelId: agentSystem.activeAgent?.modelId });
    const next = upsertConversation(conversationState, conversation);
    setConversationState(next);
    setActiveConversationIdState(conversation.id);
    setActiveConversationId(conversation.id);
  }, [agentSystem.activeAgent, conversationReady, conversationState]);

  const activeConversation = conversationById(conversationState, activeConversationId)
    || conversationState.conversations[0]
    || null;

  useEffect(() => {
    if (!activeConversation) return;
    setComposer(activeConversation.draft || "");
    setActiveConversationId(activeConversation.id);
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!agentSystem.activeRun || !activeConversation) return;
    if (activeConversation.runId && activeConversation.runId !== agentSystem.activeRun.id) return;
    const derived = deriveConversationFromRun(agentSystem.activeRun, activeConversation);
    setConversationState((state) => upsertConversation(state, derived));
  }, [agentSystem.activeRun]);

  useEffect(() => {
    if (!open || manualScroll || !timelineRef.current) return;
    timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [open, manualScroll, activeConversation?.messages?.length, agentSystem.activeRun?.status]);

  const commandQuery = composer.trimStart().startsWith("/") ? composer.trimStart().slice(1).split(/\s/, 1)[0] : null;
  const paletteItems = useMemo(() => commandQuery === null ? [] : registry.search(commandQuery), [commandQuery, registry]);
  const parsed = useMemo(() => parseCommandInput(composer, registry), [composer, registry]);
  const hint = useMemo(() => activeArgumentHint(composer, registry), [composer, registry]);

  const persistConversation = useCallback((conversation) => {
    setConversationState((state) => upsertConversation(state, conversation));
  }, []);

  const mutateConversation = useCallback((mutator) => {
    setConversationState((state) => {
      const current = conversationById(state, activeConversationId);
      return current ? upsertConversation(state, mutator(current)) : state;
    });
  }, [activeConversationId]);

  const askPermission = useCallback((definition, args, continuation) => {
    const request = createPermissionRequest({
      permission: definition.permission,
      conversationId: activeConversationId,
      runId: agentSystem.activeRun?.id,
      reason: `/${definition.command} requires ${definition.permission}.`,
      target: args.url || args.path || args.actorId || args.serverId || null,
      arguments: args,
      risk: definition.risk,
      sideEffects: definition.sideEffects,
      continuation
    });
    const evaluation = evaluatePermission(request, {
      sessionId: SESSION_ID,
      agentPermissions: agentSystem.activeAgent?.permissions || []
    });
    if (evaluation.allowed) return Promise.resolve(evaluation.decision);
    if (!evaluation.needsPrompt) return Promise.reject(new Error(`Permission denied: ${request.permission}`));
    const messageId = randomId("message");
    mutateConversation((conversation) => appendConversationMessage(conversation, {
      id: messageId,
      role: "system",
      kind: "permission",
      content: `Permission requested: ${request.permission}`,
      permissionRequest: request,
      status: "waiting-for-permission"
    }));
    setPendingPermission(request);
    return new Promise((resolve, reject) => permissionResolvers.current.set(request.id, { resolve, reject, messageId }));
  }, [activeConversationId, agentSystem.activeAgent, agentSystem.activeRun, mutateConversation]);

  const runAgentInput = useCallback(async (raw, { retry = false } = {}) => {
    if (!activeConversation) return;
    const userMessage = {
      id: randomId("message"),
      role: "user",
      content: raw,
      status: "completed",
      createdAt: stamp(),
      retry
    };
    const turn = { id: randomId("turn"), messageId: userMessage.id, status: "running", createdAt: stamp() };
    let working = appendConversationMessage(activeConversation, userMessage);
    working = appendConversationTurn(working, turn);
    working = { ...working, draft: "", state: "thinking", agentId: agentSystem.activeAgent?.id, modelId: agentSystem.activeAgent?.modelId };
    persistConversation(working);
    setComposer("");
    const command = parseCommandInput(raw, registry);
    if (command?.definition) {
      setRecentCommands((commands) => saveRecentCommands([
        command.definition.command,
        ...commands.filter((candidate) => candidate !== command.definition.command)
      ].slice(0, 20)));
    }
    try {
      if (command?.definition?.availability !== "available") {
        throw new Error(`/${command.definition.command} is ${command.definition.availability}: ${command.definition.availabilityReason || "This capability is not configured."}`);
      }
      if (command?.definition?.builtIn) {
        if (command.errors.length) throw new Error(command.errors.join("; "));
        if (command.command === "new") {
          createNewConversation();
          return;
        }
        if (command.command === "clear") {
          persistConversation({ ...working, messages: [], turns: [], title: "New conversation", state: "idle" });
          return;
        }
        if (command.command === "help") {
          const target = command.input.command ? registry.get(command.input.command) : null;
          const content = target
            ? commandHelp(target)
            : registry.definitions.map((item) => `- \`/${item.command}\` — ${item.description}`).join("\n");
          persistConversation(appendConversationMessage(working, { role: "assistant", content, status: "completed" }));
          return;
        }
        if (command.command === "stop") {
          if (agentSystem.activeRun) await agentSystem.supervisor.stop(agentSystem.activeRun.id);
          activeExecution.current?.cancel?.();
          persistConversation({ ...working, state: "cancelled" });
          return;
        }
        if (command.command === "pause") {
          if (agentSystem.activeRun) await agentSystem.supervisor.pause(agentSystem.activeRun.id);
          persistConversation({ ...working, state: "paused" });
          return;
        }
        if (command.command === "resume") {
          await agentSystem.command("/resume");
          return;
        }
        if (command.command === "retry") {
          await agentSystem.command("/retry");
          return;
        }
        if (command.command === "js") {
          await askPermission(command.definition, command.input, { type: "javascript", turnId: turn.id });
          let input;
          if (command.input.input) {
            try { input = JSON.parse(command.input.input); } catch { input = command.input.input; }
          }
          const toolMessageId = randomId("message");
          working = appendConversationMessage(working, {
            id: toolMessageId,
            role: "tool",
            kind: "tool",
            content: "Executing sandboxed JavaScript",
            toolName: "javascript_execute",
            input: command.input,
            status: "running",
            createdAt: stamp()
          });
          persistConversation(working);
          const execution = executeSandboxedJavaScript({
            code: command.input.code,
            input,
            limits: { timeoutMs: command.input.timeout || 5000 },
            onToolCall: (call) => {
              const messageId = `message:${call.id}`;
              mutateConversation((conversation) => {
                const message = {
                  id: messageId,
                  role: "tool",
                  kind: "tool",
                  content: `${call.name} ${call.status}`,
                  toolName: call.name,
                  input: call.input,
                  output: call.output,
                  error: call.error,
                  status: call.status,
                  parentToolCallId: toolMessageId,
                  sandboxCallId: call.id,
                  nestedDepth: call.depth,
                  createdAt: call.startedAt,
                  completedAt: call.completedAt
                };
                return conversation.messages.some((candidate) => candidate.id === messageId)
                  ? updateConversationMessage(conversation, messageId, message)
                  : appendConversationMessage(conversation, message);
              });
            },
            bridge: async (name, args) => {
              const nestedDefinition = registry.get(name) || registry.definitions.find((item) => item.capability === name);
              if (!nestedDefinition) throw new Error(`Unknown capability: ${name}`);
              if (nestedDefinition.permission) await askPermission(nestedDefinition, args, { type: "nested-tool", parent: toolMessageId });
              const run = await agentSystem.command(commandToAgentPrompt({ definition: nestedDefinition, command: nestedDefinition.command, input: args, instruction: "", raw: "", errors: [] }));
              return { runId: run?.id, status: run?.status, result: run?.history?.at(-1)?.resultSummary || run?.statusReason || null };
            }
          });
          activeExecution.current = execution;
          const result = await execution.promise;
          mutateConversation((conversation) => updateConversationMessage(conversation, toolMessageId, {
            content: result.status === "completed" ? "JavaScript completed" : `JavaScript ${result.status}`,
            output: result,
            status: result.status === "completed" ? "completed" : "failed",
            completedAt: stamp()
          }));
          return;
        }
      }
      if (command?.definition) {
        if (command.errors.length) throw new Error(command.errors.join("; "));
        if (command.definition.permission) await askPermission(command.definition, command.input, { type: "capability", turnId: turn.id });
      }
      const prompt = command?.definition ? commandToAgentPrompt(command) : raw;
      const run = await agentSystem.command(prompt);
      if (run) {
        agentSystem.setActiveRunId(run.id);
        const updated = deriveConversationFromRun(run, { ...working, runId: run.id, state: stateLabel(run, null) });
        persistConversation(updated);
      }
    } catch (error) {
      if (error?.message?.startsWith("Permission denied")) return;
      mutateConversation((conversation) => appendConversationMessage({ ...conversation, state: "failed" }, {
        role: "system",
        kind: "error",
        content: error?.message || String(error),
        status: "failed"
      }));
    } finally {
      activeExecution.current = null;
    }
  }, [activeConversation, agentSystem, askPermission, mutateConversation, persistConversation, registry]);

  function createNewConversation() {
    const conversation = createConversation({ agentId: agentSystem.activeAgent?.id, modelId: agentSystem.activeAgent?.modelId });
    setConversationState((state) => upsertConversation(state, conversation));
    setActiveConversationIdState(conversation.id);
    setActiveConversationId(conversation.id);
    setComposer("");
  }

  function selectCommand(item) {
    const signature = `/${item.command}`;
    setComposer(signature + (Object.keys(item.inputSchema?.properties || {}).length ? " " : ""));
    setPaletteIndex(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function submit(event) {
    event?.preventDefault();
    const value = composer.trim();
    if (!value) return;
    runAgentInput(value);
  }

  function onComposerKeyDown(event) {
    if (paletteItems.length && commandQuery !== null && !composer.includes(" ")) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPaletteIndex((index) => (index + 1) % Math.min(12, paletteItems.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setPaletteIndex((index) => (index - 1 + Math.min(12, paletteItems.length)) % Math.min(12, paletteItems.length));
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        selectCommand(paletteItems[paletteIndex]);
        return;
      }
      if (event.key === "Escape") {
        setComposer(composer.replace(/^\//, ""));
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function onPermissionDecision(message, choice) {
    const result = decidePermission(message.permissionRequest, choice, { sessionId: SESSION_ID });
    mutateConversation((conversation) => updateConversationMessage(conversation, message.id, {
      permissionRequest: result,
      status: result.status,
      content: `${result.permission}: ${result.status}`
    }));
    setPendingPermission(null);
    const resolver = permissionResolvers.current.get(message.permissionRequest.id);
    permissionResolvers.current.delete(message.permissionRequest.id);
    if (result.status === "allowed") resolver?.resolve(result.decision);
    else resolver?.reject(new Error(`Permission denied: ${result.permission}`));
  }

  function deleteActiveConversation() {
    if (!activeConversation) return;
    const next = removeConversation(conversationState, activeConversation.id);
    setConversationState(next);
    const replacement = next.conversations[0];
    if (replacement) {
      setActiveConversationIdState(replacement.id);
      setActiveConversationId(replacement.id);
    } else createNewConversation();
  }

  function updateDraft(value) {
    setComposer(value);
    if (!activeConversation) return;
    const next = upsertConversation(
      conversationState,
      setConversationDraft(activeConversation, value)
    );
    setConversationState(next);
  }

  function beginDrag(event) {
    if (ui.expanded) return;
    const modal = event.currentTarget.closest(".agent-chat-modal")?.getBoundingClientRect();
    dragging.current = {
      x: event.clientX,
      y: event.clientY,
      right: ui.position.right,
      bottom: ui.position.bottom,
      maxRight: Math.max(8, window.innerWidth - (modal?.width || ui.modal.width) - 8),
      maxBottom: Math.max(8, window.innerHeight - (modal?.height || ui.modal.height) - 8)
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event) {
    if (!dragging.current) return;
    const next = {
      ...ui,
      position: {
        right: clamp(dragging.current.right - (event.clientX - dragging.current.x), 8, dragging.current.maxRight),
        bottom: clamp(dragging.current.bottom - (event.clientY - dragging.current.y), 8, dragging.current.maxBottom)
      }
    };
    setUi(next);
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = null;
    setUi((value) => saveUi(value));
  }

  function beginResize(event) {
    if (ui.expanded) return;
    event.preventDefault();
    event.stopPropagation();
    const modal = event.currentTarget.closest(".agent-chat-modal")?.getBoundingClientRect();
    if (!modal) return;
    resizing.current = {
      x: event.clientX,
      y: event.clientY,
      left: modal.left,
      top: modal.top,
      width: modal.width,
      height: modal.height
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resize(event) {
    if (!resizing.current) return;
    const start = resizing.current;
    const maximumWidth = Math.min(900, window.innerWidth - start.left - 8);
    const maximumHeight = window.innerHeight - start.top - 8;
    const width = clamp(start.width + (event.clientX - start.x), Math.min(420, maximumWidth), maximumWidth);
    const height = clamp(start.height + (event.clientY - start.y), Math.min(480, maximumHeight), maximumHeight);
    setUi((value) => ({
      ...value,
      position: {
        right: Math.max(8, window.innerWidth - start.left - width),
        bottom: Math.max(8, window.innerHeight - start.top - height)
      },
      modal: { width, height }
    }));
  }

  function endResize() {
    if (!resizing.current) return;
    resizing.current = null;
    setUi((value) => saveUi(value));
  }

  function resizeWithKeyboard(event) {
    const amount = event.shiftKey ? 24 : 8;
    const delta = {
      ArrowLeft: [-amount, 0],
      ArrowRight: [amount, 0],
      ArrowUp: [0, -amount],
      ArrowDown: [0, amount]
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    setUi((value) => {
      const maximumWidth = Math.min(900, window.innerWidth - value.position.right - 8);
      const maximumHeight = window.innerHeight - value.position.bottom - 8;
      const width = clamp(value.modal.width + delta[0], Math.min(420, maximumWidth), maximumWidth);
      const height = clamp(value.modal.height + delta[1], Math.min(480, maximumHeight), maximumHeight);
      return saveUi({ ...value, modal: { width, height } });
    });
  }

  const currentState = stateLabel(agentSystem.activeRun, pendingPermission);
  const style = ui.expanded ? undefined : { right: ui.position.right, bottom: ui.position.bottom, width: ui.modal.width, height: ui.modal.height };

  return (
    <>
      <button
        className={`agent-chat-bubble state-${currentState}`}
        style={ui.expanded ? undefined : { right: ui.position.right, bottom: ui.position.bottom }}
        type="button"
        aria-label="Open agent chat"
        onClick={() => setOpen(true)}
      >
        <Bot size={22} />
        <span className="agent-chat-state-dot" />
      </button>
      {open && (
        <section className={`agent-chat-modal ${ui.expanded ? "expanded" : ""}`} style={style} aria-label="Quasar agent chat">
          <header
            className="agent-chat-header"
            onPointerDown={beginDrag}
            onPointerMove={drag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripVertical size={16} className="agent-chat-grip" />
            <Bot size={18} />
            <div className="agent-chat-title">
              <strong>{agentSystem.activeAgent?.name || "Quasar agent"}</strong>
              <span className={`state-${currentState}`}>{currentState}</span>
            </div>
            <ConversationPicker
              conversations={conversationState.conversations}
              activeConversation={activeConversation}
              onSelect={(conversationId) => {
                setActiveConversationIdState(conversationId);
                setActiveConversationId(conversationId);
              }}
            />
            <button className="agent-chat-icon-button" type="button" onClick={createNewConversation} title="New conversation"><FilePlus2 size={16} /></button>
            <Link className="agent-chat-icon-button" to="/agents" target="_blank" title="Agent settings"><ShieldCheck size={16} /></Link>
            <button className="agent-chat-icon-button" type="button" onClick={() => setUi((value) => saveUi({ ...value, expanded: !value.expanded }))} title={ui.expanded ? "Exit full screen" : "Full screen"}>
              {ui.expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button className="agent-chat-icon-button" type="button" onClick={() => setOpen(false)} title="Close"><X size={17} /></button>
          </header>

          {contextOpen && (
            <aside className="agent-context-strip">
              <span>route <code>{location.pathname}</code></span>
              <span>dataset <code>{quasar.selectedDocuments?.[0]?.dataset || "none"}</code></span>
              <span>graph <code>{quasar.activeGraph?.name || quasar.activeGraph?.id || "none"}</code></span>
              <span>selected <code>{quasar.selectedIds?.length || 0}</code></span>
            </aside>
          )}

          <main
            className="agent-chat-timeline"
            ref={timelineRef}
            onScroll={(event) => {
              const node = event.currentTarget;
              setManualScroll(node.scrollHeight - node.scrollTop - node.clientHeight > 72);
            }}
          >
            {!activeConversation?.messages?.length && (
              <div className="agent-chat-empty">
                <Bot size={30} />
                <strong>Agent ready</strong>
                <p>Prompt normally or type <code>/</code> for registered capabilities.</p>
              </div>
            )}
            {activeConversation?.messages?.map((message) => (
              <Message
                key={message.id}
                message={message}
                onEdit={(item) => { setComposer(item.content); textareaRef.current?.focus(); }}
                onRetry={(item) => runAgentInput(item.role === "user" ? item.content : activeConversation.messages.filter((candidate) => candidate.role === "user").at(-1)?.content || "/retry", { retry: true })}
                onPermissionDecision={onPermissionDecision}
              />
            ))}
            {agentSystem.activeRun?.status === "active" && <div className="agent-chat-running"><span /><span /><span /> {currentState === "running-tool" ? agentSystem.activeRun.statusReason || "running tool" : "thinking"}</div>}
          </main>

          <footer className="agent-chat-composer-shell">
            {parsed?.definition && (
              <div className={`agent-command-signature ${parsed.errors.length ? "invalid" : ""}`}>
                <code>{commandSignature(parsed.definition)}</code>
                {parsed.errors.map((error) => <span key={error}>{error}</span>)}
              </div>
            )}
            {hint && (
              <div className="agent-argument-hint">
                <strong>{hint.name}</strong>
                <code>{hint.type}</code>
                <span>{hint.required ? "required" : "optional"}</span>
                <p>{hint.description}</p>
                {hint.allowedValues.length > 0 && <small>{hint.allowedValues.join(" · ")}</small>}
              </div>
            )}
            <CommandPalette items={paletteItems} selected={paletteIndex} onSelect={selectCommand} recentCommands={recentCommands} />
            <form className="agent-chat-composer" onSubmit={submit}>
              <textarea
                ref={textareaRef}
                value={composer}
                onChange={(event) => updateDraft(event.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder="Ask Quasar or type / for commands"
                rows={1}
                aria-label="Agent prompt"
              />
              <div className="agent-chat-composer-actions">
                <button type="button" className="agent-chat-icon-button" title="Show active context" onClick={() => setContextOpen((value) => !value)}><Expand size={16} /></button>
                <button type="button" className="agent-chat-icon-button" title="Attach context"><Paperclip size={16} /></button>
                <select aria-label="Active model" value={agentSystem.activeAgent?.id || ""} onChange={(event) => agentSystem.setActiveAgentId(event.target.value)}>
                  {agentSystem.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.modelId || "no model"}</option>)}
                </select>
                {agentSystem.activeRun?.status === "active" ? (
                  <button className="button danger" type="button" onClick={() => runAgentInput("/stop")}><Square size={15} /> Stop</button>
                ) : agentSystem.activeRun?.status === "paused" ? (
                  <button className="button" type="button" onClick={() => runAgentInput("/resume")}><Play size={15} /> Resume</button>
                ) : (
                  <button className="button primary" type="submit" disabled={!composer.trim()}><Send size={15} /> Send</button>
                )}
              </div>
            </form>
            <div className="agent-chat-footer-row">
              <span>Enter send · Shift+Enter newline</span>
              {agentSystem.activeRun?.status === "active" && <button type="button" onClick={() => runAgentInput("/pause")}><Pause size={13} /> pause</button>}
              <button type="button" onClick={deleteActiveConversation}><Trash2 size={13} /> delete chat</button>
            </div>
          </footer>
          {!ui.expanded && (
            <button
              className="agent-chat-resize-handle"
              type="button"
              aria-label="Resize agent chat"
              title="Drag or use arrow keys to resize"
              onPointerDown={beginResize}
              onPointerMove={resize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onKeyDown={resizeWithKeyboard}
            />
          )}
        </section>
      )}
    </>
  );
}
