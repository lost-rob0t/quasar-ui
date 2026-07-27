import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionPermissions } from "./agent-permissions-v2";
import {
  permissionForTool,
  requestRuntimeToolPermission,
  resolveRuntimeToolPermission,
  subscribeRuntimeToolPermissions
} from "./agent-permission-broker";

function localStorageMock() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key))
  };
}

class WindowTarget extends EventTarget {
  dispatchEvent(event) {
    return super.dispatchEvent(event);
  }
}

describe("agent runtime permission broker", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock());
    vi.stubGlobal("window", new WindowTarget());
    vi.stubGlobal("CustomEvent", class CustomEvent extends Event {
      constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
      }
    });
    clearSessionPermissions();
  });

  it("keeps web search and URL fetch separate", () => {
    expect(permissionForTool("web_search")).toBe("web_search");
    expect(permissionForTool("fetch_url")).toBe("url_fetch");
  });

  it("blocks a model-selected tool until an inline decision resolves", async () => {
    let request;
    const unsubscribe = subscribeRuntimeToolPermissions((event) => {
      if (event.type === "request") request = event.request;
    });
    const permission = requestRuntimeToolPermission("query_graph", { depth: 1 }, {
      run: { id: "run:1" },
      agent: { permissions: ["graph.read"] }
    });
    await vi.waitFor(() => expect(request?.permission).toBe("graph_read"));
    resolveRuntimeToolPermission(request.id, "allow-action");
    await expect(permission).resolves.toMatchObject({ effect: "allow", scope: "action" });
    unsubscribe();
  });

  it("rejects denied runtime tools", async () => {
    let request;
    subscribeRuntimeToolPermissions((event) => {
      if (event.type === "request") request = event.request;
    });
    const permission = requestRuntimeToolPermission("fetch_url", { url: "https://example.org" }, {
      agent: { permissions: ["sources.external"] }
    });
    await vi.waitFor(() => expect(request?.permission).toBe("url_fetch"));
    resolveRuntimeToolPermission(request.id, "deny");
    await expect(permission).rejects.toMatchObject({ code: "permission_denied" });
  });
});
