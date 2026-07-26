import { expect, test } from "@playwright/test";

test("runs target-create actors from a newly created target", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/documents/new?dtype=target&returnTo=graph");
  await page.getByLabel("actor").fill("quasar.actor.target-input-expansion");
  await page.getByLabel("target").fill("https://example.com/research");
  await page.getByRole("button", { name: "Save document" }).click();

  await expect(page).toHaveURL(/\/graph\?node=/);
  await expect(page.locator(".graph-count")).toContainText("2 nodes");
  await expect(page.locator(".graph-count")).toContainText("1 edges");
});
