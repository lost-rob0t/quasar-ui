import { expect, test } from "@playwright/test";

type SandboxResult = {
  status: string;
  value: unknown;
  nestedCalls: Array<{ name: string; status: string }>;
  terminationReason: string | null;
};

test("executes model-selected JavaScript without DOM, storage, or network access", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent("quasar:agent-javascript-capability", {
      detail: {
        args: {
          code: `result({
            window: typeof window,
            document: typeof document,
            localStorage: typeof localStorage,
            indexedDB: typeof indexedDB,
            fetch: typeof fetch,
            websocket: typeof WebSocket
          });`
        },
        context: { runId: "run:javascript-e2e" },
        resolve,
        reject
      }
    }));
  })) as SandboxResult;

  expect(result).toMatchObject({
    status: "completed",
    value: {
      window: "undefined",
      document: "undefined",
      localStorage: "undefined",
      indexedDB: "undefined",
      fetch: "undefined",
      websocket: "undefined"
    }
  });
});

test("routes nested JavaScript calls through the typed capability bridge", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent("quasar:agent-javascript-capability", {
      detail: {
        args: { code: `result(await tools.call("graph_read", { dataset: "main" }));` },
        context: {
          runId: "run:nested-e2e",
          callTool: async (name: string, args: unknown) => ({ capability: name, input: args })
        },
        resolve,
        reject
      }
    }));
  })) as SandboxResult;

  expect(result).toMatchObject({
    status: "completed",
    value: { capability: "graph_read", input: { dataset: "main" } }
  });
  expect(result.nestedCalls).toHaveLength(1);
  expect(result.nestedCalls[0]).toMatchObject({ name: "graph_read", status: "completed" });
});

test("terminates JavaScript that exceeds its wall-clock limit", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent("quasar:agent-javascript-capability", {
      detail: {
        args: { code: "while (true) {}", timeoutMs: 50 },
        context: { runId: "run:timeout-e2e" },
        resolve,
        reject
      }
    }));
  })) as SandboxResult;

  expect(result).toMatchObject({ status: "terminated", terminationReason: "timeout" });
});
