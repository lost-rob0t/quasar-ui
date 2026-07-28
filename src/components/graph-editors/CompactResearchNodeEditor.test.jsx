import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ current: null }));
vi.mock("../../store", () => ({ useQuasar: () => context.current }));

import CompactResearchNodeEditor, { parseResearchNodeIds } from "./CompactResearchNodeEditor";

describe("compact research node editor", () => {
  it("normalizes newline and comma-separated document IDs", () => {
    expect(parseResearchNodeIds("a, b\na\n c")).toEqual(["a", "b", "c"]);
  });

  it("shows the portable plan fields and selected graph inputs", () => {
    context.current = {
      actors: [{ id: "actor:search", label: "Search" }],
      execute: vi.fn(),
      setNotice: vi.fn(),
      addDocumentsToActiveGraph: vi.fn(),
      workspace: { positions: {} }
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CompactResearchNodeEditor
          dataset="case-alpha"
          inputIds={["starintel:org:a", "starintel:person:b"]}
          onClose={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(html).toContain("New research node");
    expect(html).toContain("Research plan");
    expect(html).toContain("Operator instructions");
    expect(html).toContain("starintel:org:a");
    expect(html).toContain("starintel:person:b");
    expect(html).toContain("Actor IDs");
    expect(html).toContain("Depth");
    expect(html).toContain("Stop rules");
    expect(html).toContain("Run controls unlock when the research-node runner is connected.");
    expect(html).toContain("Save plan");
  });
});
