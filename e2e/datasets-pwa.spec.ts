import { expect, test } from "@playwright/test";

test("opens the datasets navigation as a dataset index", async ({ page }) => {
  await page.goto("/documents?group=dataset");

  await expect(page.getByRole("heading", { name: "Datasets" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search datasets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documents" })).toHaveCount(0);
});

test("exposes the PWA install action inside the graph workspace", async ({ page }) => {
  await page.goto("/graph");

  const install = page.getByRole("button", { name: "Install Quasar" });
  await expect(install).toBeVisible();

  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt");
    Object.defineProperties(event, {
      prompt: {
        value: () => {
          window.__quasarInstallPrompted = true;
          return Promise.resolve();
        }
      },
      userChoice: {
        value: Promise.resolve({ outcome: "accepted", platform: "web" })
      }
    });
    window.dispatchEvent(event);
  });

  await install.click();
  await expect.poll(() => page.evaluate(() => window.__quasarInstallPrompted)).toBe(true);
});
