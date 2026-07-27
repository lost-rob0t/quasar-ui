import { useEffect } from "react";
import { executeSandboxedJavaScript } from "../lib/agent-javascript-sandbox";
import {
  registerJavascriptExecution,
  subscribeJavascriptCapability
} from "../lib/agent-javascript-capability";

function configuredLimits(args) {
  return Object.fromEntries([
    ["timeoutMs", args.timeoutMs],
    ["maxOutputBytes", args.maxOutputBytes],
    ["maxNestedCalls", args.maxNestedCalls],
    ["maxNestedDepth", args.maxNestedDepth]
  ].filter(([, value]) => value !== undefined));
}

export default function AgentJavascriptCapabilityBridge() {
  useEffect(() => subscribeJavascriptCapability(async ({ args, context, resolve, reject }) => {
    let unregister = () => {};
    try {
      const execution = executeSandboxedJavaScript({
        code: String(args.code || ""),
        input: args.input,
        limits: configuredLimits(args),
        bridge: async (name, nestedArgs, nestedCall) => {
          if (typeof context.callTool !== "function") throw new Error("No capability bridge is configured for this run");
          return context.callTool(name, nestedArgs, {
            parentToolCallId: context.toolCallId || null,
            sandboxCallId: nestedCall.id,
            depth: nestedCall.depth
          });
        }
      });
      unregister = registerJavascriptExecution(context.run?.id || context.runId, execution);
      const result = await execution.promise;
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      unregister();
    }
  }), []);

  return null;
}
