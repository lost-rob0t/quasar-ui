import { schema } from "starintel_doc";

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
