import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MapPage, { mapEmbedUrl } from "./MapPage";
import { activeNavigationItem } from "../ui-core/navigation";

describe("StarIntel map surface", () => {
  it("builds an embedded StarIntel renderer URL without selecting a third-party host", () => {
    expect(mapEmbedUrl("/maps/")).toBe("/maps/?embed=1");
    expect(mapEmbedUrl("/maps/?theme=dark")).toBe("/maps/?theme=dark&embed=1");
  });

  it("renders the configured renderer with promotion and provenance chrome", () => {
    const html = renderToStaticMarkup(<MapPage serviceUrl="/maps/" />);

    expect(html).toContain('data-map-service="/maps/"');
    expect(html).toContain('title="StarIntel map"');
    expect(html).toContain('src="/maps/?embed=1"');
    expect(html).toContain("promoted layers");
    expect(html).toContain("provenance retained");
  });

  it("treats /map as a primary workspace route", () => {
    expect(activeNavigationItem("/map")?.label).toBe("Map");
  });
});
