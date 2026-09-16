import { expect, test } from "@playwright/test";

test("configures and starts a tenant actor with a one-run key", async ({ page }) => {
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  await page.route("http://star.test/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON?.() || null;
    requests.push({ method: request.method(), url: url.pathname, body });

    if (url.pathname === "/v1/actors" && request.method() === "GET") {
      return route.fulfill({
        json: {
          actors: [
            {
              actor_id: "fediwatch",
              display_name: "Fediwatch",
              tenant_id: "tenant-red",
              visibility: "tenant"
            }
          ]
        }
      });
    }
    if (url.pathname === "/v1/actor-configs/fediwatch") {
      return route.fulfill({
        json:
          request.method() === "PUT"
            ? body
            : {
                actor_id: "fediwatch",
                tenant_id: "tenant-red",
                schema_version: "0.9.1.2",
                configuration: { profiles: ["alice@example.social"], hashtags: ["osint"] }
              }
      });
    }
    if (url.pathname === "/v1/actor-keys" && request.method() === "GET") {
      return route.fulfill({ json: { keys: [] } });
    }
    if (url.pathname === "/v1/actor-keys" && request.method() === "POST") {
      return route.fulfill({
        status: 201,
        json: {
          key: {
            key_id: "key-once",
            actor_id: "fediwatch",
            name: "Fediwatch key",
            mode: "one_run",
            status: "active"
          },
          secret: "star_actor_once_secret"
        }
      });
    }
    if (url.pathname === "/v1/actor-quotas") {
      return route.fulfill({
        json: {
          quotas: [
            {
              actor_id: "fediwatch",
              tenant_id: "tenant-red",
              plan: "plus",
              policy_schema: "starintel.biz.runtime-policy/v1",
              requests_per_second: { limit: 100, used: 1, remaining: 99 },
              requests_per_month: { limit: 500000, used: 25, remaining: 499975 }
            }
          ]
        }
      });
    }
    if (url.pathname === "/v1/actors/fediwatch/runs") {
      return route.fulfill({ status: 202, json: { run_id: "run-fediwatch-1" } });
    }
    return route.fulfill({ status: 404, json: { message: "Unhandled test endpoint" } });
  });

  await page.goto("/settings");
  await page.getByLabel("Server URL").fill("http://star.test");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved locally")).toBeVisible();
  await page.getByRole("link", { name: "Actors", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Server actor registry" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Fediwatch/ })).toBeVisible();
  await expect(page.getByText("tenant tenant-red")).toBeVisible();
  await expect(page.getByText("499975 of 500000 monthly remaining")).toBeVisible();
  await expect(page.getByText("99 of 100 requests available this second")).toBeVisible();
  await expect(page.getByText("starintel.biz.runtime-policy/v1")).toBeVisible();

  const configuration = page.getByLabel("Persistent actor configuration (JSON)");
  await expect(configuration).toHaveValue(/alice@example\.social/);
  await configuration.fill('{"profiles":["bob@example.social"],"hashtags":["fediverse"]}');
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByText("Saved Fediwatch configuration.")).toBeVisible();

  await page.getByRole("button", { name: "Issue key" }).click();
  await expect(page.getByText("star_actor_once_secret")).toBeVisible();
  await expect(page.getByText(/held only in this page session/)).toBeVisible();

  await page.getByRole("button", { name: "Start actor" }).click();
  await expect(page.getByText(/Fediwatch started · run-fediwatch-1/)).toBeVisible();

  expect(requests).toContainEqual({
    method: "PUT",
    url: "/v1/actor-configs/fediwatch",
    body: {
      release_version: "0.9.1.2",
      schema_version: "0.9.0",
      profile_version: "0.9.2",
      dtype: "actor-config",
      actor_id: "fediwatch",
      enabled: true,
      configuration: { profiles: ["bob@example.social"], hashtags: ["fediverse"] }
    }
  });
  expect(requests).toContainEqual({
    method: "POST",
    url: "/v1/actor-keys",
    body: {
      actor_id: "fediwatch",
      name: "Fediwatch key",
      mode: "one_run",
      quota: { limit: 1, window: "lifetime" }
    }
  });
});
