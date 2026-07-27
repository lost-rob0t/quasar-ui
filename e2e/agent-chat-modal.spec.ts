import { expect, test } from "@playwright/test";

test("opens the persistent agent modal and derives command help from capabilities", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Open agent chat" }).click();
  const modal = page.getByRole("region", { name: "Quasar agent chat" });
  await expect(modal).toBeVisible();
  await expect(modal.getByText("Agent ready")).toBeVisible();

  const composer = modal.getByRole("textbox", { name: "Agent prompt" });
  await composer.fill("/");
  await expect(modal.getByRole("listbox", { name: "Agent commands" })).toBeVisible();
  await composer.fill("/sea");
  await expect(modal.getByRole("option", { name: /\/search/ })).toBeVisible();

  await composer.fill("/fetch");
  await expect(modal.getByText("Missing required argument: url")).toBeVisible();
  await expect(modal.getByText(/\/fetch --url <string>/)).toBeVisible();

  await composer.fill("draft survives refresh");
  await page.reload();
  await page.getByRole("button", { name: "Open agent chat" }).click();
  await expect(page.getByRole("textbox", { name: "Agent prompt" })).toHaveValue("draft survives refresh");
});

test("renders and restores a partial provider stream", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open agent chat" }).click();

  await page.evaluate(() => {
    const base = { streamId: "stream:e2e", provider: "openai", model: "test", at: new Date().toISOString() };
    window.dispatchEvent(new CustomEvent("quasar:agent-provider-stream", { detail: { ...base, type: "start" } }));
    window.dispatchEvent(new CustomEvent("quasar:agent-provider-stream", { detail: { ...base, type: "delta", text: "partial response" } }));
  });

  await expect(page.locator('[data-provider-stream="stream:e2e"]')).toContainText("partial response");
  await page.reload();
  await page.getByRole("button", { name: "Open agent chat" }).click();
  await expect(page.locator('[data-provider-stream="stream:e2e"]')).toContainText("partial response");
});

test("keeps the modal chat inside the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/graph");
  await page.getByRole("button", { name: "Open agent chat" }).click();

  const modal = page.getByRole("region", { name: "Quasar agent chat" });
  await expect(modal).toBeVisible();
  const layout = await modal.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    };
  });

  expect(layout.left).toBe(0);
  expect(layout.top).toBe(0);
  expect(layout.right).toBe(layout.viewportWidth);
  expect(layout.bottom).toBe(layout.viewportHeight);
  expect(layout.pageWidth).toBe(layout.viewportWidth);
  expect(layout.pageHeight).toBe(layout.viewportHeight);
});
