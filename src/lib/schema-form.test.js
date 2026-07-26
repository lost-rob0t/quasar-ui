import { describe, expect, it } from "vitest";
import {
  dataFieldsForDtype,
  dataSchemaForDtype,
  essentialDataFieldsForDtype
} from "./schema-form";

describe("schema-driven document fields", () => {
  it("uses the person data properties from the canonical schema", () => {
    const fields = dataFieldsForDtype("person");

    expect(fields).toEqual(expect.arrayContaining([
      "fname",
      "mname",
      "lname",
      "full_name",
      "dob",
      "nationalities",
      "occupations"
    ]));
    expect(dataSchemaForDtype("person").additionalProperties).toBe(false);
  });

  it("switches to organization fields without leaking person fields", () => {
    const fields = dataFieldsForDtype("org");

    expect(fields).toEqual(expect.arrayContaining([
      "name",
      "legal_name",
      "org_type",
      "industry",
      "headquarters",
      "registration_number",
      "website"
    ]));
    expect(fields).not.toContain("fname");
    expect(fields).not.toContain("mname");
    expect(fields).not.toContain("lname");
  });

  it("keeps quick-edit fields short, useful, and schema-backed", () => {
    expect(essentialDataFieldsForDtype("person")).toEqual([
      "fname",
      "mname",
      "lname",
      "full_name",
      "dob",
      "birthplace"
    ]);
    expect(essentialDataFieldsForDtype("org")).toEqual([
      "name",
      "legal_name",
      "org_type",
      "industry",
      "headquarters",
      "website"
    ]);
    for (const dtype of ["person", "org", "event", "location"]) {
      const schemaFields = new Set(dataFieldsForDtype(dtype));
      const essentialFields = essentialDataFieldsForDtype(dtype);
      expect(essentialFields.length).toBeLessThanOrEqual(6);
      expect(essentialFields.every((field) => schemaFields.has(field))).toBe(true);
    }
  });
});
