import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  assertDocument,
  createDocument,
  dtypes,
  documentLabel,
  expansion,
  touchDocument
} from "starintel_doc";
import { operation } from "../lib/operations";
import {
  dataFieldsForDtype,
  dataSchemaForDtype,
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

function DynamicField({ name, fieldSchema, required, value, onChange }) {
  const resolved = effectiveFieldSchema(fieldSchema);
  const enumValues = resolved.enum || fieldSchema.enum;
  const hint = resolved.description || fieldSchema.description || resolved.format || resolved.type || "value";

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
      <label className="field full dtype-data-field">
        <span><code>{name}</code>{required ? " *" : ""}</span>
        <textarea
          className="schema-json-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          placeholder={resolved.type === "array" ? "[]" : "{}"}
        />
        <small>{hint} · JSON</small>
      </label>
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
  const [saving, setSaving] = useState(false);
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
  const commonFields = useMemo(() => new Set(expansion.common_data_fields || []), []);
  const dtypeFields = useMemo(
    () => allFields.filter((name) => !commonFields.has(name)),
    [allFields, commonFields]
  );
  const sharedFields = useMemo(
    () => allFields.filter((name) => commonFields.has(name)),
    [allFields, commonFields]
  );
  const requiredFields = useMemo(() => new Set(currentDataSchema.required || []), [currentDataSchema]);

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
    setDataValues((current) => Object.fromEntries(dataFieldsForDtype(form.dtype).map((name) => [
      name,
      name in source ? formatSchemaValue(source[name], properties[name]) : current[name] || ""
    ])));
  }, [existing, form.dtype]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const updateData = (name, value) => setDataValues((current) => ({ ...current, [name]: value }));

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
    <DynamicField
      key={name}
      name={name}
      fieldSchema={currentDataSchema.properties?.[name] || {}}
      required={requiredFields.has(name)}
      value={dataValues[name] || ""}
      onChange={(value) => updateData(name, value)}
    />
  ));

  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{mode === "edit" ? "Editor" : "Manual document adder"}</span>
          <h1>{mode === "edit" ? `Edit ${documentLabel(existing)}` : "Create StarIntel document"}</h1>
          <p>The form is generated directly from the selected dtype&apos;s canonical JSON Schema properties.</p>
        </div>
        <button className="button" type="button" onClick={() => setRawMode((value) => !value)}>{rawMode ? "Structured form" : "Raw JSON"}</button>
      </div>

      <form className="editor-form" onSubmit={submit}>
        {rawMode ? (
          <label className="field full"><span>Complete document JSON</span><textarea className="code-editor tall" value={form.raw} onChange={update("raw")} /></label>
        ) : (
          <>
            <section className="panel editor-section">
              <h2>Document envelope</h2>
              <div className="form-grid">
                <label className="field"><span>Document ID</span><input value={form.id} onChange={update("id")} placeholder="Generated when blank" disabled={Boolean(existing)} /></label>
                <label className="field"><span>Dataset</span><input required value={form.dataset} onChange={update("dataset")} /></label>
                <label className="field"><span>Dtype</span><select value={form.dtype} onChange={update("dtype")} disabled={Boolean(existing)}>{dtypes.map((name) => <option key={name}>{name}</option>)}</select></label>
                <label className="field"><span>Status</span><input value={form.status} onChange={update("status")} /></label>
                <label className="field full"><span>Title</span><input value={form.title} onChange={update("title")} /></label>
                <label className="field full"><span>Summary</span><textarea value={form.summary} onChange={update("summary")} /></label>
                <label className="field full"><span>Description</span><textarea value={form.description} onChange={update("description")} /></label>
                <label className="field full"><span>Tags</span><input value={form.tags} onChange={update("tags")} placeholder="comma, separated" /></label>
              </div>
            </section>

            <section className="panel editor-section">
              <div className="section-heading-inline">
                <div>
                  <span className="eyebrow">{form.dtype}</span>
                  <h2>Dtype fields</h2>
                </div>
                <span className="result-count">{dtypeFields.length}</span>
              </div>
              <div className="form-grid dtype-field-grid">
                {renderFields(dtypeFields)}
              </div>
              {!dtypeFields.length && <p className="muted">This dtype has no type-specific data fields.</p>}
            </section>

            <details className="panel editor-section" open={!dtypeFields.length}>
              <summary>Shared StarIntel data fields ({sharedFields.length})</summary>
              <div className="form-grid dtype-field-grid details-field-grid">
                {renderFields(sharedFields)}
              </div>
            </details>

            <section className="panel editor-section">
              <h2>Sources and evidence</h2>
              <div className="editor-columns">
                <label className="field"><span>Sources JSON array</span><textarea className="code-editor" value={form.sources} onChange={update("sources")} /></label>
                <label className="field"><span>Evidence JSON array</span><textarea className="code-editor" value={form.evidence} onChange={update("evidence")} /></label>
              </div>
            </section>
          </>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={() => navigate(-1)}>Cancel</button>
          <button className="button primary" disabled={saving}><Save size={16} /> {saving ? "Validating…" : "Save document"}</button>
        </div>
      </form>
    </section>
  );
}
