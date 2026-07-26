import { describe, expect, it } from "vitest";
import { dataFieldsForDtype, dataSchemaForDtype } from "./schema-form";

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
});
