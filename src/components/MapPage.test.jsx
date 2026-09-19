import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MapPage, {
  GOTHAM_MAP_PROFILE,
  MAP_PRESENTATION_MODES,
  buildMapControlMessage,
  mapEmbedUrl,
  normalizeMapMode,
  normalizeTemporalCursor
} from "./MapPage";
import { activeNavigationItem } from "../ui-core/navigation";

describe("StarIntel map surface", () => {
  it("builds an embedded Gotham renderer URL without selecting a third-party host", () => {
    expect(mapEmbedUrl("/maps/")).toBe("/maps/?embed=1&profile=gotham");
    expect(mapEmbedUrl("/maps/?theme=dark")).toBe(
      "/maps/?theme=dark&embed=1&profile=gotham"
    );
  });

  it("normalizes bounded Gotham presentation controls", () => {
    expect(GOTHAM_MAP_PROFILE).toBe("gotham");
    expect(MAP_PRESENTATION_MODES.map(({ id }) => id)).toEqual([
      "sparse",
      "investigation",
      "detective"
    ]);
    expect(normalizeMapMode("investigation")).toBe("investigation");
    expect(normalizeMapMode("unknown")).toBe("sparse");
    expect(normalizeTemporalCursor(-20)).toBe(0);
    expect(normalizeTemporalCursor(48.8)).toBe(49);
    expect(normalizeTemporalCursor(200)).toBe(100);
  });

  it("emits a versioned renderer-control message without mutating evidence semantics", () => {
    expect(
      buildMapControlMessage({ mode: "detective", temporalCursor: 42, playing: true })
    ).toEqual({
      type: "STARINTEL_MAP_CONTROL",
      version: 1,
      profile: "gotham",
      mode: "detective",
      temporalCursor: 42,
      playing: true
    });
  });

  it("renders the configured renderer with semantic grammar and temporal controls", () => {
    const html = renderToStaticMarkup(<MapPage serviceUrl="/maps/" />);

    expect(html).toContain('data-map-service="/maps/"');
    expect(html).toContain('data-map-profile="gotham"');
    expect(html).toContain('data-map-mode="sparse"');
    expect(html).toContain('title="StarIntel map"');
    expect(html).toContain('src="/maps/?embed=1&amp;profile=gotham"');
    expect(html).toContain("promoted layers");
    expect(html).toContain("provenance retained");
    expect(html).toContain('aria-label="Map presentation mode"');
    expect(html).toContain('aria-label="Temporal cursor"');
    expect(html).toContain("Explicit relation");
    expect(html).toContain("Inferred relation");
    expect(html).toContain("Candidate relation");
    expect(html).toContain("Uncertainty halo");
    expect(html).toContain("Recent-event pulse");
    expect(html).toContain("Movement trail");
    expect(html).toContain("Stale");
    expect(html).toContain("Contested");
  });

  it("treats /map as a primary workspace route", () => {
    expect(activeNavigationItem("/map")?.label).toBe("Map");
  });
});
