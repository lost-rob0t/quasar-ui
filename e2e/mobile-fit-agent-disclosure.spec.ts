import { expect, test } from "@playwright/test";

test("uses a full-screen graph canvas with only compact buttons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/graph");

  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".graph-toolbar")).toBeHidden();
  await expect(page.locator(".graph-list-panel")).toBeHidden();
  await expect(page.locator(".graph-inspector")).toBeHidden();
  await expect(page.getByLabel("Dataset filter", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Graph layout", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Maltego graph layout", { exact: true })).toBeHidden();
  await expect(page.getByLabel("Active graph", { exact: true })).toBeHidden();

  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cycle active graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cycle dataset" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cycle layout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add graph document" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit graph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Focus selection" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle labels" })).toBeVisible();

  const stage = await page.locator(".graph-stage").boundingBox();
  expect(stage).not.toBeNull();
  expect(stage?.x).toBe(0);
  expect(stage?.y).toBe(0);
  expect(stage?.width).toBe(390);
  expect(stage?.height).toBe(844);

  await page.getByRole("button", { name: "Search graph" }).click();
  await expect(page.getByRole("textbox", { name: "Graph search overlay" })).toBeVisible();
  await page.getByRole("textbox", { name: "Graph search overlay" }).fill("Jane");
  await expect(page.locator(".graph-search input")).toHaveValue("Jane");
  await page.getByRole("button", { name: "Close graph search" }).click();

  await expect(page.getByLabel("Maltego graph layout", { exact: true })).toHaveValue("organic");
  await page.getByRole("button", { name: "Cycle layout" }).click();
  await expect(page.getByLabel("Maltego graph layout", { exact: true })).toHaveValue("interactive-organic");

  await page.locator(".graph-stage").click({ button: "right", position: { x: 180, y: 360 } });
  const radial = page.locator(".graph-context-menu.canvas-actions.radial-root");
  await expect(radial).toBeVisible();
  await expect(radial.getByRole("menuitem", { name: /Create node/ })).toBeVisible();
  await expect(radial.getByRole("menuitem", { name: /Graph/ })).toBeVisible();
  await expect(radial.getByRole("menuitem", { name: /Layout/ })).toBeVisible();
  await expect(radial.getByRole("menuitem", { name: /Ingest/ })).toBeVisible();
});

test("collapses thinking and tool output until expanded", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const log = document.createElement("div");
    log.className = "agent-log";
    log.innerHTML = `
      <article class="agent-log-entry model"><strong>Agent</strong><pre>private reasoning payload</pre></article>
      <article class="agent-log-entry tool"><strong>web_search</strong><pre>tool result payload</pre></article>
    `;
    document.querySelector(".content")?.appendChild(log);
  });

  const thinking = page.getByRole("button", { name: /Agent thinking/ });
  const tool = page.getByRole("button", { name: /web_search/ });
  await expect(thinking).toBeVisible();
  await expect(tool).toBeVisible();
  await expect(page.getByText("private reasoning payload")).toBeHidden();
  await expect(page.getByText("tool result payload")).toBeHidden();

  await thinking.click();
  await expect(page.getByText("private reasoning payload")).toBeVisible();
  await tool.click();
  await expect(page.getByText("tool result payload")).toBeVisible();
});
