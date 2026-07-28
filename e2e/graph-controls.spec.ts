import { expect, test, type Locator } from "@playwright/test";

type GraphSnapshot = {
  node: { x: number; y: number };
  pan: { x: number; y: number };
  zoom: number;
};

async function graphSnapshot(canvas: Locator): Promise<GraphSnapshot> {
  return canvas.evaluate((element) => {
    const graphElement = element as HTMLElement & {
      __quasarGraphAdapter?: {
        nodes: () => { first: () => { length: number; renderedPosition: () => { x: number; y: number } } };
        pan: () => { x: number; y: number };
        zoom: () => number;
      };
    };
    const cy = graphElement.__quasarGraphAdapter;
    if (!cy) throw new Error("Development graph adapter is unavailable");
    const node = cy.nodes().first();
    if (!node.length) throw new Error("Graph node is unavailable");
    return {
      node: node.renderedPosition(),
      pan: cy.pan(),
      zoom: cy.zoom()
    };
  });
}

function backgroundPoint(node: { x: number; y: number }, width: number, height: number) {
  return {
    x: node.x < width / 2 ? width - 100 : 100,
    y: height - 100
  };
}

test("uses left click select, left drag pan, and right drag box select", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/graph");

  const suffix = Date.now().toString(36);
  const stage = page.locator(".graph-stage");
  const canvas = page.locator(".graph-canvas");
  await stage.click({ button: "right", position: { x: 220, y: 220 } });
  await page.getByRole("button", { name: "Create person here" }).click();

  const editor = page.getByRole("dialog", { name: "New Person" });
  await editor.getByLabel(/^First Name/).fill(`Control-${suffix}`);
  await editor.getByLabel(/^Last Name/).fill(`Test-${suffix}`);
  await editor.getByLabel(/^Display Name/).fill(`Control Test ${suffix}`);
  await editor.getByRole("button", { name: "Save" }).click();

  const selectionHeading = page.locator(".graph-inspector h2").first();
  await expect(page.locator(".graph-count")).toContainText("nodes");
  await expect(selectionHeading).toContainText("1");

  const dismissNotice = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismissNotice.isVisible()) await dismissNotice.click();

  await page.getByRole("button", { name: "Focus selection" }).click();
  await page.waitForTimeout(400);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const width = bounds?.width || 0;
  const height = bounds?.height || 0;
  const origin = { x: bounds?.x || 0, y: bounds?.y || 0 };

  const beforeZoom = await graphSnapshot(canvas);
  await page.mouse.move(origin.x + beforeZoom.node.x, origin.y + beforeZoom.node.y);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(200);
  const afterZoom = await graphSnapshot(canvas);
  expect(afterZoom.zoom).toBeLessThan(beforeZoom.zoom);
  await page.waitForTimeout(500);
  const settledZoom = await graphSnapshot(canvas);
  expect(settledZoom.zoom).toBeCloseTo(afterZoom.zoom, 5);

  let background = backgroundPoint(settledZoom.node, width, height);
  await canvas.click({ position: background });
  await expect(selectionHeading).toContainText("0");

  await canvas.click({ position: settledZoom.node });
  await expect(selectionHeading).toContainText("1");

  background = backgroundPoint(settledZoom.node, width, height);
  await canvas.click({ position: background });
  await expect(selectionHeading).toContainText("0");

  const beforePan = await graphSnapshot(canvas);
  const panStart = beforePan.node.x >= width / 2
    ? { x: 180, y: height - 170 }
    : { x: width - 180, y: height - 170 };
  const panEnd = beforePan.node.x >= width / 2
    ? { x: 480, y: height - 50 }
    : { x: width - 480, y: height - 50 };
  const expectedShift = {
    x: panEnd.x - panStart.x,
    y: panEnd.y - panStart.y
  };

  await page.mouse.move(origin.x + panStart.x, origin.y + panStart.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(origin.x + panEnd.x, origin.y + panEnd.y, { steps: 12 });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(500);

  const afterPan = await graphSnapshot(canvas);
  expect(afterPan.pan.x - beforePan.pan.x).toBeCloseTo(expectedShift.x, 0);
  expect(afterPan.pan.y - beforePan.pan.y).toBeCloseTo(expectedShift.y, 0);
  expect(afterPan.node.x - beforePan.node.x).toBeCloseTo(expectedShift.x, 0);
  expect(afterPan.node.y - beforePan.node.y).toBeCloseTo(expectedShift.y, 0);

  await canvas.click({ button: "right", position: beforePan.node });
  await expect(page.getByRole("menu", { name: "canvas actions" })).toBeVisible();
  await page.keyboard.press("Escape");

  await canvas.click({ button: "right", position: afterPan.node });
  await expect(page.getByRole("menu", { name: "node actions" })).toBeVisible();
  await expect(selectionHeading).toContainText("1");
  await page.keyboard.press("Escape");

  background = backgroundPoint(afterPan.node, width, height);
  await canvas.click({ position: background });
  await expect(selectionHeading).toContainText("0");

  const boxStart = {
    x: Math.max(5, afterPan.node.x - 70),
    y: Math.max(5, afterPan.node.y - 70)
  };
  const boxEnd = {
    x: Math.min(width - 5, afterPan.node.x + 70),
    y: Math.min(height - 5, afterPan.node.y + 70)
  };
  await page.mouse.move(origin.x + boxStart.x, origin.y + boxStart.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(origin.x + boxEnd.x, origin.y + boxEnd.y, { steps: 10 });
  await page.mouse.up({ button: "right" });

  await expect(selectionHeading).toContainText("1");
  await expect(page.locator(".graph-context-menu")).toBeHidden();
});
