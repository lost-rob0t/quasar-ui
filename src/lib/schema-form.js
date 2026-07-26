import { schema } from "starintel_doc";

const ESSENTIAL_FIELD_PREFERENCES = {
  person: ["fname", "mname", "lname", "full_name", "dob", "birthplace"],
  org: ["name", "legal_name", "org_type", "industry", "headquarters", "website"],
  event: ["name", "event_type", "start_date", "end_date", "location", "website"],
  location: ["name", "location_type", "address", "city", "country", "coordinates"],
  entity: ["name", "entity_type", "aliases", "website"],
  document: ["name", "document_type", "published_at", "author", "url"],
  source: ["name", "source_type", "publisher", "url"],
  concept: ["name", "concept_type", "definition", "aliases"]
};

export function humanizeSchemaField(name) {
  return String(name)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function dataSchemaForDtype(dtype) {
  const variant = (schema.allOf || [])
    .find((candidate) => candidate.if?.properties?.dtype?.const === dtype);
  return variant?.then?.properties?.data || { properties: {}, required: [] };
}

export function dataFieldsForDtype(dtype) {
  return Object.keys(dataSchemaForDtype(dtype).properties || {});
}

export function essentialDataFieldsForDtype(dtype, limit = 6) {
  const dataSchema = dataSchemaForDtype(dtype);
  const properties = dataSchema.properties || {};
  const fields = Object.keys(properties);
  const preferred = ESSENTIAL_FIELD_PREFERENCES[dtype] || [];
  const scalarFields = fields.filter((name) => {
    const resolved = effectiveFieldSchema(properties[name]);
    return resolved.type && resolved.type !== "array" && resolved.type !== "object";
  });
  return [...new Set([
    ...preferred.filter((name) => name in properties),
    ...scalarFields
  ])].slice(0, limit);
}

export function effectiveFieldSchema(fieldSchema = {}) {
  if (!Array.isArray(fieldSchema.anyOf)) return fieldSchema;
  return fieldSchema.anyOf
    .find((candidate) => candidate.type && candidate.type !== "null") || fieldSchema;
}

export function formatSchemaValue(value, fieldSchema) {
  if (value == null) return "";
  const resolved = effectiveFieldSchema(fieldSchema);
  if (resolved.type === "object" || resolved.type === "array" || typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function parseSchemaField(name, value, fieldSchema, parseJson) {
  if (value === "" || value == null) return undefined;
  const resolved = effectiveFieldSchema(fieldSchema);
  if (resolved.type === "boolean") return value === true || value === "true";
  if (resolved.type === "integer") {
    const number = Number(value);
    if (!Number.isInteger(number)) throw new Error(`${humanizeSchemaField(name)} must be an integer`);
    return number;
  }
  if (resolved.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${humanizeSchemaField(name)} must be a number`);
    return number;
  }
  if (resolved.type === "object" || resolved.type === "array" || !resolved.type) {
    return parseJson(value, humanizeSchemaField(name), resolved.type === "array" ? [] : {});
  }
  return value;
}
