import { expect, test } from "@playwright/test";

test("opens the full-screen StarIntel map workspace", async ({ page }) => {
  await page.goto("/map");

  await expect(page.locator(".map-workspace")).toBeVisible();
  await expect(page.getByTitle("StarIntel map")).toHaveAttribute("src", /\/maps\/\?embed=1$/);
  await expect(page.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("promoted layers")).toBeVisible();
  await expect(page.getByText("provenance retained")).toBeVisible();
});
