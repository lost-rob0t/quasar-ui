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

test("creates documents and manages a custom full-screen graph", async ({ page }) => {
  await page.goto("/graph");

  await expect(page.getByRole("heading", { name: "Start a blank graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cycle active graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select dataset" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cycle layout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add graph document" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Focus selection" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle labels" })).toBeVisible();
  await expect(page.getByLabel("Dataset filter", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Graph layout", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Maltego graph layout", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Active graph", { exact: true })).toBeHidden();

  await page.locator(".graph-stage").click({ button: "right", position: { x: 240, y: 220 } });
  await expect(page.getByRole("menu", { name: "canvas actions" })).toBeVisible();
  await expect(page.locator(".graph-context-menu")).toHaveClass(/radial-root/);
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

  await page.locator(".graph-stage").click({ button: "right", position: { x: 100, y: 600 } });
  await page.getByRole("menuitem", { name: /^Graph/ }).click();
  await page.getByRole("menuitem", { name: "Create another graph" }).click();
  await page.getByLabel("Graph name").fill("Second graph");
  await page.getByRole("button", { name: "Create graph" }).click();

  await expect(page.getByRole("heading", { name: "Start a blank graph" })).toBeVisible();
  await expect(page.getByLabel("Active graph", { exact: true })).toHaveValue(/second-graph-/);
  await expect(page.getByLabel("Active graph", { exact: true }).locator("option")).toHaveCount(2);

  await page.locator(".graph-stage").click({ button: "right", position: { x: 100, y: 600 } });
  await page.getByRole("menuitem", { name: /^Graph/ }).click();
  await page.getByRole("menuitem", { name: "Add from corpus" }).click();
  const janeRow = page.locator(".membership-list label").filter({ hasText: "Jane Doe" });
  await janeRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add 1 document" }).click();
  await expect(page.locator(".graph-count")).toContainText("1 nodes");

  await page.getByRole("button", { name: "Remove from graph" }).click();
  await expect(page.locator(".graph-count")).toContainText("0 nodes");

  await page.getByRole("button", { name: "Cycle active graph" }).click();
  await expect(page.getByLabel("Active graph", { exact: true })).toHaveValue("all-documents");
  await expect(page.locator(".graph-count")).not.toContainText("0 nodes");
});

test.describe("responsive application shell", () => {
  test("preserves the desktop sidebar layout outside the graph", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".mobile-nav")).toBeHidden();
    await expect(page.locator(".app-shell")).toHaveCSS("grid-template-columns", "235px 1205px");
  });

  test("uses the same full-screen graph shell on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/graph");

    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".graph-toolbar")).toBeHidden();
    await expect(page.locator(".graph-list-panel")).toBeHidden();
    await expect(page.locator(".graph-inspector")).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cycle active graph" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select dataset" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cycle layout" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Graph tools" })).toHaveCount(0);

    const stage = await page.locator(".graph-stage").boundingBox();
    expect(stage).not.toBeNull();
    expect(stage?.x).toBe(0);
    expect(stage?.y).toBe(0);
    expect(stage?.width).toBe(1440);
    expect(stage?.height).toBe(900);
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

  test("keeps the mobile graph exactly viewport-sized", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/graph");

    await expect(page.locator(".graph-stage")).toBeVisible();
    await expect(page.locator(".graph-toolbar")).toBeHidden();
    await expect(page.locator(".graph-list-panel")).toBeHidden();
    await expect(page.locator(".graph-inspector")).toBeHidden();
    await expect(page.getByRole("button", { name: "Graph tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add graph document" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import", exact: true })).toBeVisible();
    await expect(page.locator(".graph-mobile-primary-button")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Search graph" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Cycle active graph" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Select dataset" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Cycle layout" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Fit graph" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Focus selection" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Toggle labels" })).toBeHidden();

    await page.getByRole("button", { name: "Graph tools" }).click();
    const tray = page.getByRole("menu", { name: "Graph tools" });
    await expect(tray).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Search" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Graph" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Dataset" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Layout" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Fit" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Focus" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Labels" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Clear" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Remove" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Delete" })).toBeVisible();

    const layout = await page.locator(".graph-stage").evaluate((stage) => {
      const rect = stage.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight
      };
    });
    expect(layout.x).toBe(0);
    expect(layout.y).toBe(0);
    expect(layout.width).toBe(layout.viewportWidth);
    expect(layout.height).toBe(layout.viewportHeight);
    expect(layout.pageWidth).toBe(layout.viewportWidth);
    expect(layout.pageHeight).toBe(layout.viewportHeight);
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
