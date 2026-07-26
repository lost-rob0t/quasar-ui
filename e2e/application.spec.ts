import { expect, test } from "@playwright/test";

test("opens the local workspace without a backend", async ({ page }) => {
  const failedApplicationRequests: string[] = [];
  page.on("requestfailed", (request) => {
    if (["document", "script", "stylesheet"].includes(request.resourceType())) {
      failedApplicationRequests.push(request.url());
    }
  });

  await page.goto("/");

  await expect(page).toHaveTitle("Quasar");
  await expect(page.getByRole("heading", { name: "Statistics dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No documents loaded" })).toBeVisible();
  await expect(page.locator(".sync-badge")).toHaveText("offline");
  await expect(page.locator(".sync-badge")).toHaveAttribute("title", "Local only");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  expect(failedApplicationRequests).toEqual([]);
});

test("creates a blank graph and runs a bundled actor", async ({ page }) => {
  await page.goto("/graph");

  await expect(page.getByRole("heading", { name: "Start a blank graph" })).toBeVisible();
  await page.locator(".graph-stage").click({ button: "right", position: { x: 240, y: 220 } });
  await expect(page.getByRole("menu", { name: "Graph canvas actions" })).toBeVisible();
  await expect(page.locator(".graph-context-menu")).toHaveClass(/compact/);
  await expect(page.getByRole("menuitem", { name: "Create person here" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Create organization here" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Create person here" }).click();
  await expect(page).toHaveURL(/\/documents\/new\?/);
  await expect(page.getByLabel("Dtype")).toHaveValue("person");
  await expect(page.getByLabel("fname")).toBeVisible();
  await expect(page.getByLabel("mname")).toBeVisible();
  await expect(page.getByLabel("lname")).toBeVisible();
  await page.getByLabel("Dtype").selectOption("org");
  await expect(page.getByLabel("org_type")).toBeVisible();
  await expect(page.getByLabel("legal_name")).toBeVisible();
  await expect(page.getByLabel("fname")).toHaveCount(0);
  await page.getByLabel("Dtype").selectOption("person");
  await page.getByLabel("fname").fill("Jane");
  await page.getByLabel("lname").fill("Doe");
  await page.getByLabel("Title").fill("Jane Doe");
  await page.getByRole("button", { name: "Save document" }).click();

  await expect(page).toHaveURL(/\/graph\?node=/);
  await expect(page.locator(".graph-count")).toContainText("1 nodes");
  await expect(page.getByRole("button", { name: /Generate username candidates/ })).toBeEnabled();
  await page.getByRole("button", { name: /Generate username candidates/ }).click();

  await expect(page.locator(".actor-result")).toContainText("document(s) returned");
  await expect(page.locator(".graph-count")).not.toContainText("1 nodes");

  await page.getByRole("button", { name: "Create graph" }).click();
  await page.getByLabel("Graph name").fill("Second graph");
  await page.getByRole("button", { name: "Create graph" }).last().click();

  await expect(page.getByRole("heading", { name: "Start a blank graph" })).toBeVisible();
  await expect(page.getByLabel("Active graph")).toHaveValue(/second-graph-/);
  await expect(page.getByLabel("Active graph").locator("option")).toHaveCount(2);

  await page.getByRole("button", { name: "Add from corpus" }).first().click();
  const janeRow = page.locator(".membership-list label").filter({ hasText: "Jane Doe" });
  await janeRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add 1 document" }).click();
  await expect(page.locator(".graph-count")).toContainText("1 nodes");

  await page.getByRole("button", { name: "Remove from graph" }).click();
  await expect(page.getByRole("heading", { name: "Start a blank graph" })).toBeVisible();

  await page.getByLabel("Active graph").selectOption("all-documents");
  await expect(page.locator(".graph-count")).not.toContainText("0 nodes");
});
