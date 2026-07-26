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
  await expect(page.locator(".sync-badge")).toHaveText("db offline");
  await expect(page.locator(".sync-badge")).toHaveAttribute("title", "CouchDB: Local only");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  expect(failedApplicationRequests).toEqual([]);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "StarIntel server" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "RabbitMQ graph ingest" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Install/update map-reduce views" })).toBeVisible();
});

test("creates a blank graph and runs a bundled actor", async ({ page }) => {
  await page.goto("/graph");

  await expect(page.getByRole("heading", { name: "Start a blank graph" })).toBeVisible();
  await page.locator(".graph-stage").click({ button: "right", position: { x: 240, y: 220 } });
  await expect(page.getByRole("menu", { name: "canvas actions" })).toBeVisible();
  await expect(page.locator(".graph-context-menu")).toHaveClass(/expanded/);
  await expect(page.getByRole("menuitem", { name: "Create person here" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Create organization here" })).toBeVisible();
  await page.getByRole("menuitem", { name: /Ingest/ }).click();
  await expect(page.getByRole("menuitem", { name: "Import documents" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "StarIntel connection settings" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Back" }).click();
  await page.getByRole("menuitem", { name: "Create person here" }).click();
  await expect(page).toHaveURL(/\/documents\/new\?/);
  await expect(page.getByLabel("Object type")).toHaveValue("person");
  await expect(page.getByRole("heading", { name: "Fields for Person" })).toBeVisible();
  await expect(page.getByText("Advanced metadata and raw JSON…")).toBeVisible();
  await expect(page.getByLabel("fname")).toBeVisible();
  await expect(page.getByLabel("mname")).toBeVisible();
  await expect(page.getByLabel("lname")).toBeVisible();
  await page.getByRole("combobox", { name: "Add another field" }).fill("nationalities");
  const fieldOptions = page.locator(".field-picker-options");
  await expect(fieldOptions).toBeVisible();
  await expect(fieldOptions).toHaveCSS("z-index", "12");
  await expect(page.locator(".simple-editor-form")).toHaveCSS("overflow", "visible");
  await page.getByRole("option", { name: /nationalities/ }).click();
  await expect(page.getByRole("group", { name: "nationalities" })).toBeVisible();
  await page.getByLabel("Object type").selectOption("org");
  await expect(page.getByRole("heading", { name: "Fields for Organization" })).toBeVisible();
  await expect(page.getByLabel("org_type")).toBeVisible();
  await expect(page.getByLabel("legal_name")).toBeVisible();
  await expect(page.getByLabel("fname")).toHaveCount(0);
  await page.getByLabel("Object type").selectOption("person");
  await page.getByLabel("fname").fill("Jane");
  await page.getByLabel("lname").fill("Doe");
  await page.getByLabel("full_name").fill("Jane Doe");
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

test.describe("responsive application shell", () => {
  test("preserves the desktop sidebar layout", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".mobile-nav")).toBeHidden();
    await expect(page.locator(".app-shell")).toHaveCSS("grid-template-columns", "235px 1205px");
  });

  test("uses gesture navigation without horizontal page overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".mobile-nav")).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Open menu" }).click();
    const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.getByText("Graph")).toBeVisible();
    await expect(page.locator(".dashboard-empty-page > .page-heading")).toHaveCSS("text-align", "center");
    await expect(page.locator(".dashboard-empty .button-row")).toHaveCSS("justify-content", "center");
    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(viewport.scrollWidth).toBe(viewport.clientWidth);
  });

  test("keeps the mobile graph canvas usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/graph");

    await expect(page.locator(".graph-stage")).toBeVisible();
    await expect(page.locator(".graph-inspector")).toBeHidden();
    await expect(page.locator(".graph-workbench")).toHaveCSS("grid-template-columns", "390px");
    await expect(page.locator(".graph-toolbar")).toHaveCSS("overflow-x", "visible");
    await expect(page.getByRole("button", { name: "Fit", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Focus", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "More graph controls" })).toBeVisible();
    const controls = await page.locator(".graph-toolbar").evaluate((toolbar) => ({
      toolbarRight: toolbar.getBoundingClientRect().right,
      fitRight: toolbar.querySelector("button:nth-of-type(1)")?.getBoundingClientRect().right,
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth
    }));
    expect(controls.toolbarRight).toBeLessThanOrEqual(controls.viewportWidth);
    expect(controls.fitRight).toBeLessThanOrEqual(controls.viewportWidth);
    expect(controls.pageWidth).toBe(controls.viewportWidth);
  });

  test("fits agent chat inside the mobile PWA viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/agents?tab=run");

    await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
    const chatPicker = page.getByRole("button", { name: /Other chats:/ });
    await expect(chatPicker).toBeVisible();
    await chatPicker.click();
    await expect(page.getByRole("textbox", { name: "Search chats" })).toBeVisible();
    await expect(page.getByRole("listbox", { name: "Other chats" })).toBeVisible();
    await expect(page.getByText("No chats found.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Search chats" })).toBeHidden();
    await expect(page.getByLabel("Console section")).toHaveValue("run");
    await expect(page.locator(".agent-console-tabs")).toBeHidden();
    await expect(page.locator('.agent-console[data-tab="run"]')).toHaveCSS("position", "fixed");
    await expect(page.locator(".agent-run-inspector")).toBeHidden();

    const layout = await page.evaluate(() => {
      const consoleRect = document.querySelector(".agent-console")?.getBoundingClientRect();
      const navRect = document.querySelector(".mobile-nav")?.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        pageHeight: document.documentElement.scrollHeight,
        consoleTop: consoleRect?.top,
        consoleBottom: consoleRect?.bottom,
        navTop: navRect?.top
      };
    });

    expect(layout.pageHeight).toBe(layout.viewportHeight);
    expect(layout.consoleTop).toBeGreaterThanOrEqual(0);
    expect(layout.consoleBottom).toBeLessThanOrEqual(layout.navTop || layout.viewportHeight);
  });
});
