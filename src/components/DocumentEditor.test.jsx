import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({ useQuasar: vi.fn() }));
vi.mock("../lib/operations", () => ({ operation: {} }));

import { useQuasar } from "../store";
import DocumentEditor, { SchemaField } from "./DocumentEditor";

function renderEditor(url) {
  useQuasar.mockReturnValue({
    documents: [],
    execute: vi.fn(),
    setNotice: vi.fn(),
    workspace: {},
    addDocumentsToActiveGraph: vi.fn()
  });
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/documents/new" element={<DocumentEditor mode="create" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("schema field controls", () => {
  it("renders arrays as repeatable values instead of JSON text", () => {
    const html = renderToStaticMarkup(
      <SchemaField
        name="occupations"
        fieldSchema={{ type: "array", items: { type: "string" } }}
        value='["Reporter","Editor"]'
        onChange={vi.fn()}
      />
    );

    expect(html).toContain("Reporter");
    expect(html).toContain("Editor");
    expect(html).toContain("Add value");
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-labelledby="schema-field-occupations"');
    expect(html).not.toContain("<textarea");
  });

  it("renders fixed objects as schema-typed property fields", () => {
    const html = renderToStaticMarkup(
      <SchemaField
        name="identity"
        fieldSchema={{
          type: "object",
          properties: {
            scheme: { type: "string" },
            canonical: { type: "boolean" }
          },
          required: ["scheme"]
        }}
        value='{"scheme":"registry","canonical":true}'
        onChange={vi.fn()}
      />
    );

    expect(html).toContain("<code>scheme</code> *");
    expect(html).toContain("registry");
    expect(html).toContain("<code>canonical</code>");
    expect(html).not.toContain("<textarea");
  });

  it("renders open objects as key/value rows", () => {
    const html = renderToStaticMarkup(
      <SchemaField
        name="attributes"
        fieldSchema={{ type: "object", additionalProperties: true }}
        value='{"region":"north"}'
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('value="region"');
    expect(html).toContain('value="north"');
    expect(html).toContain("Add property");
    expect(html).not.toContain("<textarea");
  });

  it("shows only common person fields by default", () => {
    const html = renderEditor("/documents/new?dtype=person");

    expect(html).toContain("New Person");
    expect(html).toContain("Fields for Person");
    expect(html).toContain("<code>fname</code>");
    expect(html).toContain("<code>mname</code>");
    expect(html).toContain("<code>lname</code>");
    expect(html).toContain("Add another field");
    expect(html).toContain('role="combobox"');
    expect(html).toContain("Advanced metadata and raw JSON");
    expect(html).not.toContain("<code>nationalities</code>");
    expect(html).not.toContain("schema fields");
  });

  it("switches the field heading and fields for organizations", () => {
    const html = renderEditor("/documents/new?dtype=org");

    expect(html).toContain("New Organization");
    expect(html).toContain("Fields for Organization");
    expect(html).toContain("<code>legal_name</code>");
    expect(html).toContain("<code>org_type</code>");
    expect(html).not.toContain("<code>fname</code>");
  });

  it("keeps metadata and raw JSON behind one advanced level", () => {
    const html = renderEditor("/documents/new?dtype=person&advanced=1");

    expect(html).toContain("Fields for Person");
    expect(html).toContain(">Advanced</h2>");
    expect(html).not.toContain("<code>nationalities</code>");
    expect(html).toContain("Document metadata");
    expect(html).toContain("Sources and evidence");
    expect(html).toContain("Edit raw JSON");
  });
});
