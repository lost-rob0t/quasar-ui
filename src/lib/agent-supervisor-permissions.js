import { AgentSupervisor } from "./agent-supervisor";
import {
  cancelRuntimeToolPermissions,
  requestRuntimeToolPermission
} from "./agent-permission-broker";
import {
  AGENT_DOCUMENT_CAPABILITIES,
  invokeDocumentCapability
} from "./agent-document-capabilities";
import {
  AGENT_RECORD_TYPES,
  saveAgentRecord
} from "./agent-records";
import { sanitizeArguments } from "./agent-permissions-v2";
import {
  AGENT_JAVASCRIPT_CAPABILITY,
  cancelJavascriptExecutions,
  invokeJavascriptCapability
} from "./agent-javascript-capability";

const PATCHED = Symbol.for("quasar.agent-supervisor-permissions");
const DOCUMENT_NAMES = new Set(AGENT_DOCUMENT_CAPABILITIES.map((capability) => capability.name));

function nestedToolId() {
  return `nested-tool:${crypto.randomUUID()}`;
}

function summarize(value, limit = 4_000) {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function errorRecord(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || "capability_error",
    message: error?.message || String(error)
  };
}

function allowedDocumentCapabilities(agent) {
  const permissions = new Set(agent?.permissions || []);
  return AGENT_DOCUMENT_CAPABILITIES.filter((capability) => permissions.has(capability.permission));
}

if (!AgentSupervisor.prototype[PATCHED]) {
  const originalRun = AgentSupervisor.prototype.run;
  const originalPause = AgentSupervisor.prototype.pause;
  const originalStop = AgentSupervisor.prototype.stop;

  AgentSupervisor.prototype.run = function runWithPermissionGate(agent, inputOrRun) {
    if (!this.toolRegistry?.[PATCHED]) {
      const list = this.toolRegistry.list.bind(this.toolRegistry);
      const execute = this.toolRegistry.execute.bind(this.toolRegistry);
      this.toolRegistry.list = (currentAgent) => {
        const existing = list(currentAgent);
        const names = new Set(existing.map((tool) => tool.name));
        return [
          ...existing,
          ...allowedDocumentCapabilities(currentAgent).filter((capability) => !names.has(capability.name)),
          ...(!names.has(AGENT_JAVASCRIPT_CAPABILITY.name) ? [AGENT_JAVASCRIPT_CAPABILITY] : [])
        ];
      };
      this.toolRegistry.execute = async (name, args, context = {}) => {
        const executionContext = {
          ...context,
          agent: context.agent || agent,
          run: context.run || (inputOrRun?.recordType ? inputOrRun : null)
        };
        await requestRuntimeToolPermission(name, args, executionContext);
        if (DOCUMENT_NAMES.has(name)) return invokeDocumentCapability(name, args, executionContext);
        if (name === AGENT_JAVASCRIPT_CAPABILITY.name) {
          return invokeJavascriptCapability(args, {
            ...executionContext,
            callTool: async (nestedName, nestedArgs, metadata = {}) => {
              if (nestedName === AGENT_JAVASCRIPT_CAPABILITY.name) throw new Error("Nested JavaScript execution is not allowed");
              const child = await saveAgentRecord({
                id: nestedToolId(),
                recordType: AGENT_RECORD_TYPES.toolCall,
                runId: executionContext.run?.id || executionContext.runId || null,
                agentId: executionContext.agent?.id || null,
                toolName: nestedName,
                arguments: sanitizeArguments(nestedArgs),
                parentToolCallId: metadata.parentToolCallId || executionContext.toolCallId || null,
                sandboxCallId: metadata.sandboxCallId || null,
                nestedDepth: metadata.depth || 1,
                status: "running",
                startedAt: new Date().toISOString()
              }, AGENT_RECORD_TYPES.toolCall);
              try {
                const result = await this.toolRegistry.execute(nestedName, nestedArgs, {
                  ...executionContext,
                  toolCallId: child.id,
                  parentToolCallId: child.parentToolCallId,
                  sandboxCallId: child.sandboxCallId,
                  nestedDepth: child.nestedDepth
                });
                await saveAgentRecord({
                  ...child,
                  status: "completed",
                  resultSummary: summarize(result),
                  endedAt: new Date().toISOString()
                }, AGENT_RECORD_TYPES.toolCall);
                return result;
              } catch (error) {
                await saveAgentRecord({
                  ...child,
                  status: "failed",
                  error: errorRecord(error),
                  endedAt: new Date().toISOString()
                }, AGENT_RECORD_TYPES.toolCall);
                throw error;
              }
            }
          });
        }
        return execute(name, args, context);
      };
      Object.defineProperty(this.toolRegistry, PATCHED, { value: true });
    }
    return originalRun.call(this, agent, inputOrRun);
  };

  AgentSupervisor.prototype.pause = function pauseWithPermissionCancellation(runId, reason) {
    cancelRuntimeToolPermissions(runId, reason || "Agent run paused");
    cancelJavascriptExecutions(runId);
    return originalPause.call(this, runId, reason);
  };

  AgentSupervisor.prototype.stop = function stopWithPermissionCancellation(runId, reason) {
    cancelRuntimeToolPermissions(runId, reason || "Agent run stopped");
    cancelJavascriptExecutions(runId);
    return originalStop.call(this, runId, reason);
  };

  Object.defineProperty(AgentSupervisor.prototype, PATCHED, { value: true });
}
