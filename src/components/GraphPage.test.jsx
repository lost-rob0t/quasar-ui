import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ current: null }));
vi.mock("../store", () => ({ useQuasar: () => context.current }));
vi.mock("../lib/operations", () => ({
  operation: {
    save: (value) => ({ type: "save-document", document: value })
  }
}));

import GraphPage from "./GraphPage";

const stamp = "2026-07-25T20:00:00.000Z";
const document = (id, dtype, data, verified) => ({
  _id: id,
  dataset: "test",
  dtype,
  schema_version: "0.9.0",
  version: 1,
  date_added: stamp,
  date_updated: stamp,
  title: id,
  sources: [],
  evidence: [],
  verification: { verified, status: verified ? "verified" : "unverified" },
  data
});

describe("graph local corpus status", () => {
  it("offers manual creation from an empty graph", () => {
    context.current = {
      documents: [],
      workspace: { positions: {}, layout: "cose" },
      selectedIds: [],
      selectedDocuments: [],
      select: vi.fn(),
      persistWorkspace: vi.fn(),
      actors: [],
      runActor: vi.fn(),
      settings: { actorsEnabled: false },
      setNotice: vi.fn()
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/graph"]}>
        <Routes><Route path="/graph" element={<GraphPage />} /></Routes>
      </MemoryRouter>
    );

    expect(html).toContain("Start a blank graph");
    expect(html).toContain("Create first node");
    expect(html).toContain("Import documents");
  });

  it("reveals why newly-created unreviewed nodes are hidden", () => {
    const documents = [
      document("starintel:entity:manual", "entity", { name: "Manual" }, false)
    ];
    context.current = {
      documents,
      workspace: { positions: {}, layout: "cose" },
      selectedIds: [],
      selectedDocuments: [],
      select: vi.fn(),
      persistWorkspace: vi.fn(),
      actors: [],
      runActor: vi.fn(),
      settings: { actorsEnabled: false },
      setNotice: vi.fn()
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/graph"]}>
        <Routes><Route path="/graph" element={<GraphPage />} /></Routes>
      </MemoryRouter>
    );

    expect(html).toContain("1 unreviewed document(s) are hidden");
    expect(html).toContain("Show unreviewed");
    expect(html).toContain("Create first node");
  });

  it("reveals imported unreviewed records and reports corpus review counts", () => {
    const documents = [
      document("starintel:org:reviewed", "org", { name: "Reviewed" }, true),
      document("starintel:org:imported", "org", { name: "Imported" }, false),
      document("starintel:relation:imported", "relation", {
        subject: "starintel:org:reviewed",
        predicate: "related-to",
        object: "starintel:org:imported",
        directed: true
      }, false)
    ];
    context.current = {
      documents,
      workspace: { positions: {}, layout: "cose" },
      selectedIds: [],
      selectedDocuments: [],
      select: vi.fn(),
      persistWorkspace: vi.fn(),
      actors: [],
      runActor: vi.fn(),
      settings: { actorsEnabled: false },
      setNotice: vi.fn()
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{
        pathname: "/graph",
        state: {
          importedIds: ["starintel:org:imported", "starintel:relation:imported"],
          revealUnreviewed: true,
          source: "local-import"
        }
      }]}>
        <Routes><Route path="/graph" element={<GraphPage />} /></Routes>
      </MemoryRouter>
    );

    expect(html).toContain("Local PouchDB corpus");
    expect(html).toContain("1 reviewed");
    expect(html).toContain("2 unreviewed");
    expect(html).toContain("Imported records are revealed for this graph session");
    expect(html).toContain("2 nodes");
    expect(html).toContain("1 edges");
  });
});
