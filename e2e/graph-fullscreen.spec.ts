import { expect, test } from "@playwright/test";

test("uses a bounded desktop workspace with a navigation menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/graph");

  const stage = page.locator(".graph-stage");
  await expect(stage).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
  const defaultBounds = await stage.boundingBox();
  expect(defaultBounds).not.toBeNull();
  expect(defaultBounds!.height).toBeGreaterThan(540);

  await page.getByRole("button", { name: "Enter full viewport" }).click();
  await expect(page.locator("body")).toHaveClass(/graph-viewport-full/);
  const fullBounds = await stage.boundingBox();
  expect(fullBounds).not.toBeNull();
  expect(fullBounds!.left).toBeCloseTo(0, 0);
  expect(fullBounds!.top).toBeCloseTo(0, 0);
  expect(fullBounds!.width).toBeCloseTo(1440, 0);
  expect(fullBounds!.height).toBeCloseTo(900, 0);

  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/graph-viewport-full/);
  await expect(page.locator(".sidebar")).toBeVisible();

  const graphMenu = stage.getByRole("button", { name: "Open menu" });
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
