import { expect, test } from "@playwright/test";

test("opens the full-screen StarIntel Gotham map workspace", async ({ page }, testInfo) => {
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

  const normalEvidence = testInfo.outputPath("map-normal.png");
  await page.screenshot({ path: normalEvidence });
  await testInfo.attach("map-normal", { path: normalEvidence, contentType: "image/png" });

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

test("accepts investigation selections only from the configured renderer window", async ({
  page
}, testInfo) => {
  await page.goto("/map");
  const frame = page.getByTitle("StarIntel map");
  await expect(frame).toBeVisible();

  const projection = {
    type: "STARINTEL_MAP_SELECTION",
    version: 1,
    semanticsVersion: "starintel.geo/1",
    anchorId: "location:columbus",
    participation: "anchored",
    primaryDocumentId: "person:alice",
    relatedDocumentIds: ["person:alice", "event:meeting"],
    relationPaths: [
      {
        kind: "asserted",
        documents: ["person:alice", "event:meeting", "location:columbus"],
        predicates: ["attended", "observedAt"]
      },
      {
        kind: "candidate",
        documents: ["person:alice", "location:columbus"],
        predicates: ["associatedWithPlace"]
      }
    ],
    bloomDocumentIds: ["person:alice", "event:meeting"],
    authorizedRelatedCount: 2,
    provenanceCount: 3,
    approximate: true,
    stale: false,
    contested: true
  };

  await page.evaluate((data) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        source: window,
        data
      })
    );
  }, projection);
  await expect(
    page.getByRole("complementary", { name: "Map investigation selection" })
  ).toHaveCount(0);

  await page.evaluate((data) => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="StarIntel map"]');
    if (!iframe?.contentWindow) throw new Error("map renderer frame missing");
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        source: iframe.contentWindow,
        data
      })
    );
  }, projection);

  const selection = page.getByRole("complementary", { name: "Map investigation selection" });
  await expect(selection).toBeVisible();
  await expect(selection.getByText("Anchored projection")).toBeVisible();
  await expect(selection.getByText("location:columbus", { exact: true })).toBeVisible();
  await expect(selection.getByText("Approximate", { exact: true })).toBeVisible();
  await expect(selection.getByText("Contested", { exact: true })).toBeVisible();
  await expect(selection.getByText("2", { exact: true })).toBeVisible();
  await expect(selection.getByText("3", { exact: true })).toBeVisible();
  await expect(selection.getByRole("link", { name: "Open primary document" })).toHaveAttribute(
    "href",
    "/documents/person%3Aalice"
  );
  const relatedDocuments = selection.locator(".map-selection-related");
  await expect(relatedDocuments.getByRole("link", { name: "person:alice" })).toHaveAttribute(
    "href",
    "/documents/person%3Aalice"
  );
  await expect(selection.getByLabel("Relation path inspector")).toContainText(
    "person:alice —attended→ event:meeting —observedAt→ location:columbus"
  );
  await expect(selection.getByText("asserted", { exact: true })).toBeVisible();
  await expect(selection.getByText("candidate", { exact: true })).toBeVisible();
  const bloom = selection.getByLabel("Authorized graph bloom");
  await expect(bloom).toContainText("2 authorized nodes in this neighborhood.");
  await expect(bloom.getByRole("link", { name: "person:alice" })).toHaveAttribute(
    "href",
    "/graph?node=person%3Aalice&review=all"
  );
  await expect(bloom.getByRole("link", { name: "event:meeting" })).toHaveAttribute(
    "href",
    "/graph?node=event%3Ameeting&review=all"
  );
  await expect(selection.getByRole("link", { name: "Inspect in graph" })).toHaveAttribute(
    "href",
    "/graph?node=person%3Aalice&review=all"
  );
  await expect(page).toHaveURL(/anchor=location%3Acolumbus/);

  const expandedEvidence = testInfo.outputPath("map-investigation-expanded.png");
  await page.screenshot({ path: expandedEvidence });
  await testInfo.attach("map-investigation-expanded", {
    path: expandedEvidence,
    contentType: "image/png"
  });

  await page.getByRole("button", { name: "Clear map selection" }).click();
  await expect(selection).toHaveCount(0);
  await expect(page).not.toHaveURL(/anchor=/);
});
