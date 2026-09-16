import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTOR_CONFIGURATION_SCHEMA,
  createActorKey,
  getActorConfiguration,
  listActorKeys,
  listActorQuotas,
  listServerActors,
  normalizeActorQuota,
  revokeActorKey,
  saveActorConfiguration,
  startServerActor
} from "./actor-control-plane";

afterEach(() => vi.unstubAllGlobals());

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("actor control plane client", () => {
  it("does not mistake an unset enterprise contract limit for unlimited", () => {
    const custom = normalizeActorQuota({
      group: "enterprise",
      requests_per_second: { limit: null },
      requests_per_month: { limit: null }
    });
    const unlimited = normalizeActorQuota({
      group: "enterprise",
      requests_per_second: { limit: null, contract_unlimited: true },
      requests_per_month: { limit: null, unlimited: true }
    });

    expect(custom.perSecond).toMatchObject({ limit: null, unlimited: false });
    expect(custom.monthly).toMatchObject({ limit: null, unlimited: false });
    expect(unlimited.perSecond.unlimited).toBe(true);
    expect(unlimited.monthly.unlimited).toBe(true);
  });

  it("normalizes the tenant-visible actor catalog", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        actors: [
          {
            actor_id: "fediwatch",
            display_name: "Fediwatch",
            tenant_id: "tenant-a",
            visibility: "tenant"
          }
        ]
      })
    );
    vi.stubGlobal("fetch", fetch);

    await expect(listServerActors({ serverUrl: "https://star.example" })).resolves.toEqual([
      expect.objectContaining({
        id: "fediwatch",
        label: "Fediwatch",
        tenantId: "tenant-a",
        scope: "tenant",
        remote: true
      })
    ]);
    expect(fetch.mock.calls[0][0]).toBe("https://star.example/api/v1/actors");
  });

  it("loads and persists actor-config documents at schema 0.9.1.2", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          actor_config: {
            actor_id: "fediwatch",
            tenant_id: "tenant-a",
            settings: { hashtags: ["osint"] }
          }
        })
      )
      .mockResolvedValueOnce(
        json({
          actor_id: "fediwatch",
          schema_version: ACTOR_CONFIGURATION_SCHEMA,
          configuration: { hashtags: ["osint", "fediverse"] }
        })
      );
    vi.stubGlobal("fetch", fetch);
    const actor = { id: "fediwatch", tenantId: "tenant-a" };

    await expect(
      getActorConfiguration({ serverUrl: "https://star.example" }, actor)
    ).resolves.toMatchObject({ configuration: { hashtags: ["osint"] }, enabled: true });
    await saveActorConfiguration({ serverUrl: "https://star.example" }, actor, {
      enabled: true,
      configuration: { hashtags: ["osint", "fediverse"] }
    });

    const [, put] = fetch.mock.calls[1];
    expect(put.method).toBe("PUT");
    expect(JSON.parse(put.body)).toEqual({
      schema_version: "0.9.1.2",
      doctype: "actor-config",
      actor_id: "fediwatch",
      enabled: true,
      configuration: { hashtags: ["osint", "fediverse"] }
    });
  });

  it("runs actors and manages scoped keys and quotas", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ run_id: "run-1" }, 202))
      .mockResolvedValueOnce(json({ keys: [{ key_id: "key-1", mode: "one_run" }] }))
      .mockResolvedValueOnce(
        json({ key: { key_id: "key-2", actor_id: "fediwatch" }, secret: "shown-once" }, 201)
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        json({
          quotas: [
            {
              key_id: "key-2",
              plan: "plus",
              policy_schema: "starintel.biz.runtime-policy/v1",
              requests_per_second: { limit: 100, used: 2, remaining: 98 },
              requests_per_month: { limit: 500000, used: 3, remaining: 499997 }
            }
          ]
        })
      );
    vi.stubGlobal("fetch", fetch);
    const configuration = { serverUrl: "https://star.example", serverToken: "session" };
    const actor = { id: "fediwatch" };

    await startServerActor(configuration, actor, { input: { profile: "alice@example.social" } });
    await expect(listActorKeys(configuration, actor.id)).resolves.toEqual([
      expect.objectContaining({ id: "key-1", mode: "one_run" })
    ]);
    await expect(
      createActorKey(configuration, {
        actorId: actor.id,
        name: "one run",
        mode: "one_run",
        quota: { limit: 1, window: "lifetime" }
      })
    ).resolves.toMatchObject({ key: { id: "key-2" }, secret: "shown-once" });
    await revokeActorKey(configuration, "key-2");
    await expect(listActorQuotas(configuration, actor.id)).resolves.toEqual([
      expect.objectContaining({
        keyId: "key-2",
        plan: "plus",
        policySchema: "starintel.biz.runtime-policy/v1",
        perSecond: { limit: 100, used: 2, remaining: 98, resetAt: "", unlimited: false },
        monthly: {
          limit: 500000,
          used: 3,
          remaining: 499997,
          resetAt: "",
          unlimited: false
        }
      })
    ]);

    expect(fetch.mock.calls[0][0]).toBe("https://star.example/api/v1/actors/fediwatch/runs");
    expect(fetch.mock.calls[1][0]).toBe(
      "https://star.example/api/v1/actor-keys?actor_id=fediwatch"
    );
    expect(fetch.mock.calls[3][1].method).toBe("DELETE");
    expect(fetch.mock.calls[4][0]).toBe(
      "https://star.example/api/v1/actor-quotas?actor_id=fediwatch"
    );
  });
});
