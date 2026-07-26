import { expect, test } from "@playwright/test";

type ViewportState = {
  panX: number;
  panY: number;
  zoom: number;
};

async function viewportState(canvas: ReturnType<Parameters<typeof test>[0]> extends never ? never : any): Promise<ViewportState> {
  return canvas.evaluate((element: HTMLElement) => ({
    panX: Number(element.dataset.graphPanX),
    panY: Number(element.dataset.graphPanY),
    zoom: Number(element.dataset.graphZoom)
  }));
}

test("desktop graph canvas pans and zooms", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/graph");

  const canvas = page.locator(".graph-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await viewportState(canvas)).zoom).toBeGreaterThan(0);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const start = {
    x: bounds.x + bounds.width * 0.62,
    y: bounds.y + bounds.height * 0.72
  };
  const beforePan = await viewportState(canvas);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 70, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => {
    const current = await viewportState(canvas);
    return Math.abs(current.panX - beforePan.panX) + Math.abs(current.panY - beforePan.panY);
  }).toBeGreaterThan(40);

  const beforeZoom = await viewportState(canvas);
  await page.mouse.move(start.x, start.y);
  await page.mouse.wheel(0, -600);

  await expect.poll(async () => (await viewportState(canvas)).zoom).toBeGreaterThan(beforeZoom.zoom);
});
