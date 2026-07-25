import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { ArrowLeft, ExternalLink, Focus, Link2, Network, Play, Plus, Search, TriangleAlert, X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { assertDocument, createDocument, createRelation, dtypes, documentLabel } from "starintel_doc";
import { buildGraph, filterGraph, findPaths, partitionDocumentsByReview } from "../lib/graph";
import { operation } from "../lib/operations";
import { useQuasar } from "../store";

const GRAPH_STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      shape: "data(shape)",
      label: "data(label)",
      color: "#e5eef9",
      "font-size": 11,
      "font-weight": 600,
      "text-wrap": "ellipsis",
      "text-max-width": 130,
      "text-valign": "bottom",
      "text-margin-y": 8,
      width: 38,
      height: 38,
      "border-width": 2,
      "border-color": "#07111f",
      "overlay-padding": 8
    }
  },
  { selector: "node[?unresolved]", style: { "border-style": "dashed", opacity: 0.72 } },
  { selector: "node:selected", style: { "border-color": "#f8fafc", "border-width": 4, "underlay-color": "#38bdf8", "underlay-opacity": 0.18, "underlay-padding": 10 } },
  { selector: "node.path", style: { "border-color": "#f59e0b", "border-width": 5 } },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#46617f",
      "target-arrow-color": "#46617f",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      color: "#8fa5bc",
      "font-size": 8,
      "text-background-color": "#07111f",
      "text-background-opacity": 0.85,
      "text-background-padding": 2,
      "text-rotation": "autorotate",
      "arrow-scale": 0.75
    }
  },
  { selector: "edge[directed = false]", style: { "target-arrow-shape": "none" } },
  { selector: "edge:selected", style: { width: 3, "line-color": "#38bdf8", "target-arrow-color": "#38bdf8" } },
  { selector: "edge.path", style: { width: 4, "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", "z-index": 20 } },
  { selector: ".labels-hidden", style: { label: "" } }
];

function GraphCanvas({ graph, layout, selectedIds, onSelection, onMove, onViewport, apiRef, labels }) {
  const containerRef = useRef(null);
  const lastTap = useRef({ id: null, at: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: GRAPH_STYLE,
      minZoom: 0.05,
      maxZoom: 6,
      wheelSensitivity: 0.18,
      selectionType: "additive",
      boxSelectionEnabled: true
    });
    apiRef.current = cy;

    let viewportTimer = null;
    const emitSelection = () => onSelection(cy.$("node:selected").map((node) => node.id()));
    cy.on("select unselect", "node", emitSelection);
    cy.on("tap", (event) => {
      if (event.target === cy) {
        cy.$("node:selected").unselect();
        onSelection([]);
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
    cy.on("dragfree", "node", (event) => onMove(event.target.id(), event.target.position()));
    cy.on("pan zoom", () => {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(() => onViewport({ pan: cy.pan(), zoom: cy.zoom() }), 140);
    });

    return () => {
      clearTimeout(viewportTimer);
      apiRef.current = null;
      cy.destroy();
    };
  }, [apiRef, navigate, onMove, onSelection, onViewport]);

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
    cy.nodes().unselect();
    selectedIds.forEach((id) => cy.getElementById(id).select());
    if (labels) cy.elements().removeClass("labels-hidden"); else cy.elements().addClass("labels-hidden");
  }, [apiRef, graph, labels, layout, selectedIds]);

  return <div className="graph-canvas" ref={containerRef} />;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal">
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></header>
        {children}
      </div>
    </div>
  );
}

function QuickAdd({ selectedDataset, onClose }) {
  const { execute, setNotice, persistWorkspace, workspace } = useQuasar();
  const [form, setForm] = useState({ dtype: "entity", dataset: selectedDataset || "default", id: "", title: "", data: "{}" });
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    try {
      const document = assertDocument(createDocument(form.dtype, {
        _id: form.id || undefined,
        dataset: form.dataset,
        title: form.title,
        data: JSON.parse(form.data || "{}")
      }));
      await execute(operation.save(document), `Graph add ${document._id}`);
      persistWorkspace({ positions: { ...(workspace?.positions || {}), [document._id]: { x: 0, y: 0 } }, selectedIds: [document._id] });
      onClose();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  return (
    <Modal title="Add graph document" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="field"><span>Dtype</span><select value={form.dtype} onChange={update("dtype")}>{dtypes.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label className="field"><span>Dataset</span><input required value={form.dataset} onChange={update("dataset")} /></label>
        <label className="field"><span>Document ID</span><input value={form.id} onChange={update("id")} placeholder="Generated when blank" /></label>
        <label className="field"><span>Title</span><input value={form.title} onChange={update("title")} autoFocus /></label>
        <label className="field"><span>Typed data JSON</span><textarea className="code-editor" value={form.data} onChange={update("data")} /></label>
        <p className="muted graph-form-note">New records remain unreviewed until verification metadata marks them reviewed.</p>
        <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">Create and select</button></div>
      </form>
    </Modal>
  );
}

function RelationAdd({ ids, documents, onClose }) {
  const { execute, setNotice } = useQuasar();
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
      onClose();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  return (
    <Modal title="Create relation document" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="relation-preview"><strong>{documentLabel(source) || ids[0]}</strong><span>→</span><strong>{documentLabel(target) || ids[1]}</strong></div>
        <label className="field"><span>Predicate</span><input value={predicate} onChange={(event) => setPredicate(event.target.value)} autoFocus required /></label>
        <label className="field"><span>Dataset</span><input value={dataset} onChange={(event) => setDataset(event.target.value)} required /></label>
        <label className="checkbox"><input type="checkbox" checked={directed} onChange={(event) => setDirected(event.target.checked)} /> Directed relation</label>
        <p className="muted graph-form-note">The new relation is unreviewed until verification metadata marks it reviewed.</p>
        <div className="form-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">Create relation</button></div>
      </form>
    </Modal>
  );
}

export default function GraphPage() {
  const [params] = useSearchParams();
  const {
    documents, workspace, selectedIds, selectedDocuments, select, persistWorkspace,
    actors, runActor, settings, setNotice
  } = useQuasar();
  const apiRef = useRef(null);
  const [query, setQuery] = useState("");
  const [dtype, setDtype] = useState("");
  const [dataset, setDataset] = useState("");
  const [predicate, setPredicate] = useState("");
  const [reviewStatus, setReviewStatus] = useState("reviewed");
  const [labels, setLabels] = useState(true);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showRelation, setShowRelation] = useState(false);
  const [pathStart, setPathStart] = useState("");
  const [pathEnd, setPathEnd] = useState("");
  const [paths, setPaths] = useState([]);
  const [activePath, setActivePath] = useState(-1);

  const reviewGroups = useMemo(() => partitionDocumentsByReview(documents), [documents]);
  const graphDocuments = reviewStatus === "all" ? documents : reviewGroups.reviewed;
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
  const nodeOptions = graph.nodes
    .filter((node) => !node.data.unresolved)
    .slice()
    .sort((left, right) => left.data.label.localeCompare(right.data.label));
  const selected = selectedDocuments.find((document) => graphDocumentIds.has(document._id));

  const onMove = useMemo(() => (id, position) => {
    persistWorkspace({ positions: { ...(workspace?.positions || {}), [id]: position } });
  }, [persistWorkspace, workspace?.positions]);
  const onViewport = useMemo(() => (viewport) => persistWorkspace({ viewport }), [persistWorkspace]);
  const onSelection = useMemo(() => (ids) => select(ids), [select]);

  useEffect(() => {
    const retained = selectedIds.filter((id) => graphDocumentIds.has(id));
    if (retained.length !== selectedIds.length) select(retained);
  }, [graphDocumentIds, select, selectedIds]);

  useEffect(() => {
    const node = params.get("node");
    const document = documents.find((item) => item._id === node);
    if (!node || !document) return;
    if (!graphDocumentIds.has(node) && reviewStatus === "reviewed") {
      setReviewStatus("all");
      return;
    }
    select([node]);
    setTimeout(() => {
      const element = apiRef.current?.getElementById(node);
      if (element?.length) apiRef.current.animate({ fit: { eles: element, padding: 160 }, duration: 350 });
    }, 100);
  }, [documents, graphDocumentIds, params, reviewStatus, select]);

  function fit() {
    apiRef.current?.animate({ fit: { eles: apiRef.current.elements(), padding: 60 }, duration: 280 });
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
    cy.animate({ fit: { eles: cy.$(".path"), padding: 120 }, duration: 300 });
  }

  function focusSelection() {
    const cy = apiRef.current;
    if (!cy || !selectedIds.length) return;
    const neighborhood = cy.$("node:selected").closedNeighborhood();
    cy.animate({ fit: { eles: neighborhood, padding: 100 }, duration: 300 });
  }

  function clearFilters() {
    setQuery("");
    setDtype("");
    setDataset("");
    setPredicate("");
  }

  return (
    <section className="graph-page">
      <Link className="back-link" to="/"><ArrowLeft size={14} /> Statistics dashboard</Link>
      <div className="page-heading graph-heading">
        <div><span className="eyebrow">Investigation graph</span><h1>Graph explorer</h1><p>Search, filter, and inspect the relationship network. Reviewed records are shown by default.</p></div>
        <div className="button-row">
          <button className="button" onClick={() => setShowRelation(true)} disabled={selectedIds.length !== 2}><Link2 size={16} /> Connect selected</button>
          <button className="button primary" onClick={() => setShowQuickAdd(true)}><Plus size={16} /> Add graph document</button>
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
        <span className="graph-count">{visibleGraph.nodes.length} nodes · {visibleGraph.edges.length} edges</span>
      </div>

      {reviewStatus === "all" && reviewGroups.unreviewed.length > 0 && (
        <div className="graph-review-warning">
          <TriangleAlert size={17} />
          <span>Unreviewed data is enabled. {reviewGroups.unreviewed.length.toLocaleString()} unreviewed records are displayed alongside reviewed records.</span>
        </div>
      )}

      <div className="graph-workbench">
        <div className="graph-stage">
          <GraphCanvas
            graph={visibleGraph}
            layout={workspace?.layout || "cose"}
            selectedIds={selectedIds}
            onSelection={onSelection}
            onMove={onMove}
            onViewport={onViewport}
            apiRef={apiRef}
            labels={labels}
          />
          {!visibleGraph.nodes.length && (
            <div className="graph-empty-state">
              <Network size={38} />
              <h2>No graph nodes match</h2>
              <p>{graph.nodes.length ? "Change or clear the active filters." : "No reviewed graph records are available."}</p>
              {graph.nodes.length ? <button className="button small" onClick={clearFilters}>Clear filters</button> : <Link className="button small" to="/import">Import documents</Link>}
            </div>
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
                  <Link className="button small" to={`/documents/${encodeURIComponent(selected._id)}/edit`}>Edit</Link>
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
            {!settings?.actorsEnabled && <p className="muted">Enable browser actors in Settings.</p>}
            {settings?.actorsEnabled && actors.map((actor) => (
              <button key={actor.id} className="actor-button" disabled={!selectedDocuments.length} onClick={() => runActor(actor).catch((error) => setNotice({ kind: "error", message: error.message }))}>
                <Play size={14} /><span><strong>{actor.label}</strong><small>{actor.id}</small></span>
              </button>
            ))}
          </section>
        </aside>
      </div>

      {showQuickAdd && <QuickAdd selectedDataset={selected?.dataset} onClose={() => setShowQuickAdd(false)} />}
      {showRelation && <RelationAdd ids={selectedIds} documents={documents} onClose={() => setShowRelation(false)} />}
    </section>
  );
}
