import { expect, test } from "@playwright/test";

test("uses a bounded desktop workspace with a navigation menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/graph");

  await expect(page.locator(".graph-stage")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  const graphMenu = page.locator(".graph-stage").getByRole("button", { name: "Open menu" });
  await expect(graphMenu).toBeVisible();

  const viewport = await page.locator(".graph-workbench").evaluate((workbench) => {
    const bounds = workbench.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      bottom: bounds.bottom,
      width: window.innerWidth,
      height: window.innerHeight
    };
  });

  expect(viewport.left).toBeGreaterThanOrEqual(0);
  expect(viewport.right).toBeLessThanOrEqual(viewport.width);
  expect(viewport.bottom).toBeLessThanOrEqual(viewport.height);

  await graphMenu.click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Graph", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Docs", exact: true })).toBeVisible();
});
