import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Edit3, ExternalLink, Network, Plus, Save, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { assertDocument, createDocument, dtypes, documentLabel, touchDocument } from "starintel_doc";
import { documentsToJsonl, downloadText } from "../lib/importer";
import { operation } from "../lib/operations";
import { useQuasar } from "../store";

function includesDocument(document, query) {
  if (!query) return true;
  const text = `${document._id} ${document.dataset} ${document.dtype} ${document.title || ""} ${document.summary || ""} ${JSON.stringify(document.data)} ${JSON.stringify(document.sources || [])}`.toLowerCase();
  return text.includes(query.toLowerCase());
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function DocumentsPage() {
  const { documents } = useQuasar();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const dtype = params.get("dtype") || "";
  const dataset = params.get("dataset") || "";
  const datasets = useMemo(() => [...new Set(documents.map((document) => document.dataset))].sort(), [documents]);
  const visible = useMemo(() => documents.filter((document) =>
    (!dtype || document.dtype === dtype)
    && (!dataset || document.dataset === dataset)
    && includesDocument(document, query)
  ), [documents, dtype, dataset, query]);

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Corpus</span>
          <h1>Documents</h1>
          <p>Search and inspect the local StarIntel v0.9 corpus.</p>
        </div>
        <div className="button-row">
          <button className="button" onClick={() => downloadText("starintel-documents.jsonl", documentsToJsonl(visible))}><Download size={16} /> Export visible</button>
          <Link className="button primary" to="/documents/new"><Plus size={16} /> Add document</Link>
        </div>
      </div>

      <div className="filter-bar">
        <input value={query} onChange={(event) => set("q", event.target.value)} placeholder="Search all document fields" />
        <select value={dtype} onChange={(event) => set("dtype", event.target.value)}>
          <option value="">All dtypes</option>
          {dtypes.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={dataset} onChange={(event) => set("dataset", event.target.value)}>
          <option value="">All datasets</option>
          {datasets.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <span className="result-count">{visible.length} / {documents.length}</span>
      </div>

      <div className="table-panel">
        <table>
          <thead><tr><th>Document</th><th>Type</th><th>Dataset</th><th>Updated</th><th>Evidence</th></tr></thead>
          <tbody>
            {visible.map((document) => (
              <tr key={document._id}>
                <td>
                  <Link className="document-link" to={`/documents/${encodeURIComponent(document._id)}`}>{documentLabel(document)}</Link>
                  <code>{document._id}</code>
                  {document.summary && <small>{document.summary}</small>}
                </td>
                <td><span className={`dtype dtype-${document.dtype}`}>{document.dtype}</span></td>
                <td>{document.dataset}</td>
                <td>{new Date(document.date_updated).toLocaleString()}</td>
                <td>{document.evidence?.length || 0} evidence · {document.sources?.length || 0} sources</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <div className="empty-state compact">No matching documents.</div>}
      </div>
    </section>
  );
}

function KeyValue({ label, children }) {
  return <div className="key-value"><span>{label}</span><strong>{children || "—"}</strong></div>;
}

export function DocumentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, execute, setNotice } = useQuasar();
  const document = documents.find((item) => item._id === id);
  const website = safeExternalUrl(document?.data?.website);

  if (!document) return <section className="empty-state"><h1>Document not found</h1><code>{id}</code><Link className="button" to="/documents">Back to documents</Link></section>;

  async function remove() {
    if (!window.confirm(`Delete ${document._id}?`)) return;
    try {
      await execute(operation.remove(document._id), `Delete ${document._id}`);
      navigate("/documents");
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  return (
    <article>
      <div className="page-heading document-heading">
        <div>
          <Link className="back-link" to="/documents"><ArrowLeft size={15} /> Documents</Link>
          <span className="eyebrow">{document.dtype} · {document.dataset}</span>
          <h1>{documentLabel(document)}</h1>
          <code>{document._id}</code>
          {document.summary && <p>{document.summary}</p>}
        </div>
        <div className="button-row">
          <Link className="button" to={`/graph?node=${encodeURIComponent(document._id)}`}><Network size={16} /> Graph</Link>
          {website && <a className="button" href={website} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open website</a>}
          <Link className="button primary" to={`/documents/${encodeURIComponent(document._id)}/edit`}><Edit3 size={16} /> Edit</Link>
          <button className="button danger" onClick={remove}><Trash2 size={16} /> Delete</button>
        </div>
      </div>

      <div className="metadata-grid">
        <KeyValue label="Schema">{document.schema_version}</KeyValue>
        <KeyValue label="Version">{document.version}</KeyValue>
        <KeyValue label="Status">{document.status}</KeyValue>
        <KeyValue label="Language">{document.language}</KeyValue>
        <KeyValue label="Added">{new Date(document.date_added).toLocaleString()}</KeyValue>
        <KeyValue label="Updated">{new Date(document.date_updated).toLocaleString()}</KeyValue>
      </div>

      {document.description && <section className="panel"><h2>Description</h2><p className="prose">{document.description}</p></section>}

      <section className="panel">
        <h2>Typed data</h2>
        <pre>{JSON.stringify(document.data, null, 2)}</pre>
      </section>

      <div className="two-column">
        <section className="panel">
          <h2>Sources <span>{document.sources?.length || 0}</span></h2>
          {(document.sources || []).map((source, index) => (
            <div className="record-list-item" key={source.source_id || source.url || index}>
              <strong>{source.title || source.name || source.url || `Source ${index + 1}`}</strong>
              <small>{source.publisher || source.organization || source.kind}</small>
              {(source.url || source.uri) && <a href={source.url || source.uri} target="_blank" rel="noreferrer">Open source</a>}
            </div>
          ))}
          {!document.sources?.length && <p className="muted">No sources.</p>}
        </section>
        <section className="panel">
          <h2>Evidence <span>{document.evidence?.length || 0}</span></h2>
          {(document.evidence || []).map((evidence, index) => (
            <div className="record-list-item" key={evidence.evidence_id || index}>
              <strong>{evidence.claim || evidence.observation || evidence.kind || `Evidence ${index + 1}`}</strong>
              <small>{evidence.role || evidence.status}</small>
              {evidence.excerpt && <p>{evidence.excerpt}</p>}
            </div>
          ))}
          {!document.evidence?.length && <p className="muted">No evidence records.</p>}
        </section>
      </div>

      <details className="panel raw-document">
        <summary>Complete canonical JSON</summary>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </details>
    </article>
  );
}

function parseJson(text, label, fallback) {
  if (!text.trim()) return fallback;
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${label}: ${error.message}`); }
}

export function DocumentEditor({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { documents, execute, setNotice } = useQuasar();
  const existing = mode === "edit" ? documents.find((document) => document._id === id) : null;
  const initialDtype = params.get("dtype") || "entity";
  const [rawMode, setRawMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    dataset: params.get("dataset") || "default",
    dtype: initialDtype,
    title: "",
    summary: "",
    description: "",
    status: "",
    tags: "",
    data: "{}",
    sources: "[]",
    evidence: "[]",
    raw: "{}"
  });

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
      data: JSON.stringify(existing.data || {}, null, 2),
      sources: JSON.stringify(existing.sources || [], null, 2),
      evidence: JSON.stringify(existing.evidence || [], null, 2),
      raw: JSON.stringify(existing, null, 2)
    });
  }, [existing]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

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
          data: parseJson(form.data, "Typed data", {})
        };
        document = existing ? touchDocument(existing, changes) : createDocument(form.dtype, changes);
        document = assertDocument(document);
      }
      await execute(operation.save(document), `${existing ? "Update" : "Create"} ${document._id}`);
      navigate(`/documents/${encodeURIComponent(document._id)}`);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  if (mode === "edit" && !existing) return <section className="empty-state"><h1>Document not found</h1><code>{id}</code></section>;

  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{mode === "edit" ? "Editor" : "Manual document adder"}</span>
          <h1>{mode === "edit" ? `Edit ${documentLabel(existing)}` : "Create StarIntel document"}</h1>
          <p>Every save is validated against the canonical v0.9 schema before entering PouchDB.</p>
        </div>
        <button className="button" type="button" onClick={() => setRawMode((value) => !value)}>{rawMode ? "Structured form" : "Raw JSON"}</button>
      </div>

      <form className="editor-form" onSubmit={submit}>
        {rawMode ? (
          <label className="field full"><span>Complete document JSON</span><textarea className="code-editor tall" value={form.raw} onChange={update("raw")} /></label>
        ) : (
          <>
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
            <div className="editor-columns">
              <label className="field"><span>Typed data JSON</span><textarea className="code-editor" value={form.data} onChange={update("data")} /></label>
              <label className="field"><span>Sources JSON array</span><textarea className="code-editor" value={form.sources} onChange={update("sources")} /></label>
              <label className="field"><span>Evidence JSON array</span><textarea className="code-editor" value={form.evidence} onChange={update("evidence")} /></label>
            </div>
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
