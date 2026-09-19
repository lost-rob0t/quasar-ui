import { dtypes } from "starintel_doc";
import { describe, expect, it } from "vitest";
import { DTYPE_ICON_KEYS, UNRESOLVED_GRAPH_ICON, documentTypeIcon } from "./graph-icons";

describe("graph document type icons", () => {
  it("covers every canonical StarIntel document type", () => {
    expect(Object.keys(DTYPE_ICON_KEYS).sort()).toEqual([...dtypes].sort());

    for (const dtype of dtypes) {
      expect(documentTypeIcon(dtype)).toMatch(/^data:image\/svg\+xml,/);
    }
  });

  it("normalizes legacy dtype separators", () => {
    expect(documentTypeIcon("campaign_finance")).toBe(documentTypeIcon("campaign-finance"));
    expect(documentTypeIcon("research node")).toBe(documentTypeIcon("research-node"));
  });

  it("uses a document icon for unknown types and a distinct unresolved icon", () => {
    expect(documentTypeIcon("custom-record")).toBe(documentTypeIcon("document"));
    expect(UNRESOLVED_GRAPH_ICON).not.toBe(documentTypeIcon("document"));
  });
});
