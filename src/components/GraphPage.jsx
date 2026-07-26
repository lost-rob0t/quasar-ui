import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, Building2, CalendarDays, ChevronRight, CircleDot,
  Clipboard, Copy, Database, ExternalLink, FileText, Focus, FolderPlus,
  GitBranch, Grid2X2, Lightbulb, Link2, MapPin, MoreHorizontal, Network,
  Pencil, Play, Plus, RadioTower, Search, Send, Server, Trash2,
  TriangleAlert, UserRound, X
} from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { createGraphAdapter } from "../graph/GraphAdapter";
import {
  assertDocument,
  createDocument,
  createRelation,
  dtypes,
  documentLabel,
  touchDocument
} from "starintel_doc";
import { SchemaField } from "./DocumentEditor";
import { actorApplicability, isBuiltinActor } from "../lib/actors";
import { buildGraph, filterGraph, findPaths, importedGraphNodeIds, partitionDocumentsByReview } from "../lib/graph";
import { activeGraphMembershipKey } from "../lib/graph-workspaces";
import { GRAPH_STYLE } from "../lib/graph-style";
import { clampRenderedPosition } from "../lib/graph-viewport";
import { operation } from "../lib/operations";
import {
  dataSchemaForDtype,
  essentialDataFieldsForDtype,
  formatSchemaValue,
  parseSchemaField
} from "../lib/schema-form";
import { useQuasar } from "../store";

const QUICK_NODE_TYPES = [
  { dtype: "person", label: "Person", Icon: UserRound },
  { dtype: "org", label: "Organization", Icon: Building2 },
  { dtype: "event", label: "Event", Icon: CalendarDays },
  { dtype: "location", label: "Location", Icon: MapPin },
  { dtype: "entity", label: "Entity", Icon: CircleDot },
  { dtype: "document", label: "Document", Icon: FileText },
  { dtype: "source", label: "Source", Icon: BookOpen },
  { dtype: "concept", label: "Concept", Icon: Lightbulb }
];
const COMPACT_NODE_TYPES = QUICK_NODE_TYPES.slice(0, 5);

function fitElements(cy, elements, padding, duration) {
  if (!cy || !elements?.length) return;
  cy.stop();
  cy.animate({ fit: { eles: elements, padding }, duration });
}

function GraphCanvas({
  graph,
  layout,
  selectedIds,
  onSelection,
  onMove,
  onViewport,
  onCanvasContext,
  onNodeContext,
  onEdgeContext,
  onRelationDraft,
  apiRef,
  edgeHandlesRef,
  labels
}) {
  const containerRef = useRef(null);
  const lastTap = useRef({ id: null, at: 0 });
  const syncingSelection = useRef(false);
  const callbacks = useRef({});
  const navigate = useNavigate();
  callbacks.current = {
    onSelection,
    onMove,
    onViewport,
    onCanvasContext,
    onNodeContext,
    onEdgeContext,
    onRelationDraft
  };

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const container = containerRef.current;
    const cy = createGraphAdapter({
      container,
      elements: [],
      style: GRAPH_STYLE,
      minZoom: 0.05,
      maxZoom: 6,
      selectionType: "additive",
      boxSelectionEnabled: true
    });
    apiRef.current = cy;
    const eh = cy.edgehandles({
      canConnect: (sourceNode, targetNode) => (
        sourceNode.id() !== targetNode.id()
        && !sourceNode.data("unresolved")
        && !targetNode.data("unresolved")
      ),
      edgeParams: (sourceNode, targetNode) => ({
        data: {
          id: `relation-preview-${sourceNode.id()}-${targetNode.id()}`,
          source: sourceNode.id(),
          target: targetNode.id()
        }
      }),
      snap: true,
      snapThreshold: 48,
      hoverDelay: 120
    });
    edgeHandlesRef.current = eh;

    let viewportTimer = null;
    const contextPosition = (event) => {
      const rendered = event.renderedPosition || event.target?.renderedPosition?.() || { x: 12, y: 12 };
      const bounds = container.getBoundingClientRect();
      return {
        rendered,
        bounds: { width: bounds.width, height: bounds.height },
        position: event.position || {
          x: (rendered.x - cy.pan().x) / cy.zoom(),
          y: (rendered.y - cy.pan().y) / cy.zoom()
        }
      };
    };
    const emitSelection = () => {
      if (syncingSelection.current) return;
      callbacks.current.onSelection(cy.$("node:selected").map((node) => node.id()));
    };
    cy.on("select unselect", "node", emitSelection);
    cy.on("tap", (event) => {
      if (event.target === cy) {
        cy.$("node:selected").unselect();
        callbacks.current.onSelection([]);
        return;
      }
      if (!event.target.isNode()) return;
      const now = Date.now();
      const id = event.target.id();
      if (lastTap.current.id === id && now - lastTap.current.at < 330 && !event.target.data("unresolved")) {
        navigate(`/documents/${encodeURIComponent(id)}`);
      }
      lastTap.current = { id, at: now };
    });
    cy.on("dragfree", "node", (event) => {
      const bounds = container.getBoundingClientRect();
      const rendered = clampRenderedPosition(event.target.renderedPosition(), bounds.width, bounds.height);
      event.target.renderedPosition(rendered);
      callbacks.current.onMove(event.target.id(), event.target.position());
    });
    cy.on("pan zoom", () => {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(() => {
        const activeNode = cy.$("node:selected").first();
        if (activeNode.length) {
          const bounds = container.getBoundingClientRect();
          const rendered = activeNode.renderedPosition();
          const clamped = clampRenderedPosition(rendered, bounds.width, bounds.height);
          if (clamped.x !== rendered.x || clamped.y !== rendered.y) {
            cy.panBy({ x: clamped.x - rendered.x, y: clamped.y - rendered.y });
          }
        }
        callbacks.current.onViewport({ pan: cy.pan(), zoom: cy.zoom() });
      }, 140);
    });
    cy.on("cxttap", (event) => {
      const context = contextPosition(event);
      if (event.target === cy) callbacks.current.onCanvasContext(context);
      else if (event.target.isNode()) callbacks.current.onNodeContext(event.target.id(), context);
      else if (event.target.isEdge()) callbacks.current.onEdgeContext(event.target.id(), context);
    });
    cy.on("ehcomplete", (event, sourceNode, targetNode, addedEdge) => {
      const context = contextPosition(event);
      addedEdge.remove();
      callbacks.current.onRelationDraft({
        ids: [sourceNode.id(), targetNode.id()],
        rendered: context.rendered,
        bounds: context.bounds
      });
    });

    return () => {
      clearTimeout(viewportTimer);
      eh.destroy();
      edgeHandlesRef.current = null;
      apiRef.current = null;
      cy.destroy();
    };
  }, [apiRef, edgeHandlesRef, navigate]);

  useEffect(() => {
    const cy = apiRef.current;
    if (!cy) return;
    const previous = new Map(cy.nodes().map((node) => [node.id(), node.position()]));
    cy.batch(() => {
      cy.elements().remove();
      cy.add(graph.elements);
      cy.nodes().forEach((node) => {
        const position = graph.nodes.find((item) => item.data.id === node.id())?.position || previous.get(node.id());
        if (position) node.position(position);
      });
    });
    if (graph.nodes.length && !graph.nodes.some((node) => node.position)) {
      cy.layout({ name: layout || "cose", animate: false, padding: 50, randomize: true }).run();
    }
  }, [apiRef, graph, layout]);

  useEffect(() => {
    const cy = apiRef.current;
    if (!cy) return;
    const selected = new Set(selectedIds);
    syncingSelection.current = true;
    try {
      cy.nodes().forEach((node) => {
        if (selected.has(node.id()) && !node.selected()) node.select();
        if (!selected.has(node.id()) && node.selected()) node.unselect();
      });
    } finally {
      syncingSelection.current = false;
    }
  }, [apiRef, selectedIds]);

  useEffect(() => {
    const cy = apiRef.current;
    if (!cy) return;
    if (labels) cy.elements().removeClass("labels-hidden");
    else cy.elements().addClass("labels-hidden");
  }, [apiRef, labels]);

  return <div className="graph-canvas" ref={containerRef} onContextMenu={(event) => event.preventDefault()} />;
}

function Modal({ title, children, onClose, className = "" }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${className}`}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

function GraphCreate({ onClose, onCreate }) {
  const [name, setName] = useState("");

  function submit(event) {
    event.preventDefault();
    if (onCreate(name) !== false) onClose();
  }

  return (
    <Modal title="Create graph" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="field"><span>Graph name</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus required /></label>
        <p className="muted graph-form-note">A new graph starts blank and keeps its own document membership, positions, layout, viewport, and selection.</p>
        <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">Create graph</button></div>
      </form>
    </Modal>
  );
}

function GraphMembershipAdd({ documents, existingIds, onAdd, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const existing = useMemo(() => new Set(existingIds || []), [existingIds]);
  const visible = useMemo(() => documents
    .filter((document) => document.dtype !== "relation" && !existing.has(document._id))
    .filter((document) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return `${document._id} ${document.title || ""} ${JSON.stringify(document.data || {})}`.toLowerCase().includes(needle);
    })
    .slice(0, 100), [documents, existing, query]);

  function toggle(id) {
    setSelected((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  }

  function submit(event) {
    event.preventDefault();
    onAdd(selected);
    onClose();
  }

  return (
    <Modal title="Add corpus documents" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="field"><span>Search corpus</span><input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Name, ID, or field value" /></label>
        <div className="membership-list">
          {visible.map((document) => (
            <label key={document._id}>
              <input type="checkbox" checked={selected.includes(document._id)} onChange={() => toggle(document._id)} />
              <span><strong>{documentLabel(document)}</strong><code>{document._id}</code></span>
            </label>
          ))}
          {!visible.length && <p className="muted">No available corpus documents match.</p>}
        </div>
        <p className="muted graph-form-note">Relations whose endpoints are both in this graph are added automatically.</p>
        <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={!selected.length}>Add {selected.length || ""} document{selected.length === 1 ? "" : "s"}</button></div>
      </form>
    </Modal>
  );
}

function RelationAdd({ ids, documents, position, onClose }) {
  const { execute, setNotice, addDocumentsToActiveGraph } = useQuasar();
  const source = documents.find((document) => document._id === ids[0]);
  const target = documents.find((document) => document._id === ids[1]);
  const [predicate, setPredicate] = useState("related-to");
  const [directed, setDirected] = useState(true);
  const [dataset, setDataset] = useState(source?.dataset || target?.dataset || "default");

  async function submit(event) {
    event.preventDefault();
    try {
      const relation = assertDocument(createRelation({
        dataset,
        subject: ids[0],
        predicate,
        object: ids[1],
        directed,
        title: `${documentLabel(source) || ids[0]} ${predicate} ${documentLabel(target) || ids[1]}`
      }));
      await execute(operation.save(relation), `Connect ${ids[0]} to ${ids[1]}`);
      addDocumentsToActiveGraph([relation._id]);
      onClose();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  return (
    <div
      className="graph-relation-editor"
      role="dialog"
      aria-label="Create relation"
      style={{
        left: Math.max(8, Math.min(position?.rendered?.x || 16, (position?.bounds?.width || 600) - 330)),
        top: Math.max(8, Math.min(position?.rendered?.y || 16, (position?.bounds?.height || 500) - 310))
      }}
    >
      <header><strong>New relation</strong><button className="icon-button" type="button" onClick={onClose}><X size={15} /></button></header>
      <form className="relation-editor-form" onSubmit={submit}>
        <div className="relation-preview"><strong>{documentLabel(source) || ids[0]}</strong><span>→</span><strong>{documentLabel(target) || ids[1]}</strong></div>
        <label className="field"><span>Predicate</span><input value={predicate} onChange={(event) => setPredicate(event.target.value)} autoFocus required /></label>
        <label className="field"><span>Dataset</span><input value={dataset} onChange={(event) => setDataset(event.target.value)} required /></label>
        <label className="checkbox"><input type="checkbox" checked={directed} onChange={(event) => setDirected(event.target.checked)} /> Directed relation</label>
        <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">Create relation</button></div>
      </form>
    </div>
  );
}

function parseQuickJson(value, label, fallback) {
  if (!String(value || "").trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function NodeQuickEditor({ document, onClose }) {
  const navigate = useNavigate();
  const { execute, setNotice } = useQuasar();
  const fieldSchema = useMemo(() => dataSchemaForDtype(document.dtype), [document.dtype]);
  const fields = useMemo(() => essentialDataFieldsForDtype(document.dtype), [document.dtype]);
  const required = useMemo(() => new Set(fieldSchema.required || []), [fieldSchema]);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((name) => [
    name,
    formatSchemaValue(document.data?.[name], fieldSchema.properties?.[name] || {})
  ])));
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = { ...(document.data || {}) };
      for (const name of fields) {
        const parsed = parseSchemaField(
          name,
          values[name],
          fieldSchema.properties?.[name] || {},
          parseQuickJson
        );
        if (parsed === undefined) delete data[name];
        else data[name] = parsed;
      }
      const updated = assertDocument(touchDocument(document, { data }));
      await execute(operation.save(updated), `Update ${document._id}`);
      onClose();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  }

  function openAdvanced() {
    onClose();
    navigate(`/documents/${encodeURIComponent(document._id)}/edit?advanced=1`);
  }

  return (
    <Modal title={`Edit ${documentLabel(document)}`} onClose={onClose} className="quick-edit-modal">
      <form className="modal-form quick-edit-form" onSubmit={submit}>
        <div className="quick-edit-fields">
          {fields.map((name) => (
            <SchemaField
              key={name}
              name={name}
              fieldSchema={fieldSchema.properties?.[name] || {}}
              required={required.has(name)}
              value={values[name] || ""}
              onChange={(value) => setValues((current) => ({ ...current, [name]: value }))}
            />
          ))}
        </div>
        {!fields.length && <p className="muted">This document type has no compact scalar fields.</p>}
        <div className="form-actions">
          <button type="button" className="button" onClick={openAdvanced}>Advanced…</button>
          <button className="button primary" disabled={saving}><Pencil size={14} /> {saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TargetSubmit({ document, onClose }) {
  const { settings, submitTarget, setNotice } = useQuasar();
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState(document._id);
  const [dataset, setDataset] = useState(document.dataset || "default");
  const [recurring, setRecurring] = useState(false);
  const [delay, setDelay] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const targetDocument = assertDocument(createDocument("target", {
        dataset,
        title: `Target ${documentLabel(document)}`,
        data: {
          actor,
          target,
          target_id: document._id,
          target_type: document.dtype,
          recurring,
          delay: Number(delay) || 0,
          options: []
        }
      }));
      await submitTarget(targetDocument, settings);
      setNotice({ kind: "success", message: `Submitted ${documentLabel(document)} to ${actor}` });
      onClose();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Submit target" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <p className="muted">Send a canonical v0.9 target document to the configured StarIntel server.</p>
        <label className="field"><span>Actor ID</span><input value={actor} onChange={(event) => setActor(event.target.value)} autoFocus required /></label>
        <label className="field"><span>Target</span><input value={target} onChange={(event) => setTarget(event.target.value)} required /></label>
        <label className="field"><span>Dataset</span><input value={dataset} onChange={(event) => setDataset(event.target.value)} required /></label>
        <label className="field"><span>Delay in seconds</span><input type="number" min="0" value={delay} onChange={(event) => setDelay(event.target.value)} /></label>
        <label className="checkbox"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /> Recurring target</label>
        {!settings?.serverUrl && <p className="validation-error">Configure a StarIntel server URL in Settings first.</p>}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={submitting || !settings?.serverUrl}><Send size={15} /> {submitting ? "Submitting…" : "Submit target"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function GraphPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    documents, workspace, selectedIds, selectedDocuments, select, persistWorkspace,
    actors, runActor, settings, setNotice, graphs, activeGraph,
    addDocumentsToActiveGraph, removeDocumentsFromActiveGraph,
    createGraph, switchGraph, renameGraph, deleteGraph, execute,
    queueStatus, startQueue, stopQueue
  } = useQuasar();
  const apiRef = useRef(null);
  const edgeHandlesRef = useRef(null);
  const importMembershipHandled = useRef(false);
  const importFocusHandled = useRef(false);
  const importedIds = useMemo(
    () => location.state?.source === "local-import" ? [...new Set(location.state.importedIds || [])] : [],
    [location.state]
  );
  const [query, setQuery] = useState("");
  const [dtype, setDtype] = useState("");
  const [dataset, setDataset] = useState("");
  const [predicate, setPredicate] = useState("");
  const [reviewStatus, setReviewStatus] = useState(location.state?.revealUnreviewed || !documents.length ? "all" : "reviewed");
  const [labels, setLabels] = useState(true);
  const [relationDraft, setRelationDraft] = useState(null);
  const [quickEditDocument, setQuickEditDocument] = useState(null);
  const [targetDocument, setTargetDocument] = useState(null);
  const [showGraphCreate, setShowGraphCreate] = useState(false);
  const [showMembershipAdd, setShowMembershipAdd] = useState(false);
  const [canvasMenu, setCanvasMenu] = useState(null);
  const [menuSection, setMenuSection] = useState("");
  const [menuQuery, setMenuQuery] = useState("");
  const [emptyStateDismissed, setEmptyStateDismissed] = useState(false);
  const [pathStart, setPathStart] = useState("");
  const [pathEnd, setPathEnd] = useState("");
  const [paths, setPaths] = useState([]);
  const [activePath, setActivePath] = useState(-1);
  const [runningActorId, setRunningActorId] = useState("");
  const [lastActorRun, setLastActorRun] = useState(null);

  const membershipKey = activeGraphMembershipKey(workspace || {});
  const scopedDocuments = useMemo(() => {
    if (membershipKey === "*") return documents;
    const allowed = new Set(JSON.parse(membershipKey));
    return documents.filter((document) => allowed.has(document._id));
  }, [documents, membershipKey]);
  const reviewGroups = useMemo(() => partitionDocumentsByReview(scopedDocuments), [scopedDocuments]);
  const graphDocuments = reviewStatus === "all" ? scopedDocuments : reviewGroups.reviewed;
  const graph = useMemo(() => buildGraph(graphDocuments, workspace?.positions || {}), [graphDocuments, workspace?.positions]);
  const visibleGraph = useMemo(
    () => filterGraph(graph, { query, dtype, dataset, predicate }),
    [graph, query, dtype, dataset, predicate]
  );
  const datasets = useMemo(
    () => [...new Set(graphDocuments.map((document) => document.dataset || "unknown"))].sort(),
    [graphDocuments]
  );
  const predicates = useMemo(
    () => [...new Set(graph.edges.map((edge) => edge.data.predicate).filter(Boolean))].sort(),
    [graph.edges]
  );
  const graphDocumentIds = useMemo(() => new Set(graph.nodes.map((node) => node.data.id)), [graph.nodes]);
  const importedFocusIds = useMemo(() => importedGraphNodeIds(graph, importedIds), [graph, importedIds]);
  const nodeOptions = graph.nodes
    .filter((node) => !node.data.unresolved)
    .slice()
    .sort((left, right) => left.data.label.localeCompare(right.data.label));
  const selected = selectedDocuments.find((document) => graphDocumentIds.has(document._id));
  const actorEntries = useMemo(() => actors.map((actor) => ({
    actor,
    builtin: isBuiltinActor(actor),
    availability: actorApplicability(actor, selectedDocuments)
  })), [actors, selectedDocuments]);

  const onMove = useMemo(() => (id, position) => {
    persistWorkspace({ positions: { ...(workspace?.positions || {}), [id]: position } });
  }, [persistWorkspace, workspace?.positions]);
  const onViewport = useMemo(() => (viewport) => persistWorkspace({ viewport }), [persistWorkspace]);
  const onSelection = useMemo(() => (ids) => select(ids), [select]);

  useEffect(() => {
    setCanvasMenu(null);
    setRelationDraft(null);
    setQuickEditDocument(null);
    setTargetDocument(null);
    setMenuSection("");
    setMenuQuery("");
    setEmptyStateDismissed(false);
  }, [activeGraph?.id]);

  useEffect(() => {
    if (!canvasMenu) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setCanvasMenu(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [canvasMenu]);

  useEffect(() => {
    const retained = selectedIds.filter((id) => graphDocumentIds.has(id));
    if (retained.length !== selectedIds.length) select(retained);
  }, [graphDocumentIds, select, selectedIds]);

  useEffect(() => {
    if (importMembershipHandled.current || !importedIds.length) return;
    importMembershipHandled.current = true;
    addDocumentsToActiveGraph(importedIds);
    setReviewStatus("all");
  }, [addDocumentsToActiveGraph, importedIds]);

  useEffect(() => {
    if (importFocusHandled.current || !importedFocusIds.length) return undefined;
    importFocusHandled.current = true;
    select(importedFocusIds);
    const timer = setTimeout(() => {
      const cy = apiRef.current;
      if (!cy) return;
      const elements = cy.collection();
      importedFocusIds.forEach((id) => elements.merge(cy.getElementById(id)));
      fitElements(cy, elements, 140, 350);
    }, 100);
    return () => clearTimeout(timer);
  }, [importedFocusIds, select]);

  useEffect(() => {
    const node = params.get("node");
    const document = documents.find((item) => item._id === node);
    if (!node || !document) return;
    if (!graphDocumentIds.has(node) && reviewStatus === "reviewed") {
      setReviewStatus("all");
      return;
    }
    select([node]);
    const timer = setTimeout(() => {
      const cy = apiRef.current;
      const element = cy?.getElementById(node);
      fitElements(cy, element, 160, 350);
    }, 100);
    return () => clearTimeout(timer);
  }, [documents, graphDocumentIds, params, reviewStatus, select]);

  function fit() {
    const cy = apiRef.current;
    fitElements(cy, cy?.elements(), 60, 280);
  }

  function runLayout(name) {
    const cy = apiRef.current;
    if (!cy) return;
    persistWorkspace({ layout: name });
    const options = name === "breadthfirst"
      ? { name, directed: true, padding: 60, spacingFactor: 1.25, animate: true }
      : { name, padding: 60, animate: true, randomize: name === "cose" };
    const layout = cy.layout(options);
    layout.on("layoutstop", () => {
      const positions = { ...(workspace?.positions || {}) };
      cy.nodes().forEach((node) => { positions[node.id()] = node.position(); });
      persistWorkspace({ positions, layout: name });
    });
    layout.run();
  }

  function calculatePaths() {
    const result = findPaths(graph, pathStart, pathEnd, 7, 9);
    setPaths(result);
    applyPath(result, result.length ? 0 : -1);
  }

  function applyPath(nextPaths, index) {
    setActivePath(index);
    const cy = apiRef.current;
    if (!cy) return;
    cy.elements().removeClass("path");
    const path = nextPaths[index];
    if (!path) return;
    path.nodes.forEach((id) => cy.getElementById(id).addClass("path"));
    path.edges.forEach((edge) => cy.getElementById(edge.data.id).addClass("path"));
    fitElements(cy, cy.$(".path"), 120, 300);
  }

  function focusSelection() {
    const cy = apiRef.current;
    if (!cy || !selectedIds.length) return;
    const neighborhood = cy.$("node:selected").closedNeighborhood();
    fitElements(cy, neighborhood, 100, 300);
  }

  function clearFilters() {
    setQuery("");
    setDtype("");
    setDataset("");
    setPredicate("");
  }

  function openQuickAdd(position = null, dtype = "entity") {
    setCanvasMenu(null);
    const editorParams = new URLSearchParams({
      dtype,
      dataset: selected?.dataset || dataset || "default",
      returnTo: "graph"
    });
    if (position) {
      editorParams.set("x", String(position.x));
      editorParams.set("y", String(position.y));
    }
    navigate(`/documents/new?${editorParams}`);
  }

  function openCanvasMenu(context) {
    setEmptyStateDismissed(true);
    setMenuSection("");
    setMenuQuery("");
    setCanvasMenu({
      kind: "canvas",
      ...context
    });
  }

  function openNodeMenu(id, context) {
    if (!selectedIds.includes(id)) select([id]);
    setMenuSection("");
    setMenuQuery("");
    setCanvasMenu({ kind: "node", id, ...context });
  }

  function openEdgeMenu(id, context) {
    setMenuSection("");
    setMenuQuery("");
    setCanvasMenu({ kind: "edge", id, ...context });
  }

  function beginRelationFromNode(id) {
    const node = apiRef.current?.getElementById(id);
    setCanvasMenu(null);
    if (node?.length) edgeHandlesRef.current?.start(node);
  }

  function openSelectedRelation() {
    if (selectedIds.length !== 2) return;
    const cy = apiRef.current;
    const first = cy?.getElementById(selectedIds[0]);
    const second = cy?.getElementById(selectedIds[1]);
    const firstPosition = first?.length ? first.renderedPosition() : { x: 100, y: 100 };
    const secondPosition = second?.length ? second.renderedPosition() : firstPosition;
    const bounds = cy?.container()?.getBoundingClientRect();
    setRelationDraft({
      ids: [...selectedIds],
      rendered: {
        x: (firstPosition.x + secondPosition.x) / 2,
        y: (firstPosition.y + secondPosition.y) / 2
      },
      bounds: {
        width: bounds?.width || 600,
        height: bounds?.height || 500
      }
    });
  }

  function closeCanvasMenu(event) {
    if (canvasMenu && !event.target.closest(".graph-context-menu")) setCanvasMenu(null);
  }

  const canvasMenuStyle = canvasMenu ? {
    left: Math.max(8, Math.min(
      canvasMenu.rendered.x,
      canvasMenu.bounds.width - 292
    )),
    top: Math.max(8, Math.min(
      canvasMenu.rendered.y,
      canvasMenu.bounds.height - 430
    ))
  } : undefined;

  function createNamedGraph(name) {
    try {
      createGraph(name);
      setReviewStatus("all");
      clearFilters();
      setPaths([]);
      setActivePath(-1);
      return true;
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
      return false;
    }
  }

  function changeGraph(id) {
    try {
      switchGraph(id);
      setReviewStatus("all");
      clearFilters();
      setPaths([]);
      setActivePath(-1);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function renameCurrentGraph() {
    const name = window.prompt("Graph name", activeGraph?.name || "");
    if (name === null) return;
    try {
      renameGraph(name);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function deleteCurrentGraph() {
    if (!window.confirm(`Delete graph "${activeGraph?.name || ""}"? Corpus documents will not be deleted.`)) return;
    try {
      deleteGraph();
      setReviewStatus("all");
      clearFilters();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function addExistingDocuments(ids) {
    const members = new Set([...(activeGraph?.documentIds || []), ...ids]);
    const relationIds = documents
      .filter((document) => document.dtype === "relation")
      .filter((document) => members.has(document.data?.subject) && members.has(document.data?.object))
      .map((document) => document._id);
    addDocumentsToActiveGraph([...ids, ...relationIds], { selectedIds: ids });
    setReviewStatus("all");
    clearFilters();
  }

  function removeSelectionFromGraph() {
    if (!selectedIds.length || activeGraph?.documentIds === null) return;
    const selectedSet = new Set(selectedIds);
    const relationIds = scopedDocuments
      .filter((document) => document.dtype === "relation")
      .filter((document) => selectedSet.has(document.data?.subject) || selectedSet.has(document.data?.object))
      .map((document) => document._id);
    removeDocumentsFromActiveGraph([...selectedIds, ...relationIds]);
  }

  function removeNodeFromGraph(id) {
    if (activeGraph?.documentIds === null) return;
    select([id]);
    const relationIds = scopedDocuments
      .filter((document) => document.dtype === "relation")
      .filter((document) => document.data?.subject === id || document.data?.object === id)
      .map((document) => document._id);
    removeDocumentsFromActiveGraph([id, ...relationIds]);
    setCanvasMenu(null);
  }

  function selectNeighbors(id) {
    const node = apiRef.current?.getElementById(id);
    if (!node?.length) return;
    select(node.closedNeighborhood().nodes().map((item) => item.id()));
    setCanvasMenu(null);
  }

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ kind: "success", message });
      setCanvasMenu(null);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  async function deleteCorpusDocuments(ids) {
    const selectedSet = new Set(ids);
    const relationIds = documents
      .filter((document) => document.dtype === "relation")
      .filter((document) => selectedSet.has(document.data?.subject) || selectedSet.has(document.data?.object))
      .map((document) => document._id);
    const deleteIds = [...new Set([...ids, ...relationIds])];
    if (!window.confirm(`Delete ${deleteIds.length} corpus document(s)? This includes connected relation documents and can be undone.`)) return;
    try {
      await execute(
        operation.batch(deleteIds.map((id) => operation.remove(id)), "Delete graph documents"),
        `Delete ${deleteIds.length} graph document(s)`
      );
      if (activeGraph?.documentIds !== null) removeDocumentsFromActiveGraph(deleteIds);
      setCanvasMenu(null);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  async function toggleQueueListener() {
    try {
      if (queueStatus.state === "active" || queueStatus.state === "connecting") stopQueue();
      else startQueue(settings);
      setCanvasMenu(null);
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  const menuMatches = (label) => !menuQuery.trim()
    || label.toLowerCase().includes(menuQuery.trim().toLowerCase());

  async function executeActor(actor) {
    setRunningActorId(actor.id);
    setLastActorRun(null);
    try {
      const result = await runActor(actor);
      const produced = Array.isArray(result?.documents) ? result.documents : [];
      const nodeIds = produced
        .filter((document) => document?.dtype !== "relation")
        .map((document) => document._id)
        .filter(Boolean)
        .slice(0, 100);
      if (produced.length) {
        setReviewStatus("all");
        clearFilters();
        if (nodeIds.length) select(nodeIds);
      }
      setLastActorRun({
        actorId: actor.id,
        produced: produced.length,
        message: result?.message || `Actor produced ${produced.length} document(s).`
      });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    } finally {
      setRunningActorId("");
    }
  }

  return (
    <section className="graph-page">
      <Link className="back-link" to="/"><ArrowLeft size={14} /> Statistics dashboard</Link>
      <div className="page-heading graph-heading">
        <div><span className="eyebrow">Investigation graph</span><h1>Graph explorer</h1><p>Search, filter, and inspect the relationship network. Reviewed records are shown by default.</p></div>
        <div className="graph-heading-actions">
          <div className="graph-source-status"><Database size={17} /><span><strong>Local PouchDB corpus</strong><small>startup + live changes</small></span></div>
          <div className="graph-switcher">
            <select aria-label="Active graph" value={activeGraph?.id || ""} onChange={(event) => changeGraph(event.target.value)}>
              {(graphs || []).map((graphView) => (
                <option key={graphView.id} value={graphView.id}>
                  {graphView.name}{graphView.documentIds === null ? " · all documents" : ` · ${graphView.documentIds.length}`}
                </option>
              ))}
            </select>
            <button className="icon-button" title="Create graph" aria-label="Create graph" onClick={() => setShowGraphCreate(true)}><FolderPlus size={16} /></button>
            <button className="icon-button" title="Rename graph" aria-label="Rename graph" onClick={renameCurrentGraph}><Pencil size={15} /></button>
            <button className="icon-button danger" title="Delete graph" aria-label="Delete graph" onClick={deleteCurrentGraph} disabled={(graphs || []).length <= 1}><Trash2 size={15} /></button>
          </div>
          <div className="button-row">
            {activeGraph?.documentIds !== null && <button className="button" onClick={() => setShowMembershipAdd(true)}><Plus size={16} /> Add from corpus</button>}
            {activeGraph?.documentIds !== null && <button className="button danger" onClick={removeSelectionFromGraph} disabled={!selectedIds.length}>Remove from graph</button>}
            <button className="button" onClick={openSelectedRelation} disabled={selectedIds.length !== 2}><Link2 size={16} /> Connect selected</button>
            <button className="button primary" onClick={() => openQuickAdd()}><Plus size={16} /> Add graph document</button>
          </div>
        </div>
      </div>

      <div className="graph-toolbar">
        <label className="graph-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search graph" /></label>
        <select aria-label="Dataset filter" value={dataset} onChange={(event) => setDataset(event.target.value)}>
          <option value="">All datasets</option>
          {datasets.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select aria-label="Document type filter" value={dtype} onChange={(event) => setDtype(event.target.value)}>
          <option value="">All dtypes</option>
          {dtypes.map((name) => <option key={name}>{name}</option>)}
        </select>
        <select aria-label="Predicate filter" value={predicate} onChange={(event) => setPredicate(event.target.value)}>
          <option value="">All predicates</option>
          {predicates.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select aria-label="Reviewed status filter" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}>
          <option value="reviewed">Reviewed only</option>
          <option value="all">Reviewed + unreviewed</option>
        </select>
        <select aria-label="Graph layout" value={workspace?.layout || "cose"} onChange={(event) => runLayout(event.target.value)}>
          <option value="cose">Force</option><option value="breadthfirst">Hierarchy</option><option value="circle">Circle</option><option value="concentric">Concentric</option><option value="grid">Grid</option>
        </select>
        <button className="button small" onClick={fit}>Fit</button>
        <button className="button small" onClick={focusSelection} disabled={!selectedIds.length}><Focus size={15} /> Focus</button>
        <label className="checkbox compact"><input type="checkbox" checked={labels} onChange={(event) => setLabels(event.target.checked)} /> Labels</label>
        <span className="graph-count">
          {visibleGraph.nodes.length} nodes · {visibleGraph.edges.length} edges · {reviewGroups.reviewed.length.toLocaleString()} reviewed · {reviewGroups.unreviewed.length.toLocaleString()} unreviewed
        </span>
      </div>

      {reviewStatus === "all" && reviewGroups.unreviewed.length > 0 && (
        <div className="graph-review-warning">
          <TriangleAlert size={17} />
          <span>
            {importedIds.length ? "Imported records are revealed for this graph session. " : "Unreviewed data is enabled. "}
            {reviewGroups.unreviewed.length.toLocaleString()} unreviewed records are displayed alongside reviewed records.
          </span>
        </div>
      )}

      <div className="graph-workbench">
        <div
          className="graph-stage"
          onPointerDown={closeCanvasMenu}
        >
          <GraphCanvas
            graph={visibleGraph}
            layout={workspace?.layout || "cose"}
            selectedIds={selectedIds}
            onSelection={onSelection}
            onMove={onMove}
            onViewport={onViewport}
            onCanvasContext={openCanvasMenu}
            onNodeContext={openNodeMenu}
            onEdgeContext={openEdgeMenu}
            onRelationDraft={setRelationDraft}
            apiRef={apiRef}
            edgeHandlesRef={edgeHandlesRef}
            labels={labels}
          />
          {!visibleGraph.nodes.length && !emptyStateDismissed && (
            <div className="graph-empty-state">
              <Network size={38} />
              <h2>{scopedDocuments.length ? "No graph nodes match" : "Start a blank graph"}</h2>
              <p>
                {graph.nodes.length
                  ? "Change or clear the active filters."
                  : reviewGroups.unreviewed.length
                    ? `${reviewGroups.unreviewed.length.toLocaleString()} unreviewed document(s) are hidden by the current review filter.`
                    : "Right-click anywhere to create the first node, or use an action below."}
              </p>
              <div className="button-row">
                {graph.nodes.length && <button className="button small" onClick={clearFilters}>Clear filters</button>}
                {!graph.nodes.length && reviewGroups.unreviewed.length > 0 && <button className="button small" onClick={() => setReviewStatus("all")}>Show unreviewed</button>}
                {!graph.nodes.length && activeGraph?.documentIds !== null && <button className="button small" onClick={() => setShowMembershipAdd(true)}>Add from corpus</button>}
                {!graph.nodes.length && <button className="button primary small" onClick={() => openQuickAdd()}><Plus size={15} /> Create first node</button>}
                {!graph.nodes.length && <Link className="button small" to="/import">Import documents</Link>}
                <button className="button small" onClick={() => setEmptyStateDismissed(true)}>Enter blank canvas</button>
              </div>
            </div>
          )}
          {canvasMenu && (
            <div
              className={`graph-context-menu expanded ${canvasMenu.kind}-actions`}
              role="menu"
              aria-label={`${canvasMenu.kind} actions`}
              style={canvasMenuStyle}
              onContextMenu={(event) => event.preventDefault()}
            >
              {(() => {
                const nodeDocument = documents.find((document) => document._id === canvasMenu.id);
                const edgeDocument = canvasMenu.kind === "edge"
                  ? documents.find((document) => document._id === canvasMenu.id)
                  : null;
                const section = menuQuery ? "search" : menuSection;
                return <>
                  <div className="graph-context-header">
                    {menuSection && !menuQuery
                      ? <button role="menuitem" aria-label="Back" onClick={() => setMenuSection("")}><ArrowLeft size={15} /></button>
                      : <span className="context-kind">{canvasMenu.kind}</span>}
                    <strong>
                      {canvasMenu.kind === "node"
                        ? nodeDocument ? documentLabel(nodeDocument) : canvasMenu.id
                        : canvasMenu.kind === "edge"
                          ? edgeDocument ? documentLabel(edgeDocument) : "Relation"
                          : activeGraph?.name || "Graph"}
                    </strong>
                  </div>
                  <label className="graph-context-search">
                    <Search size={14} />
                    <input aria-label="Search context actions" value={menuQuery} onChange={(event) => setMenuQuery(event.target.value)} placeholder="Find action…" />
                  </label>

                  {canvasMenu.kind === "node" && nodeDocument && (
                    <>
                      {!section && (
                        <>
                          <Link role="menuitem" to={`/documents/${encodeURIComponent(canvasMenu.id)}`}><ExternalLink size={15} /> Open document</Link>
                          <button role="menuitem" onClick={() => setMenuSection("edit")}><Pencil size={15} /> Edit <ChevronRight size={14} /></button>
                          <button role="menuitem" onClick={() => setMenuSection("connect")}><Link2 size={15} /> Connect <ChevronRight size={14} /></button>
                          <button role="menuitem" onClick={() => setMenuSection("selection")}><Focus size={15} /> Selection <ChevronRight size={14} /></button>
                          <button role="menuitem" onClick={() => setMenuSection("actors")}><Play size={15} /> Run actor <ChevronRight size={14} /></button>
                          <button role="menuitem" onClick={() => { setCanvasMenu(null); setTargetDocument(nodeDocument); }}><Send size={15} /> Submit as target</button>
                          <button role="menuitem" onClick={() => setMenuSection("copy")}><Copy size={15} /> Copy <ChevronRight size={14} /></button>
                          <div className="graph-context-divider" />
                          {activeGraph?.documentIds !== null && <button role="menuitem" onClick={() => removeNodeFromGraph(canvasMenu.id)}><Trash2 size={15} /> Remove from this graph</button>}
                          <button role="menuitem" className="danger" onClick={() => deleteCorpusDocuments(selectedIds.length > 1 ? selectedIds : [canvasMenu.id])}><Trash2 size={15} /> Delete from corpus</button>
                        </>
                      )}
                      {(section === "edit" || section === "search") && (
                        <>
                          {menuMatches("Quick edit") && <button role="menuitem" onClick={() => { setCanvasMenu(null); setQuickEditDocument(nodeDocument); }}><Pencil size={15} /> Quick edit</button>}
                          {menuMatches("Advanced edit") && <Link role="menuitem" to={`/documents/${encodeURIComponent(canvasMenu.id)}/edit`}><MoreHorizontal size={15} /> Advanced edit</Link>}
                        </>
                      )}
                      {(section === "connect" || section === "search") && (
                        <>
                          {menuMatches("Drag a relation") && <button role="menuitem" onClick={() => beginRelationFromNode(canvasMenu.id)}><Link2 size={15} /> Drag a relation</button>}
                          {menuMatches("Connect selected pair") && <button role="menuitem" disabled={selectedIds.length !== 2} onClick={() => { setCanvasMenu(null); openSelectedRelation(); }}><GitBranch size={15} /> Connect selected pair</button>}
                        </>
                      )}
                      {(section === "selection" || section === "search") && (
                        <>
                          {menuMatches("Select neighbors") && <button role="menuitem" onClick={() => selectNeighbors(canvasMenu.id)}><Network size={15} /> Select neighbors</button>}
                          {menuMatches("Focus selection") && <button role="menuitem" onClick={() => { setCanvasMenu(null); focusSelection(); }}><Focus size={15} /> Focus selection</button>}
                          {menuMatches("Clear selection") && <button role="menuitem" onClick={() => { select([]); setCanvasMenu(null); }}><X size={15} /> Clear selection</button>}
                          {activeGraph?.documentIds !== null && menuMatches("Remove selection from graph") && <button role="menuitem" onClick={() => { removeSelectionFromGraph(); setCanvasMenu(null); }}><Trash2 size={15} /> Remove selection from graph</button>}
                        </>
                      )}
                      {(section === "actors" || section === "search") && actorEntries
                        .filter(({ actor }) => menuMatches(actor.label))
                        .map(({ actor, availability }) => (
                          <button role="menuitem" key={actor.id} disabled={!availability.applicable || runningActorId === actor.id} onClick={() => { setCanvasMenu(null); executeActor(actor); }}>
                            <Play size={15} /> {actor.label}
                          </button>
                        ))}
                      {(section === "copy" || section === "search") && (
                        <>
                          {menuMatches("Copy document ID") && <button role="menuitem" onClick={() => copyText(nodeDocument._id, "Copied document ID")}><Clipboard size={15} /> Copy document ID</button>}
                          {menuMatches("Copy document JSON") && <button role="menuitem" onClick={() => copyText(JSON.stringify(nodeDocument, null, 2), "Copied document JSON")}><Copy size={15} /> Copy document JSON</button>}
                        </>
                      )}
                      {section === "search" && menuMatches("Submit as target") && <button role="menuitem" onClick={() => { setCanvasMenu(null); setTargetDocument(nodeDocument); }}><Send size={15} /> Submit as target</button>}
                    </>
                  )}

                  {canvasMenu.kind === "edge" && edgeDocument && (
                    <>
                      {menuMatches("Open relation") && <Link role="menuitem" to={`/documents/${encodeURIComponent(edgeDocument._id)}`}><ExternalLink size={15} /> Open relation</Link>}
                      {menuMatches("Edit relation") && <Link role="menuitem" to={`/documents/${encodeURIComponent(edgeDocument._id)}/edit`}><Pencil size={15} /> Edit relation</Link>}
                      {menuMatches("Copy relation ID") && <button role="menuitem" onClick={() => copyText(edgeDocument._id, "Copied relation ID")}><Clipboard size={15} /> Copy relation ID</button>}
                      {menuMatches("Copy relation JSON") && <button role="menuitem" onClick={() => copyText(JSON.stringify(edgeDocument, null, 2), "Copied relation JSON")}><Copy size={15} /> Copy relation JSON</button>}
                      <div className="graph-context-divider" />
                      <button role="menuitem" className="danger" onClick={() => deleteCorpusDocuments([edgeDocument._id])}><Trash2 size={15} /> Delete relation</button>
                    </>
                  )}

                  {canvasMenu.kind === "canvas" && (
                    <>
                      {!section && (
                        <>
                          <div className="graph-context-palette" aria-label="Create node type">
                            {COMPACT_NODE_TYPES.map(({ dtype: nodeDtype, label, Icon }) => (
                              <button key={nodeDtype} role="menuitem" aria-label={`Create ${label.toLowerCase()} here`} title={label} onClick={() => openQuickAdd(canvasMenu.position, nodeDtype)}><Icon size={16} /></button>
                            ))}
                          </div>
                          <button role="menuitem" onClick={() => setMenuSection("create")}><Plus size={15} /> Create node <ChevronRight size={14} /></button>
                          <button role="menuitem" onClick={() => setMenuSection("graph")}><Network size={15} /> Graph <ChevronRight size={14} /></button>
                          <button role="menuitem" onClick={() => setMenuSection("layout")}><Grid2X2 size={15} /> Layout <ChevronRight size={14} /></button>
                          <button role="menuitem" onClick={() => setMenuSection("ingest")}><Database size={15} /> Ingest <ChevronRight size={14} /></button>
                        </>
                      )}
                      {(section === "create" || section === "search") && (
                        <>
                          {QUICK_NODE_TYPES.filter(({ label }) => menuMatches(`Create ${label}`)).map(({ dtype: nodeDtype, label, Icon }) => (
                            <button key={nodeDtype} role="menuitem" onClick={() => openQuickAdd(canvasMenu.position, nodeDtype)}><Icon size={15} /> Create {label.toLowerCase()}</button>
                          ))}
                          {menuMatches("Other document type") && <button role="menuitem" onClick={() => openQuickAdd(canvasMenu.position)}><MoreHorizontal size={15} /> Other document type…</button>}
                        </>
                      )}
                      {(section === "graph" || section === "search") && (
                        <>
                          {menuMatches("Fit graph") && <button role="menuitem" onClick={() => { fit(); setCanvasMenu(null); }}><Focus size={15} /> Fit graph</button>}
                          {menuMatches("Focus selection") && <button role="menuitem" disabled={!selectedIds.length} onClick={() => { focusSelection(); setCanvasMenu(null); }}><Focus size={15} /> Focus selection</button>}
                          {menuMatches("Clear filters") && <button role="menuitem" onClick={() => { clearFilters(); setCanvasMenu(null); }}><X size={15} /> Clear filters</button>}
                          {activeGraph?.documentIds !== null && menuMatches("Add from corpus") && <button role="menuitem" onClick={() => { setCanvasMenu(null); setShowMembershipAdd(true); }}><Database size={15} /> Add from corpus</button>}
                          {menuMatches("Create another graph") && <button role="menuitem" onClick={() => { setCanvasMenu(null); setShowGraphCreate(true); }}><FolderPlus size={15} /> Create another graph</button>}
                          {menuMatches("Rename graph") && <button role="menuitem" onClick={() => { setCanvasMenu(null); renameCurrentGraph(); }}><Pencil size={15} /> Rename graph</button>}
                          {menuMatches("Delete graph") && <button role="menuitem" className="danger" disabled={graphs.length < 2} onClick={() => { setCanvasMenu(null); deleteCurrentGraph(); }}><Trash2 size={15} /> Delete graph</button>}
                        </>
                      )}
                      {(section === "layout" || section === "search") && ["cose", "breadthfirst", "circle", "concentric", "grid"]
                        .filter((name) => menuMatches(`Layout ${name}`))
                        .map((name) => <button role="menuitem" key={name} onClick={() => { runLayout(name); setCanvasMenu(null); }}><Grid2X2 size={15} /> {name}</button>)}
                      {(section === "ingest" || section === "search") && (
                        <>
                          {menuMatches("Import documents") && <Link role="menuitem" to="/import"><ExternalLink size={15} /> Import documents</Link>}
                          {menuMatches("RabbitMQ queue listener") && <button role="menuitem" disabled={!settings?.rabbitWebSocketUrl} onClick={toggleQueueListener}><RadioTower size={15} /> {queueStatus.state === "active" ? "Stop" : "Start"} queue listener</button>}
                          {menuMatches("StarIntel connection settings") && <Link role="menuitem" to="/settings"><Server size={15} /> StarIntel connection settings</Link>}
                        </>
                      )}
                    </>
                  )}
                </>;
              })()}
            </div>
          )}
          {relationDraft && (
            <RelationAdd
              key={relationDraft.ids.join(":")}
              ids={relationDraft.ids}
              documents={scopedDocuments}
              position={relationDraft}
              onClose={() => setRelationDraft(null)}
            />
          )}
        </div>

        <aside className="graph-inspector">
          <section>
            <h2>Selection <span>{selectedIds.length}</span></h2>
            {!selectedIds.length && <p className="muted">Select nodes with click, Shift-click, or box selection. Double-click opens a document route.</p>}
            {selected && (
              <>
                <div className="selection-badges">
                  <span className={`dtype dtype-${selected.dtype}`}>{selected.dtype}</span>
                  <span className={`review-badge review-badge-${selected.verification?.verified === true ? "reviewed" : "unreviewed"}`}>
                    {selected.verification?.verified === true ? "reviewed" : "unreviewed"}
                  </span>
                </div>
                <h3>{documentLabel(selected)}</h3>
                <code>{selected._id}</code>
                <small className="inspector-dataset">Dataset: {selected.dataset || "unknown"}</small>
                {selected.summary && <p>{selected.summary}</p>}
                <div className="inspector-actions">
                  <Link className="button small" to={`/documents/${encodeURIComponent(selected._id)}`}><ExternalLink size={14} /> Open</Link>
                  <button className="button small" onClick={() => setQuickEditDocument(selected)}><Pencil size={14} /> Edit</button>
                </div>
              </>
            )}
            {selectedIds.length > 1 && <div className="selection-list">{selectedIds.map((id) => <code key={id}>{id}</code>)}</div>}
          </section>

          <section>
            <h2>Connection finder</h2>
            <select value={pathStart} onChange={(event) => setPathStart(event.target.value)}><option value="">From…</option>{nodeOptions.map((node) => <option key={node.data.id} value={node.data.id}>{node.data.label}</option>)}</select>
            <select value={pathEnd} onChange={(event) => setPathEnd(event.target.value)}><option value="">To…</option>{nodeOptions.map((node) => <option key={node.data.id} value={node.data.id}>{node.data.label}</option>)}</select>
            <button className="button small full" onClick={calculatePaths} disabled={!pathStart || !pathEnd}><Network size={14} /> Find routes</button>
            <div className="path-results">
              {paths.map((path, index) => (
                <button key={`${path.nodes.join(":")}:${index}`} className={activePath === index ? "path-result active" : "path-result"} onClick={() => applyPath(paths, index)}>
                  <strong>Route {index + 1}</strong><span>{path.edges.length} hops · cost {path.cost.toFixed(2)}</span><small>{path.nodes.map((id) => graph.nodes.find((node) => node.data.id === id)?.data.label || id).join(" → ")}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>Browser actors</h2>
            {!settings?.actorsEnabled && <p className="muted">Built-in actors are ready. Enable custom actor code in Settings when needed.</p>}
            {actorEntries.map(({ actor, builtin, availability }) => {
              const customDisabled = !builtin && !settings?.actorsEnabled;
              const reason = customDisabled ? "Custom actor execution is disabled." : availability.reason;
              const running = runningActorId === actor.id;
              return (
                <button
                  key={actor.id}
                  className="actor-button"
                  disabled={Boolean(runningActorId) || customDisabled || !availability.applicable}
                  title={reason || actor.description || actor.id}
                  onClick={() => executeActor(actor)}
                >
                  <Play size={14} />
                  <span>
                    <strong>{running ? "Running…" : actor.label}</strong>
                    <small>{reason || actor.description || actor.id}</small>
                  </span>
                </button>
              );
            })}
            {lastActorRun && (
              <div className="actor-result" role="status">
                <strong>{lastActorRun.produced} document(s) returned</strong>
                <span>{lastActorRun.message}</span>
              </div>
            )}
          </section>
        </aside>
      </div>

      {showGraphCreate && <GraphCreate onCreate={createNamedGraph} onClose={() => setShowGraphCreate(false)} />}
      {showMembershipAdd && (
        <GraphMembershipAdd
          documents={documents}
          existingIds={activeGraph?.documentIds || []}
          onAdd={addExistingDocuments}
          onClose={() => setShowMembershipAdd(false)}
        />
      )}
      {quickEditDocument && <NodeQuickEditor document={quickEditDocument} onClose={() => setQuickEditDocument(null)} />}
      {targetDocument && <TargetSubmit document={targetDocument} onClose={() => setTargetDocument(null)} />}
    </section>
  );
}
