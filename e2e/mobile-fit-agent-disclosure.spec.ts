import { expect, test } from "@playwright/test";

test("fits the graph canvas into the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/graph");

  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.getByRole("button", { name: "More graph controls" })).toBeVisible();
  await expect(page.getByLabel("Dataset filter")).toBeVisible();
  await expect(page.getByLabel("Document type filter")).toBeHidden();

  const stage = await page.locator(".graph-stage").boundingBox();
  expect(stage).not.toBeNull();
  expect(stage?.height).toBeGreaterThan(560);
  expect((stage?.y || 0) + (stage?.height || 0)).toBeLessThanOrEqual(844);

  await page.getByRole("button", { name: "More graph controls" }).click();
  await expect(page.getByLabel("Document type filter")).toBeVisible();
  await expect(page.getByLabel("Predicate filter")).toBeVisible();
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
