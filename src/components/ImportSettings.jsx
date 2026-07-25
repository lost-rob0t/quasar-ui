import { useEffect, useMemo, useState } from "react";
import { Database, File, Files, Play, Save, Trash2, UploadCloud } from "lucide-react";
import { normalizeActorManifest } from "../lib/actors";
import { useQuasar } from "../store";

function Report({ report }) {
  if (!report) return null;
  const errorCount = (report.errors?.length || 0) + (report.parseErrors?.length || 0);
  return (
    <section className="panel import-report">
      <h2>Import report</h2>
      <div className="metadata-grid">
        <div className="key-value"><span>Files</span><strong>{report.fileCount}</strong></div>
        <div className="key-value"><span>Candidates</span><strong>{report.candidateCount}</strong></div>
        <div className="key-value"><span>Saved</span><strong>{report.saved?.length || 0}</strong></div>
        <div className="key-value"><span>Skipped</span><strong>{report.skipped?.length || 0}</strong></div>
        <div className="key-value"><span>Errors</span><strong>{errorCount}</strong></div>
      </div>
      {[...(report.parseErrors || []), ...(report.errors || [])].map((error, index) => (
        <div className="validation-error" key={`${error.file || error.id || "error"}:${index}`}>
          <strong>{error.file || error.id || `Record ${Number(error.index || 0) + 1}`}</strong>
          <span>{error.line ? `line ${error.line}: ` : ""}{error.message}</span>
          {error.validation?.map((item, position) => <code key={position}>{item.path} {item.message}</code>)}
        </div>
      ))}
    </section>
  );
}

export function ImportPage() {
  const { importFileSet, setNotice } = useQuasar();
  const [files, setFiles] = useState([]);
  const [replace, setReplace] = useState(false);
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  async function runImport(nextFiles = files) {
    if (!nextFiles.length) return;
    setRunning(true);
    try {
      const next = await importFileSet(nextFiles, { replace });
      setReport(next);
      setNotice({ kind: next.errors?.length || next.parseErrors?.length ? "warning" : "success", message: `Imported ${next.saved?.length || 0} document(s)` });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    } finally {
      setRunning(false);
    }
  }

  const chooseSingle = (event) => {
    const next = Array.from(event.target.files || []).slice(0, 1);
    setFiles(next);
    setReport(null);
  };
  const chooseBulk = (event) => {
    const next = Array.from(event.target.files || []);
    setFiles(next);
    setReport(null);
  };

  return (
    <section>
      <div className="page-heading">
        <div><span className="eyebrow">Ingest</span><h1>Import documents</h1><p>Import one file, a bulk selection, or a manifest plus its referenced files.</p></div>
      </div>

      <div className="import-grid">
        <label className="upload-card">
          <File size={28} />
          <strong>Single file</strong>
          <span>JSON, JSONL, NDJSON, or CSV</span>
          <input type="file" accept=".json,.jsonl,.ndjson,.csv,application/json" onChange={chooseSingle} />
        </label>
        <label className="upload-card">
          <Files size={28} />
          <strong>Bulk or manifest import</strong>
          <span>Select the manifest and all referenced files together</span>
          <input type="file" multiple accept=".json,.jsonl,.ndjson,.csv,application/json" onChange={chooseBulk} />
        </label>
      </div>

      <section className="panel">
        <div className="section-heading"><h2>Import queue</h2><span>{files.length} files</span></div>
        <div className="file-list">
          {files.map((file) => <div key={`${file.name}:${file.size}`}><File size={15} /><span>{file.name}</span><small>{Math.ceil(file.size / 1024)} KB</small></div>)}
          {!files.length && <p className="muted">No files selected.</p>}
        </div>
        <div className="form-actions import-actions">
          <label className="checkbox"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /> Replace matching IDs even when the incoming version is not newer</label>
          <button className="button primary" disabled={!files.length || running} onClick={() => runImport()}><UploadCloud size={16} /> {running ? "Validating and saving…" : "Run import"}</button>
        </div>
      </section>
      <Report report={report} />
    </section>
  );
}

const ACTOR_TEMPLATE = JSON.stringify({
  id: "quasar.actor.example",
  label: "Example actor",
  version: 1,
  accepts: ["*"],
  source: `(context) => ({ documents: [], message: "Selected " + context.selection.length + " document(s)" })`
}, null, 2);

export function SettingsPage() {
  const {
    settings, persistSettings, syncStatus, startSync, stopSync, synchronize,
    databaseInfo, setNotice
  } = useQuasar();
  const [form, setForm] = useState(settings || {});
  const [actorText, setActorText] = useState(ACTOR_TEMPLATE);
  const [info, setInfo] = useState(null);
  const actors = useMemo(() => form.actors || [], [form.actors]);

  useEffect(() => setForm(settings || {}), [settings]);
  useEffect(() => { databaseInfo().then(setInfo).catch(() => {}); }, [databaseInfo]);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  async function save() {
    try {
      await persistSettings(form);
      setNotice({ kind: "success", message: "Settings saved locally" });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  async function sync(direction) {
    try {
      await persistSettings(form);
      await synchronize(direction, form);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  async function beginLiveSync() {
    try {
      await persistSettings(form);
      startSync(form);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function addActor() {
    try {
      const actor = normalizeActorManifest(JSON.parse(actorText));
      const nextActors = [...actors.filter((item) => item.id !== actor.id), actor];
      setForm((current) => ({ ...current, actors: nextActors }));
      setNotice({ kind: "success", message: `Actor staged: ${actor.id}. Save settings to persist it.` });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function removeActor(id) {
    setForm((current) => ({ ...current, actors: (current.actors || []).filter((actor) => actor.id !== id) }));
  }

  return (
    <section>
      <div className="page-heading"><div><span className="eyebrow">Configuration</span><h1>Settings</h1><p>Local database, optional CouchDB replication, and opt-in browser actors.</p></div><button className="button primary" onClick={save}><Save size={16} /> Save settings</button></div>

      <section className="panel">
        <div className="section-heading"><h2>CouchDB synchronization</h2><span className={`sync-badge sync-${syncStatus.state}`}>{syncStatus.state}</span></div>
        <div className="form-grid">
          <label className="field full"><span>CouchDB server URL</span><input value={form.couchUrl || ""} onChange={update("couchUrl")} placeholder="https://couch.example.org" /></label>
          <label className="field"><span>Database</span><input value={form.couchDatabase || "starintel"} onChange={update("couchDatabase")} /></label>
          <label className="field"><span>Username</span><input value={form.couchUsername || ""} onChange={update("couchUsername")} /></label>
          <label className="field"><span>Password</span><input type="password" value={form.couchPassword || ""} onChange={update("couchPassword")} /></label>
        </div>
        <p className="muted sync-message">{syncStatus.message}</p>
        <div className="button-row">
          <button className="button" onClick={() => sync("pull")} disabled={!form.couchUrl}>Pull once</button>
          <button className="button" onClick={() => sync("push")} disabled={!form.couchUrl}>Push once</button>
          <button className="button" onClick={() => sync("both")} disabled={!form.couchUrl}>Sync once</button>
          <button className="button primary" onClick={beginLiveSync} disabled={!form.couchUrl}><Play size={15} /> Start live sync</button>
          <button className="button danger" onClick={stopSync}>Stop</button>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><h2>Browser actors</h2><label className="checkbox"><input type="checkbox" checked={Boolean(form.actorsEnabled)} onChange={update("actorsEnabled")} /> Enable actor execution</label></div>
        <p className="muted">Actors run as Web Workers and return StarIntel document batches. Returned documents pass through canonical validation and transaction-level undo.</p>
        <div className="actor-list">
          {actors.map((actor) => (
            <div key={actor.id} className="actor-row"><div><strong>{actor.label}</strong><code>{actor.id} · v{actor.version}</code></div><button className="icon-button danger" onClick={() => removeActor(actor.id)}><Trash2 size={16} /></button></div>
          ))}
          {!actors.length && <p className="muted">No custom actors configured. The built-in deterministic actor remains available when actors are enabled.</p>}
        </div>
        <label className="field"><span>Custom actor manifest JSON</span><textarea className="code-editor tall" value={actorText} onChange={(event) => setActorText(event.target.value)} /></label>
        <button className="button" onClick={addActor}>Stage actor manifest</button>
      </section>

      <section className="panel">
        <div className="section-heading"><h2>Local databases</h2><Database size={20} /></div>
        {info && <div className="metadata-grid"><div className="key-value"><span>Corpus documents</span><strong>{info.documents.doc_count}</strong></div><div className="key-value"><span>Corpus updates</span><strong>{info.documents.update_seq}</strong></div><div className="key-value"><span>State documents</span><strong>{info.state.doc_count}</strong></div><div className="key-value"><span>Adapter</span><strong>{info.documents.adapter}</strong></div></div>}
      </section>
    </section>
  );
}
