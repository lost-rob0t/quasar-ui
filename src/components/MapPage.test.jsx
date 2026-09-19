import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MapPage, {
  GEO_PARTICIPATION_KINDS,
  GOTHAM_MAP_PROFILE,
  MAP_PRESENTATION_MODES,
  MAP_SEMANTICS_VERSION,
  buildMapControlMessage,
  mapEmbedUrl,
  normalizeMapDocumentId,
  normalizeMapMode,
  normalizeMapSelectionMessage,
  normalizeTemporalCursor
} from "./MapPage";
import { activeNavigationItem } from "../ui-core/navigation";

describe("StarIntel map surface", () => {
  it("builds an embedded Gotham renderer URL without selecting a third-party host", () => {
    expect(mapEmbedUrl("/maps/")).toBe("/maps/?embed=1&profile=gotham");
    expect(mapEmbedUrl("/maps/?theme=dark")).toBe("/maps/?theme=dark&embed=1&profile=gotham");
  });

  it("normalizes bounded Gotham presentation controls", () => {
    expect(GOTHAM_MAP_PROFILE).toBe("gotham");
    expect(MAP_SEMANTICS_VERSION).toBe("starintel.geo/1");
    expect(MAP_PRESENTATION_MODES.map(({ id }) => id)).toEqual([
      "sparse",
      "investigation",
      "detective"
    ]);
    expect(GEO_PARTICIPATION_KINDS.map(({ id }) => id)).toEqual(["direct", "anchored", "derived"]);
    expect(normalizeMapMode("investigation")).toBe("investigation");
    expect(normalizeMapMode("unknown")).toBe("sparse");
    expect(normalizeTemporalCursor(-20)).toBe(0);
    expect(normalizeTemporalCursor(48.8)).toBe(49);
    expect(normalizeTemporalCursor(200)).toBe(100);
  });

  it("accepts only exact bounded document identities at the map boundary", () => {
    expect(normalizeMapDocumentId("location:columbus")).toBe("location:columbus");
    expect(normalizeMapDocumentId(" location:columbus")).toBeNull();
    expect(normalizeMapDocumentId("location:columbus ")).toBeNull();
    expect(normalizeMapDocumentId("location:\u0007columbus")).toBeNull();
    expect(normalizeMapDocumentId("x".repeat(257))).toBeNull();
    expect(normalizeMapDocumentId(42)).toBeNull();
  });

  it("emits a versioned renderer-control message with an optional bounded anchor", () => {
    expect(
      buildMapControlMessage({
        mode: "detective",
        temporalCursor: 42,
        playing: true,
        anchorId: "location:columbus"
      })
    ).toEqual({
      type: "STARINTEL_MAP_CONTROL",
      version: 1,
      profile: "gotham",
      semanticsVersion: "starintel.geo/1",
      mode: "detective",
      temporalCursor: 42,
      playing: true,
      anchorId: "location:columbus"
    });
    expect(buildMapControlMessage({ anchorId: " location:columbus" }).anchorId).toBeNull();
  });

  it("accepts only bounded starintel.geo/1 renderer selection projections", () => {
    const projected = normalizeMapSelectionMessage({
      type: "STARINTEL_MAP_SELECTION",
      version: 1,
      semanticsVersion: "starintel.geo/1",
      anchorId: "location:columbus",
      participation: "anchored",
      primaryDocumentId: "person:alice",
      relatedDocumentIds: ["person:alice", "event:meeting"],
      authorizedRelatedCount: 2,
      provenanceCount: 3,
      approximate: true,
      stale: false,
      contested: true
    });

    expect(projected).toEqual({
      anchorId: "location:columbus",
      participation: "anchored",
      primaryDocumentId: "person:alice",
      relatedDocumentIds: ["person:alice", "event:meeting"],
      authorizedRelatedCount: 2,
      provenanceCount: 3,
      approximate: true,
      stale: false,
      contested: true
    });

    expect(
      normalizeMapSelectionMessage({ ...projected, type: "STARINTEL_MAP_SELECTION" })
    ).toBeNull();
    expect(
      normalizeMapSelectionMessage({
        type: "STARINTEL_MAP_SELECTION",
        version: 2,
        semanticsVersion: "starintel.geo/1",
        anchorId: "location:columbus",
        participation: "direct"
      })
    ).toBeNull();
    expect(
      normalizeMapSelectionMessage({
        type: "STARINTEL_MAP_SELECTION",
        version: 1,
        semanticsVersion: "starintel.geo/2",
        anchorId: "location:columbus",
        participation: "direct"
      })
    ).toBeNull();
    expect(
      normalizeMapSelectionMessage({
        type: "STARINTEL_MAP_SELECTION",
        version: 1,
        semanticsVersion: "starintel.geo/1",
        anchorId: " location:columbus",
        participation: "direct"
      })
    ).toBeNull();
    expect(
      normalizeMapSelectionMessage({
        type: "STARINTEL_MAP_SELECTION",
        version: 1,
        semanticsVersion: "starintel.geo/1",
        anchorId: "location:columbus",
        participation: "asserted"
      })
    ).toBeNull();
    expect(
      normalizeMapSelectionMessage({
        type: "STARINTEL_MAP_SELECTION",
        version: 1,
        semanticsVersion: "starintel.geo/1",
        anchorId: "location:columbus",
        participation: "direct",
        relatedDocumentIds: Array.from({ length: 25 }, (_, index) => `document:${index}`)
      })
    ).toBeNull();
    expect(
      normalizeMapSelectionMessage({
        type: "STARINTEL_MAP_SELECTION",
        version: 1,
        semanticsVersion: "starintel.geo/1",
        anchorId: "location:columbus",
        participation: "direct",
        relatedDocumentIds: ["document:one", "document:two"],
        authorizedRelatedCount: 1
      })
    ).toBeNull();
  });

  it("renders the configured renderer with explicit Geo evidence grammar and temporal controls", () => {
    const html = renderToStaticMarkup(<MapPage serviceUrl="/maps/" />);

    expect(html).toContain('data-map-service="/maps/"');
    expect(html).toContain('data-map-profile="gotham"');
    expect(html).toContain('data-map-semantics-version="starintel.geo/1"');
    expect(html).toContain('data-map-mode="sparse"');
    expect(html).toContain('title="StarIntel map"');
    expect(html).toContain('src="/maps/?embed=1&amp;profile=gotham"');
    expect(html).toContain("promoted layers");
    expect(html).toContain("provenance retained");
    expect(html).toContain('aria-label="Map presentation mode"');
    expect(html).toContain('aria-label="Temporal cursor"');
    expect(html).toContain("Direct geometry");
    expect(html).toContain("Anchored projection");
    expect(html).toContain("Derived projection");
    expect(html).toContain("Asserted relation");
    expect(html).toContain("Inferred relation");
    expect(html).toContain("Candidate relation");
    expect(html).toContain("Approximate geometry");
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
