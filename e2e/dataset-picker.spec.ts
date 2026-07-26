import { expect, test, type Page } from "@playwright/test";

async function installDatasetOptions(page: Page) {
  await page.getByLabel("Dataset filter", { exact: true }).evaluate((select) => {
    const replacement = select.cloneNode(false) as HTMLSelectElement;
    replacement.innerHTML = `
      <option value="all-datasets">All datasets</option>
      <option value="alpha">Alpha research</option>
      <option value="bravo">Bravo archive</option>
    `;
    replacement.value = "all-datasets";
    replacement.addEventListener("change", () => {
      replacement.dataset.lastChange = replacement.value;
    });
    select.replaceWith(replacement);
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(width.scroll).toBe(width.client);
}

test("selects a dataset from the desktop graph button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/graph");
  await installDatasetOptions(page);

  const button = page.getByRole("button", { name: "Select dataset" });
  await button.click();

  const dialog = page.getByRole("dialog", { name: "Select dataset" });
  const listbox = page.getByRole("listbox", { name: "Datasets" });
  await expect(dialog).toBeVisible();
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { name: "All datasets" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Dataset filter", { exact: true })).toHaveValue("alpha");
  await expect(page.getByLabel("Dataset filter", { exact: true })).toHaveAttribute(
    "data-last-change",
    "alpha"
  );
  await expect(button).toHaveAttribute("title", /Alpha research/);

  await button.click();
  await listbox.getByRole("option", { name: "Bravo archive" }).click();
  await expect(page.getByLabel("Dataset filter", { exact: true })).toHaveValue("bravo");
  await expect(dialog).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test("selects a dataset from the mobile graph tools tray", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/graph");
  await installDatasetOptions(page);

  await page.getByRole("button", { name: "Graph tools" }).click();
  await page
    .getByRole("menu", { name: "Graph tools" })
    .getByRole("menuitem", { name: "Dataset" })
    .click();

  const dialog = page.getByRole("dialog", { name: "Select dataset" });
  const listbox = page.getByRole("listbox", { name: "Datasets" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("menu", { name: "Graph tools" })).toBeHidden();
  await listbox.getByRole("option", { name: "Alpha research" }).click();
  await expect(page.getByLabel("Dataset filter", { exact: true })).toHaveValue("alpha");
  await expect(page.getByLabel("Dataset filter", { exact: true })).toHaveAttribute(
    "data-last-change",
    "alpha"
  );
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Graph tools" }).click();
  await page
    .getByRole("menu", { name: "Graph tools" })
    .getByRole("menuitem", { name: "Dataset" })
    .click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectNoHorizontalOverflow(page);
});
