import { describe, expect, it } from "vitest";
import { collectImportDocuments, documentsToJsonl } from "./importer";

function file(name, text) {
  return { name, size: text.length, text: async () => text };
}

const stamp = "2026-07-25T20:00:00.000Z";
const document = {
  _id: "starintel:org:test",
  dataset: "test",
  dtype: "org",
  schema_version: "0.9.0",
  version: 1,
  date_added: stamp,
  date_updated: stamp,
  sources: [],
  evidence: [],
  data: { name: "Test" }
};

describe("browser imports", () => {
  it("parses JSONL", async () => {
    const result = await collectImportDocuments([file("records.jsonl", `${JSON.stringify(document)}\n`)]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]._id).toBe(document._id);
  });

  it("resolves files named by a dataset manifest", async () => {
    const manifest = {
      ...document,
      _id: "starintel:dataset-manifest:test",
      dtype: "dataset-manifest",
      data: { manifest_type: "dataset", name: "test", files: [{ path: "records.jsonl" }] }
    };
    const result = await collectImportDocuments([
      file("manifest.json", JSON.stringify(manifest)),
      file("records.jsonl", `${JSON.stringify(document)}\n`)
    ]);
    expect(result.documents.map((item) => item._id)).toContain(manifest._id);
    expect(result.documents.map((item) => item._id)).toContain(document._id);
    expect(result.errors).toHaveLength(0);
  });

  it("exports canonical JSONL with a terminating newline", () => {
    const output = documentsToJsonl([document]);
    expect(output.endsWith("\n")).toBe(true);
    expect(JSON.parse(output.trim())._id).toBe(document._id);
  });
});
