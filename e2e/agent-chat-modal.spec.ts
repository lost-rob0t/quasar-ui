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

test("presents unavailable filesystem and shell capabilities without requesting permission", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open agent chat" }).click();
  const modal = page.getByRole("region", { name: "Quasar agent chat" });
  const composer = modal.getByRole("textbox", { name: "Agent prompt" });

  await composer.fill("/file");
  await expect(modal.getByRole("option", { name: /\/file-read.*unavailable/i })).toBeVisible();
  await expect(modal.getByRole("option", { name: /\/file-write.*unavailable/i })).toBeVisible();

  await composer.fill("/shell echo hello");
  await composer.press("Enter");
  await expect(modal.getByText("/shell is unavailable: No trusted shell adapter is configured in this browser build.")).toBeVisible();
  await expect(modal.getByText("Permission requested: shell_execute")).toHaveCount(0);
});

test("searches and switches between saved conversations", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("quasar:agent-conversations:v1", JSON.stringify({
      version: 1,
      conversations: [
        {
          id: "conversation:alpha",
          title: "Alpha investigation",
          createdAt: "2026-07-28T10:00:00.000Z",
          updatedAt: "2026-07-28T10:05:00.000Z",
          messages: [],
          turns: [],
          taskList: [],
          draft: "alpha draft",
          runId: null,
          state: "idle"
        },
        {
          id: "conversation:bravo",
          title: "Bravo sources",
          createdAt: "2026-07-28T09:00:00.000Z",
          updatedAt: "2026-07-28T09:05:00.000Z",
          messages: [],
          turns: [],
          taskList: [],
          draft: "bravo draft",
          runId: null,
          state: "completed"
        }
      ]
    }));
    localStorage.setItem("quasar:agent-active-conversation:v1", "conversation:alpha");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open agent chat" }).click();

  await page.getByRole("button", { name: /Alpha investigation/ }).click();
  const switcher = page.getByRole("dialog", { name: "Switch conversation" });
  await expect(switcher).toBeVisible();
  await switcher.getByRole("textbox", { name: "Search conversations" }).fill("bravo");
  await expect(switcher.getByRole("option", { name: /Bravo sources/ })).toBeVisible();
  await switcher.getByRole("option", { name: /Bravo sources/ }).click();

  await expect(page.getByRole("textbox", { name: "Agent prompt" })).toHaveValue("bravo draft");
  await expect(page.getByRole("button", { name: /Bravo sources/ })).toBeVisible();
});

test("resizes the desktop chat and restores its dimensions", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open agent chat" }).click();

  const modal = page.getByRole("region", { name: "Quasar agent chat" });
  const handle = page.getByRole("button", { name: "Resize agent chat" });
  const before = await modal.boundingBox();
  const handleBox = await handle.boundingBox();
  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x - 70, handleBox!.y - 60, { steps: 5 });
  await page.mouse.up();

  const resized = await modal.boundingBox();
  expect(resized!.width).toBeLessThan(before!.width - 50);
  expect(resized!.height).toBeLessThan(before!.height - 40);

  await page.reload();
  await page.getByRole("button", { name: "Open agent chat" }).click();
  const restored = await page.getByRole("region", { name: "Quasar agent chat" }).boundingBox();
  expect(restored!.width).toBeCloseTo(resized!.width, 0);
  expect(restored!.height).toBeCloseTo(resized!.height, 0);
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

test("creates, reads, patches, deletes, and restores a document through agent capabilities", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-agent-capability-ready="document"]')).toBeAttached();
  const stamp = "2026-07-27T00:00:00.000Z";
  const document = {
    _id: "starintel:org:agent-e2e",
    dataset: "agent-e2e",
    dtype: "org",
    schema_version: "0.9.0",
    version: 1,
    date_added: stamp,
    date_updated: stamp,
    title: "Agent E2E",
    sources: [],
    evidence: [],
    data: { name: "Agent E2E" }
  };
  const invoke = async <T,>(name: string, args: unknown): Promise<T> => page.evaluate(({ capabilityName, capabilityArgs }) => new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent("quasar:agent-document-capability", {
      detail: { name: capabilityName, args: capabilityArgs, context: {}, resolve, reject }
    }));
  }), { capabilityName: name, capabilityArgs: args }) as Promise<T>;

  const created = await invoke<{ created: boolean; id: string }>("document_create", { document });
  expect(created).toMatchObject({ created: true, id: document._id });
  const read = await invoke<{ count: number }>("document_read", { ids: [document._id] });
  expect(read).toMatchObject({ count: 1 });

  const patched = await invoke<{ patched: boolean; id: string }>("document_patch", { id: document._id, patch: { title: "Patched by agent", data: { name: "Patched by agent" } } });
  expect(patched).toMatchObject({ patched: true, id: document._id });
  const afterPatch = await invoke<{ documents: Array<{ title: string }> }>("document_read", { ids: [document._id] });
  expect(afterPatch.documents[0].title).toBe("Patched by agent");

  const deleted = await invoke<{ deleted: boolean; id: string }>("document_delete", { id: document._id });
  expect(deleted).toMatchObject({ deleted: true, id: document._id });
  await expect.poll(async () => (await invoke<{ count: number }>("document_read", { ids: [document._id] })).count).toBe(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await invoke<{ count: number }>("document_read", { ids: [document._id] })).count).toBe(1);
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
