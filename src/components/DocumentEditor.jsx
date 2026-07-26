import { useEffect, useMemo, useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  assertDocument,
  createDocument,
  dtypes,
  documentLabel,
  schema,
  touchDocument
} from "starintel_doc";
import { operation } from "../lib/operations";
import {
  dataFieldsForDtype,
  dataSchemaForDtype,
  dtypeLabel,
  essentialDataFieldsForDtype,
  effectiveFieldSchema,
  formatSchemaValue,
  parseSchemaField
} from "../lib/schema-form";
import { useQuasar } from "../store";

function parseJson(text, label, fallback) {
  if (!String(text || "").trim()) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function structuredValue(value, type) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value || (type === "array" ? "[]" : "{}"));
    if (type === "array" && Array.isArray(parsed)) return parsed;
    if (type === "object" && parsed && !Array.isArray(parsed) && typeof parsed === "object") return parsed;
  } catch {
    // Invalid legacy JSON is replaced by the first structured edit.
  }
  return type === "array" ? [] : {};
}

function emptySchemaValue(fieldSchema = {}) {
  const resolved = effectiveFieldSchema(fieldSchema);
  if (resolved.type === "array") return [];
  if (resolved.type === "object" || !resolved.type) return {};
  if (resolved.type === "boolean") return false;
  return "";
}

function ScalarValueInput({ fieldSchema, value, onChange }) {
  const resolved = effectiveFieldSchema(fieldSchema);
  const enumValues = resolved.enum || fieldSchema.enum;
  if (enumValues) {
    return (
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select…</option>
        {enumValues.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
      </select>
    );
  }
  if (resolved.type === "boolean") {
    return (
      <select value={String(value ?? false)} onChange={(event) => onChange(event.target.value === "true")}>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }
  return (
    <input
      type={resolved.type === "number" || resolved.type === "integer" ? "number" : "text"}
      step={resolved.type === "integer" ? "1" : resolved.type === "number" ? "any" : undefined}
      value={value ?? ""}
      onChange={(event) => {
        if (resolved.type === "integer") onChange(event.target.value === "" ? "" : Number.parseInt(event.target.value, 10));
        else if (resolved.type === "number") onChange(event.target.value === "" ? "" : Number(event.target.value));
        else onChange(event.target.value);
      }}
    />
  );
}

function StructuredValueEditor({ fieldSchema, value, onChange }) {
  const resolved = effectiveFieldSchema(fieldSchema);
  if (resolved.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const itemSchema = resolved.items || {};
    const itemType = effectiveFieldSchema(itemSchema).type;
    return (
      <div className="structured-list">
        {items.map((item, index) => (
          <div className={itemType === "object" || itemType === "array" || !itemType ? "structured-item nested" : "structured-item"} key={index}>
            {(itemType === "object" || itemType === "array" || !itemType) ? (
              <StructuredValueEditor
                fieldSchema={itemSchema}
                value={item}
                onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))}
              />
            ) : (
              <ScalarValueInput
                fieldSchema={itemSchema}
                value={item}
                onChange={(next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current))}
              />
            )}
            <button className="icon-button danger structured-remove" type="button" aria-label={`Remove item ${index + 1}`} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
          </div>
        ))}
        {!items.length && <small className="structured-empty">No values added.</small>}
        <button className="button small structured-add" type="button" onClick={() => onChange([...items, emptySchemaValue(itemSchema)])}><Plus size={14} /> Add value</button>
      </div>
    );
  }

  const objectValue = value && !Array.isArray(value) && typeof value === "object" ? value : {};
  const properties = resolved.properties || {};
  const propertyNames = Object.keys(properties);
  if (propertyNames.length) {
    const required = new Set(resolved.required || []);
    return (
      <div className="structured-object-fields">
        {propertyNames.map((name) => {
          const childSchema = properties[name] || {};
          const childType = effectiveFieldSchema(childSchema).type;
          return (
            <label className="structured-property" key={name}>
              <span><code>{name}</code>{required.has(name) ? " *" : ""}</span>
              {(childType === "array" || childType === "object" || !childType) ? (
                <StructuredValueEditor
                  fieldSchema={childSchema}
                  value={objectValue[name] ?? emptySchemaValue(childSchema)}
                  onChange={(next) => onChange({ ...objectValue, [name]: next })}
                />
              ) : (
                <ScalarValueInput
                  fieldSchema={childSchema}
                  value={objectValue[name] ?? ""}
                  onChange={(next) => onChange({ ...objectValue, [name]: next })}
                />
              )}
            </label>
          );
        })}
      </div>
    );
  }

  const entries = Object.entries(objectValue);
  const valueSchema = typeof resolved.additionalProperties === "object" ? resolved.additionalProperties : {};
  return (
    <div className="structured-list">
      {entries.map(([key, entryValue], index) => (
        <div className="structured-item key-value" key={`${key}:${index}`}>
          <input
            aria-label={`Key ${index + 1}`}
            value={key}
            placeholder="Key"
            onChange={(event) => {
              const next = { ...objectValue };
              delete next[key];
              next[event.target.value] = entryValue;
              onChange(next);
            }}
          />
          <ScalarValueInput
            fieldSchema={valueSchema}
            value={typeof entryValue === "object" ? JSON.stringify(entryValue) : entryValue}
            onChange={(nextValue) => onChange({ ...objectValue, [key]: nextValue })}
          />
          <button className="icon-button danger structured-remove" type="button" aria-label={`Remove ${key || "property"}`} onClick={() => {
            const next = { ...objectValue };
            delete next[key];
            onChange(next);
          }}><X size={14} /></button>
        </div>
      ))}
      {!entries.length && <small className="structured-empty">No properties added.</small>}
      <button className="button small structured-add" type="button" onClick={() => {
        let index = entries.length + 1;
        let key = `property_${index}`;
        while (key in objectValue) key = `property_${++index}`;
        onChange({ ...objectValue, [key]: emptySchemaValue(valueSchema) });
      }}><Plus size={14} /> Add property</button>
    </div>
  );
}

export function SchemaField({ name, fieldSchema, required, value, onChange }) {
  const resolved = effectiveFieldSchema(fieldSchema);
  const enumValues = resolved.enum || fieldSchema.enum;
  const hint = resolved.description || fieldSchema.description || resolved.format || resolved.type || "value";
  const labelId = `schema-field-${String(name).replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  if (enumValues) {
    return (
      <label className="field">
        <span><code>{name}</code>{required ? " *" : ""}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
          <option value="">Select…</option>
          {enumValues.map((item) => <option key={String(item)} value={String(item)}>{String(item)}</option>)}
        </select>
        <small>{hint}</small>
      </label>
    );
  }

  if (resolved.type === "boolean") {
    return (
      <label className="field">
        <span><code>{name}</code>{required ? " *" : ""}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
          <option value="">Unset</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
        <small>{hint}</small>
      </label>
    );
  }

  if (resolved.type === "object" || resolved.type === "array" || !resolved.type) {
    return (
      <div className="field full dtype-data-field" role="group" aria-labelledby={labelId}>
        <span id={labelId}><code>{name}</code>{required ? " *" : ""}</span>
        <StructuredValueEditor
          fieldSchema={fieldSchema}
          value={structuredValue(value, resolved.type === "array" ? "array" : "object")}
          onChange={(next) => onChange(JSON.stringify(next))}
        />
        <small>{hint}</small>
      </div>
    );
  }

  return (
    <label className="field">
      <span><code>{name}</code>{required ? " *" : ""}</span>
      <input
        type={resolved.type === "number" || resolved.type === "integer" ? "number" : "text"}
        step={resolved.type === "integer" ? "1" : resolved.type === "number" ? "any" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={resolved.format === "date-time" ? "2026-07-25T21:00:00.000Z" : undefined}
      />
      <small>{hint}</small>
    </label>
  );
}

export default function DocumentEditor({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { documents, execute, setNotice, workspace, addDocumentsToActiveGraph } = useQuasar();
  const existing = mode === "edit" ? documents.find((document) => document._id === id) : null;
  const initialDtype = params.get("dtype") || "entity";
  const [rawMode, setRawMode] = useState(false);
  const [advanced, setAdvanced] = useState(params.get("advanced") === "1");
  const [saving, setSaving] = useState(false);
  const [addedFields, setAddedFields] = useState([]);
  const [fieldPickerQuery, setFieldPickerQuery] = useState("");
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [dataValues, setDataValues] = useState({});
  const [form, setForm] = useState({
    id: "",
    dataset: params.get("dataset") || "default",
    dtype: initialDtype,
    title: "",
    summary: "",
    description: "",
    status: "",
    tags: "",
    sources: "[]",
    evidence: "[]",
    raw: "{}"
  });

  const currentDataSchema = useMemo(() => dataSchemaForDtype(form.dtype), [form.dtype]);
  const allFields = useMemo(() => dataFieldsForDtype(form.dtype), [form.dtype]);
  const essentialFields = useMemo(() => essentialDataFieldsForDtype(form.dtype), [form.dtype]);
  const essentialFieldSet = useMemo(() => new Set(essentialFields), [essentialFields]);
  const visibleAddedFields = useMemo(
    () => addedFields.filter((name) => allFields.includes(name) && !essentialFieldSet.has(name)),
    [addedFields, allFields, essentialFieldSet]
  );
  const visibleAddedFieldSet = useMemo(() => new Set(visibleAddedFields), [visibleAddedFields]);
  const availableFields = useMemo(
    () => allFields.filter((name) => !essentialFieldSet.has(name) && !visibleAddedFieldSet.has(name)),
    [allFields, essentialFieldSet, visibleAddedFieldSet]
  );
  const matchingAvailableFields = useMemo(() => {
    const query = fieldPickerQuery.trim().toLowerCase();
    return availableFields.filter((name) => {
      if (!query) return true;
      const fieldSchema = currentDataSchema.properties?.[name] || {};
      return `${name} ${fieldSchema.title || ""} ${fieldSchema.description || ""}`
        .toLowerCase()
        .includes(query);
    }).slice(0, 12);
  }, [availableFields, currentDataSchema, fieldPickerQuery]);
  const renderedFields = useMemo(
    () => [...essentialFields, ...visibleAddedFields],
    [essentialFields, visibleAddedFields]
  );
  const requiredFields = useMemo(() => new Set(currentDataSchema.required || []), [currentDataSchema]);
  const objectType = dtypeLabel(form.dtype);

  useEffect(() => {
    if (!existing) return;
    setForm({
      id: existing._id,
      dataset: existing.dataset,
      dtype: existing.dtype,
      title: existing.title || "",
      summary: existing.summary || "",
      description: existing.description || "",
      status: existing.status || "",
      tags: (existing.tags || []).join(", "),
      sources: JSON.stringify(existing.sources || [], null, 2),
      evidence: JSON.stringify(existing.evidence || [], null, 2),
      raw: JSON.stringify(existing, null, 2)
    });
  }, [existing]);

  useEffect(() => {
    const source = existing?.dtype === form.dtype ? existing.data || {} : {};
    const properties = dataSchemaForDtype(form.dtype).properties || {};
    const schemaFields = dataFieldsForDtype(form.dtype);
    const commonFields = new Set(essentialDataFieldsForDtype(form.dtype));
    setDataValues((current) => Object.fromEntries(dataFieldsForDtype(form.dtype).map((name) => [
      name,
      name in source ? formatSchemaValue(source[name], properties[name]) : current[name] || ""
    ])));
    setAddedFields(Object.keys(source).filter((name) => schemaFields.includes(name) && !commonFields.has(name)));
    setFieldPickerQuery("");
    setFieldPickerOpen(false);
  }, [existing, form.dtype]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const updateData = (name, value) => setDataValues((current) => ({ ...current, [name]: value }));

  function addField(name) {
    if (!availableFields.includes(name)) return;
    setAddedFields((current) => [...current, name]);
    setFieldPickerQuery("");
    setFieldPickerOpen(false);
  }

  function buildTypedData() {
    const properties = currentDataSchema.properties || {};
    const data = {};
    for (const name of allFields) {
      const parsed = parseSchemaField(name, dataValues[name], properties[name] || {}, parseJson);
      if (parsed !== undefined) data[name] = parsed;
    }
    return data;
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      let document;
      if (rawMode) {
        document = assertDocument(parseJson(form.raw, "Document JSON", {}));
      } else {
        const changes = {
          _id: form.id || undefined,
          dataset: form.dataset,
          dtype: form.dtype,
          title: form.title,
          summary: form.summary,
          description: form.description,
          status: form.status,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          sources: parseJson(form.sources, "Sources", []),
          evidence: parseJson(form.evidence, "Evidence", []),
          data: buildTypedData()
        };
        document = existing ? touchDocument(existing, changes) : createDocument(form.dtype, changes);
        document = assertDocument(document);
      }
      await execute(operation.save(document), `${existing ? "Update" : "Create"} ${document._id}`);
      if (!existing && params.get("returnTo") === "graph") {
        const hasPosition = params.has("x") && params.has("y");
        const position = hasPosition
          ? { x: Number(params.get("x")), y: Number(params.get("y")) }
          : null;
        const changes = { selectedIds: [document._id] };
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
          changes.positions = { ...(workspace?.positions || {}), [document._id]: position };
        }
        addDocumentsToActiveGraph([document._id], changes);
        navigate(`/graph?node=${encodeURIComponent(document._id)}`, {
          state: { revealUnreviewed: true, createdIds: [document._id] }
        });
        return;
      }
      navigate(`/documents/${encodeURIComponent(document._id)}`);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  if (mode === "edit" && !existing) {
    return <section className="empty-state"><h1>Document not found</h1><code>{id}</code></section>;
  }

  const renderFields = (names) => names.map((name) => (
    <SchemaField
      key={name}
      name={name}
      fieldSchema={currentDataSchema.properties?.[name] || {}}
      required={requiredFields.has(name)}
      value={dataValues[name] || ""}
      onChange={(value) => updateData(name, value)}
    />
  ));

  return (
    <section className="simple-document-editor">
      <div className="page-heading simple-editor-heading">
        <div>
          <span className="eyebrow">{mode === "edit" ? "Edit" : "Create"}</span>
          <h1>{mode === "edit" ? `Edit ${documentLabel(existing)}` : `New ${objectType}`}</h1>
          <p>Only the fields used most often are shown.</p>
        </div>
        {advanced && (
          <button className="button small" type="button" onClick={() => setRawMode((value) => !value)}>
            {rawMode ? "Back to fields" : "Edit raw JSON"}
          </button>
        )}
      </div>

      <form className="editor-form simple-editor-form" onSubmit={submit}>
        {rawMode ? (
          <label className="field full"><span>Complete document JSON</span><textarea className="code-editor tall" value={form.raw} onChange={update("raw")} /></label>
        ) : (
          <>
            <section className="simple-editor-section">
              <div className="form-grid editor-basics-grid">
                {!existing && (
                  <label className="field">
                    <span>Object type</span>
                    <select value={form.dtype} onChange={update("dtype")}>
                      {dtypes.map((name) => <option key={name} value={name}>{dtypeLabel(name)}</option>)}
                    </select>
                  </label>
                )}
                <label className="field"><span>Dataset</span><input required value={form.dataset} onChange={update("dataset")} /></label>
              </div>
            </section>

            <section className="simple-editor-section object-fields-section">
              <div className="simple-editor-section-heading">
                <h2>Fields for {objectType}</h2>
                <span className={`dtype dtype-${form.dtype}`}>{form.dtype}</span>
              </div>
              <div className="form-grid dtype-field-grid">{renderFields(renderedFields)}</div>
              {!essentialFields.length && <p className="muted">No common fields are defined for this object type.</p>}
              {availableFields.length > 0 && (
                <div
                  className="field-picker"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setFieldPickerOpen(false);
                  }}
                >
                  <label className="field">
                    <span>Add another field</span>
                    <input
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="schema-field-options"
                      aria-expanded={fieldPickerOpen}
                      value={fieldPickerQuery}
                      placeholder={`Search ${availableFields.length} ${objectType.toLowerCase()} fields`}
                      onFocus={() => setFieldPickerOpen(true)}
                      onChange={(event) => {
                        setFieldPickerQuery(event.target.value);
                        setFieldPickerOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && matchingAvailableFields[0]) {
                          event.preventDefault();
                          addField(matchingAvailableFields[0]);
                        }
                        if (event.key === "Escape") setFieldPickerOpen(false);
                      }}
                    />
                  </label>
                  {fieldPickerOpen && (
                    <div className="field-picker-options" id="schema-field-options" role="listbox">
                      {matchingAvailableFields.map((name) => {
                        const fieldSchema = currentDataSchema.properties?.[name] || {};
                        const resolved = effectiveFieldSchema(fieldSchema);
                        return (
                          <button key={name} type="button" role="option" aria-selected="false" onClick={() => addField(name)}>
                            <code>{name}</code>
                            <small>{fieldSchema.description || resolved.type || "field"}</small>
                          </button>
                        );
                      })}
                      {!matchingAvailableFields.length && <span className="field-picker-empty">No matching fields</span>}
                    </div>
                  )}
                </div>
              )}
            </section>

            <button
              className="button small advanced-editor-toggle"
              type="button"
              aria-expanded={advanced}
              onClick={() => {
                setAdvanced((value) => !value);
                setRawMode(false);
              }}
            >
              {advanced ? "Hide advanced" : "Advanced metadata and raw JSON…"}
            </button>

            {advanced && (
              <section className="simple-editor-section advanced-editor-section">
                <div className="simple-editor-section-heading">
                  <h2>Advanced</h2>
                </div>
                <h3>Document metadata</h3>
                <div className="form-grid details-field-grid">
                  <label className="field full"><span>Title</span><input value={form.title} onChange={update("title")} /></label>
                  <label className="field"><span>Document ID</span><input value={form.id} onChange={update("id")} placeholder="Generated when blank" disabled={Boolean(existing)} /></label>
                  <label className="field"><span>Status</span><input value={form.status} onChange={update("status")} /></label>
                  <label className="field full"><span>Summary</span><textarea value={form.summary} onChange={update("summary")} /></label>
                  <label className="field full"><span>Description</span><textarea value={form.description} onChange={update("description")} /></label>
                  <label className="field full"><span>Tags</span><input value={form.tags} onChange={update("tags")} placeholder="comma, separated" /></label>
                </div>

                <h3>Sources and evidence</h3>
                <div className="form-grid dtype-field-grid details-field-grid">
                  <SchemaField name="sources" fieldSchema={schema.properties?.sources || { type: "array" }} value={form.sources} onChange={(value) => setForm((current) => ({ ...current, sources: value }))} />
                  <SchemaField name="evidence" fieldSchema={schema.properties?.evidence || { type: "array" }} value={form.evidence} onChange={(value) => setForm((current) => ({ ...current, evidence: value }))} />
                </div>
              </section>
            )}
          </>
        )}
        <div className="form-actions editor-save-bar">
          <button type="button" className="button" onClick={() => navigate(-1)}>Cancel</button>
          <button className="button primary" disabled={saving}><Save size={16} /> {saving ? "Validating…" : "Save document"}</button>
        </div>
      </form>
    </section>
  );
}
