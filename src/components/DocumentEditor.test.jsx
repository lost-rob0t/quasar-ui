import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({ useQuasar: vi.fn() }));
vi.mock("../lib/operations", () => ({ operation: {} }));

import { SchemaField } from "./DocumentEditor";

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
});
