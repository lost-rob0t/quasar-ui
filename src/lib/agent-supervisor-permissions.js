import { AgentSupervisor } from "./agent-supervisor";
import {
  cancelRuntimeToolPermissions,
  requestRuntimeToolPermission
} from "./agent-permission-broker";

const PATCHED = Symbol.for("quasar.agent-supervisor-permissions");

if (!AgentSupervisor.prototype[PATCHED]) {
  const originalRun = AgentSupervisor.prototype.run;
  const originalPause = AgentSupervisor.prototype.pause;
  const originalStop = AgentSupervisor.prototype.stop;

  AgentSupervisor.prototype.run = function runWithPermissionGate(agent, inputOrRun) {
    if (!this.toolRegistry?.[PATCHED]) {
      const execute = this.toolRegistry.execute.bind(this.toolRegistry);
      this.toolRegistry.execute = async (name, args, context = {}) => {
        await requestRuntimeToolPermission(name, args, {
          ...context,
          agent: context.agent || agent,
          run: context.run || (inputOrRun?.recordType ? inputOrRun : null)
        });
        return execute(name, args, context);
      };
      Object.defineProperty(this.toolRegistry, PATCHED, { value: true });
    }
    return originalRun.call(this, agent, inputOrRun);
  };

  AgentSupervisor.prototype.pause = function pauseWithPermissionCancellation(runId, reason) {
    cancelRuntimeToolPermissions(runId, reason || "Agent run paused");
    return originalPause.call(this, runId, reason);
  };

  AgentSupervisor.prototype.stop = function stopWithPermissionCancellation(runId, reason) {
    cancelRuntimeToolPermissions(runId, reason || "Agent run stopped");
    return originalStop.call(this, runId, reason);
  };

  Object.defineProperty(AgentSupervisor.prototype, PATCHED, { value: true });
}
