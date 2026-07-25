import { useState } from "react";
import {
  Activity,
  Database,
  FilePlus2,
  FolderInput,
  Network,
  Redo2,
  Search,
  Settings,
  TableProperties,
  Undo2
} from "lucide-react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useQuasar } from "./store";
import GraphPage from "./components/GraphPage";
import { DocumentEditor, DocumentPage, DocumentsPage } from "./components/Documents";
import { ImportPage, SettingsPage } from "./components/ImportSettings";
import StatsPage from "./components/StatsPage";

const navigation = [
  ["/graph", "Graph", Network],
  ["/documents", "Documents", TableProperties],
  ["/documents/new", "Add document", FilePlus2],
  ["/import", "Import", FolderInput],
  ["/stats", "Statistics", Activity],
  ["/settings", "Settings", Settings]
];

function SyncBadge() {
  const { syncStatus } = useQuasar();
  return <span className={`sync-badge sync-${syncStatus.state}`} title={syncStatus.message}>{syncStatus.state}</span>;
}

function WorkbenchShell({ children }) {
  const navigate = useNavigate();
  const { loading, notice, setNotice, canUndo, canRedo, undo, redo, documents } = useQuasar();
  const [query, setQuery] = useState("");

  function submitSearch(event) {
    event.preventDefault();
    navigate(`/documents?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">Q</div>
          <div>
            <strong>Quasar</strong>
            <span>StarIntel workspace</span>
          </div>
        </div>
        <nav>
          {navigation.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div><Database size={15} /> {documents.length} documents</div>
          <div><SyncBadge /></div>
          <small>Offline-first · v0.9.0</small>
        </div>
      </aside>

      <section className="workbench">
        <header className="topbar">
          <form className="global-search" onSubmit={submitSearch}>
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search IDs, titles, data, sources…" />
          </form>
          <div className="top-actions">
            <button className="icon-button" disabled={!canUndo} onClick={() => undo().catch((error) => setNotice({ kind: "error", message: error.message }))} title="Undo">
              <Undo2 size={18} />
            </button>
            <button className="icon-button" disabled={!canRedo} onClick={() => redo().catch((error) => setNotice({ kind: "error", message: error.message }))} title="Redo">
              <Redo2 size={18} />
            </button>
          </div>
        </header>

        {notice && (
          <div className={`notice notice-${notice.kind || "info"}`}>
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)}>×</button>
          </div>
        )}

        <main className="content">
          {loading ? <div className="loading-panel">Opening local workspace…</div> : children}
        </main>
      </section>
    </div>
  );
}

function NotFound() {
  return (
    <section className="empty-state">
      <h1>Route not found</h1>
      <NavLink className="button primary" to="/graph">Open graph</NavLink>
    </section>
  );
}

export default function App() {
  return (
    <WorkbenchShell>
      <Routes>
        <Route path="/" element={<Navigate to="/graph" replace />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/new" element={<DocumentEditor mode="create" />} />
        <Route path="/documents/:id" element={<DocumentPage />} />
        <Route path="/documents/:id/edit" element={<DocumentEditor mode="edit" />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </WorkbenchShell>
  );
}
