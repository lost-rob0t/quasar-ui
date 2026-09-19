import { expect, test } from "@playwright/test";

test("opens the full-screen StarIntel Gotham map workspace", async ({ page }) => {
  await page.goto("/map");

  const workspace = page.locator(".map-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace).toHaveAttribute("data-map-profile", "gotham");
  await expect(workspace).toHaveAttribute("data-map-semantics-version", "starintel.geo/1");
  await expect(page.getByTitle("StarIntel map")).toHaveAttribute(
    "src",
    /\/maps\/\?embed=1&profile=gotham$/
  );
  await expect(page.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("promoted layers")).toBeVisible();
  await expect(page.getByText("provenance retained")).toBeVisible();

  await expect(page.getByText("Direct geometry")).toBeVisible();
  await expect(page.getByText("Anchored projection")).toBeVisible();
  await expect(page.getByText("Derived projection")).toBeVisible();
  await expect(page.getByText("Asserted relation")).toBeVisible();
  await expect(page.getByText("Inferred relation")).toBeVisible();
  await expect(page.getByText("Candidate relation")).toBeVisible();
  await expect(page.getByText("Approximate geometry")).toBeVisible();
  await expect(page.getByText("Uncertainty halo")).toBeVisible();
  await expect(page.getByText("Recent-event pulse")).toBeVisible();
  await expect(page.getByText("Movement trail")).toBeVisible();
  await expect(page.getByText("Stale")).toBeVisible();
  await expect(page.getByText("Contested")).toBeVisible();

  await page.getByRole("button", { name: "Investigation" }).click();
  await expect(workspace).toHaveAttribute("data-map-mode", "investigation");

  const temporalCursor = page.getByRole("slider", { name: "Temporal cursor" });
  await temporalCursor.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "42");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(workspace).toHaveAttribute("data-map-temporal-cursor", "42");

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});
