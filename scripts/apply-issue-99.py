from pathlib import Path


def replace(path, old, new):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def append_before(path, marker, content):
    file = Path(path)
    text = file.read_text()
    if marker not in text:
        raise SystemExit(f"missing append anchor in {path}: {marker!r}")
    file.write_text(text.replace(marker, content + marker, 1))


Path("src/lib/document-delete.js").write_text('''export function connectedDocumentIds(documents, ids) {
  const selected = new Set((ids || []).map(String).filter(Boolean));
  let changed = true;

  while (changed) {
    changed = false;
    for (const document of documents || []) {
      if (document?.dtype !== "relation" || selected.has(document._id)) continue;
      const subject = document.data?.subject;
      const object = document.data?.object;
      if (!selected.has(subject) && !selected.has(object)) continue;
      selected.add(document._id);
      changed = true;
    }
  }

  return [...selected];
}
''')

Path("src/lib/document-delete.test.js").write_text('''import { describe, expect, it } from "vitest";
import { connectedDocumentIds } from "./document-delete";

describe("connected document deletion", () => {
  const documents = [
    { _id: "person:a", dtype: "person", data: {} },
    { _id: "person:b", dtype: "person", data: {} },
    {
      _id: "relation:a-b",
      dtype: "relation",
      data: { subject: "person:a", object: "person:b", predicate: "knows" }
    },
    {
      _id: "relation:claim-edge",
      dtype: "relation",
      data: { subject: "relation:a-b", object: "person:b", predicate: "supports" }
    }
  ];

  it("includes relations attached to a deleted document", () => {
    expect(new Set(connectedDocumentIds(documents, ["person:a"]))).toEqual(
      new Set(["person:a", "relation:a-b", "relation:claim-edge"])
    );
  });

  it("keeps unrelated documents", () => {
    expect(connectedDocumentIds(documents, ["person:b"])).not.toContain("person:a");
  });

  it("deduplicates requested IDs", () => {
    expect(connectedDocumentIds(documents, ["person:a", "person:a"])[0]).toBe("person:a");
  });
});
''')

Path("src/graph/graph-gestures.js").write_text('''const GESTURE_SCRATCH = "quasar-graph-gestures";
const DESKTOP_DROP_PADDING = 14;
const TOUCH_DROP_PADDING = 30;
const DRAG_THRESHOLD_SQUARED = 36;

function distanceSquared(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

export function boxesOverlap(left, right, padding = 0) {
  return !(
    left.x2 + padding < right.x1
    || left.x1 - padding > right.x2
    || left.y2 + padding < right.y1
    || left.y1 - padding > right.y2
  );
}

export function relationDropPadding(pointerType = "") {
  return pointerType === "touch" || pointerType === "pen"
    ? TOUCH_DROP_PADDING
    : DESKTOP_DROP_PADDING;
}

export function findRelationDropTarget(cy, sourceNode, padding = DESKTOP_DROP_PADDING) {
  if (!cy || !sourceNode?.length) return null;
  const sourceBox = sourceNode.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
  const sourcePosition = sourceNode.renderedPosition();
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  cy.nodes().forEach((candidate) => {
    if (
      candidate.id() === sourceNode.id()
      || candidate.data("unresolved")
      || !candidate.visible()
    ) return;

    const targetBox = candidate.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
    if (!boxesOverlap(sourceBox, targetBox, padding)) return;
    const distance = distanceSquared(sourcePosition, candidate.renderedPosition());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });

  return best;
}

function emitContextTap(event) {
  const target = event.target;
  if (!target?.emit) return;
  event.originalEvent?.preventDefault?.();
  target.emit({
    type: "cxttap",
    target,
    position: event.position,
    renderedPosition: event.renderedPosition,
    originalEvent: event.originalEvent,
    quasarGesture: "hold"
  });
}

function emitRelationDraft(cy, sourceNode, targetNode) {
  const sourceRendered = sourceNode.renderedPosition();
  const targetRendered = targetNode.renderedPosition();
  const renderedPosition = {
    x: (sourceRendered.x + targetRendered.x) / 2,
    y: (sourceRendered.y + targetRendered.y) / 2
  };
  const position = {
    x: (sourceNode.position().x + targetNode.position().x) / 2,
    y: (sourceNode.position().y + targetNode.position().y) / 2
  };
  const preview = cy.add({
    group: "edges",
    data: {
      id: `relation-preview-gesture-${sourceNode.id()}-${targetNode.id()}-${Date.now()}`,
      source: sourceNode.id(),
      target: targetNode.id()
    }
  });

  cy.emit({ type: "ehcomplete", target: cy, position, renderedPosition }, [
    sourceNode,
    targetNode,
    preview
  ]);
}

export function installGraphGestures(cy) {
  if (!cy || cy.scratch(GESTURE_SCRATCH)) return cy;

  const state = {
    armedNodeId: null,
    drag: null,
    panningEnabled: true
  };
  cy.scratch(GESTURE_SCRATCH, state);

  cy.on("tap", (event) => {
    if (event.target === cy) state.armedNodeId = null;
  });
  cy.on("tap", "node", (event) => {
    if (!event.target.data("unresolved")) state.armedNodeId = event.target.id();
  });
  cy.on("unselect", "node", (event) => {
    if (state.armedNodeId === event.target.id()) state.armedNodeId = null;
  });
  cy.on("grab", "node", (event) => {
    const node = event.target;
    if (node.data("unresolved")) return;
    const pointerType = event.originalEvent?.pointerType || "";
    state.panningEnabled = cy.panningEnabled();
    cy.panningEnabled(false);
    state.drag = {
      id: node.id(),
      position: { ...node.position() },
      renderedPosition: { ...node.renderedPosition() },
      relationArmed: state.armedNodeId === node.id() && node.selected(),
      pointerType,
      moved: false
    };
    if (!node.selected()) {
      cy.$("node:selected").unselect();
      node.select();
    }
  });
  cy.on("drag", "node", (event) => {
    if (!state.drag || state.drag.id !== event.target.id()) return;
    state.drag.moved = distanceSquared(
      state.drag.renderedPosition,
      event.target.renderedPosition()
    ) >= DRAG_THRESHOLD_SQUARED;
  });
  cy.on("dragfree", "node", (event) => {
    const sourceNode = event.target;
    const drag = state.drag;
    state.drag = null;
    cy.panningEnabled(state.panningEnabled);
    if (!drag || drag.id !== sourceNode.id()) return;

    state.armedNodeId = sourceNode.id();
    if (!drag.moved || !drag.relationArmed) return;

    const targetNode = findRelationDropTarget(
      cy,
      sourceNode,
      relationDropPadding(drag.pointerType)
    );
    if (!targetNode) return;

    sourceNode.position(drag.position);
    state.armedNodeId = null;
    emitRelationDraft(cy, sourceNode, targetNode);
  });
  cy.on("free", "node", () => {
    if (!state.drag) cy.panningEnabled(state.panningEnabled);
  });
  cy.on("taphold", (event) => {
    if (state.drag?.moved) return;
    emitContextTap(event);
  });

  return cy;
}
''')

replace(
    "src/graph/graph-gestures.test.js",
    'import { boxesOverlap } from "./graph-gestures";',
    'import { boxesOverlap, relationDropPadding } from "./graph-gestures";'
)
append_before(
    "src/graph/graph-gestures.test.js",
    "});\n",
    '''  it("uses a larger relation target for touch dragging", () => {
    expect(relationDropPadding("touch")).toBeGreaterThan(relationDropPadding("mouse"));
    expect(relationDropPadding("pen")).toBe(relationDropPadding("touch"));
  });

'''
)

replace(
    "src/lib/graph-workspaces.js",
    '''export function renameActiveGraph(workspace, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new TypeError("Graph name is required");
  return updateActiveGraph(workspace, { name: cleanName });
}

export function deleteActiveGraph(workspace) {''',
    '''export function renameActiveGraph(workspace, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new TypeError("Graph name is required");
  return updateActiveGraph(workspace, { name: cleanName });
}

export function clearActiveGraph(workspace, { emptyGraphName = "Empty graph" } = {}) {
  const normalized = normalizeGraphWorkspace(workspace);
  const active = getActiveGraph(normalized);
  if (active.documentIds === null) return createGraph(normalized, emptyGraphName);
  return updateActiveGraph(normalized, {
    documentIds: [],
    positions: {},
    viewport: null,
    selectedIds: [],
    groups: {}
  });
}

export function deleteActiveGraph(workspace) {'''
)
replace(
    "src/lib/graph-workspaces.test.js",
    '''  createGraph,
  deleteActiveGraph,''',
    '''  clearActiveGraph,
  createGraph,
  deleteActiveGraph,'''
)
append_before(
    "src/lib/graph-workspaces.test.js",
    "});\n",
    '''  it("clears a custom graph without deleting the graph", () => {
    let workspace = createGraph({}, "Case Alpha", { id: "case-alpha" });
    workspace = addDocumentsToActiveGraph(workspace, ["a", "b"], {
      positions: { a: { x: 1, y: 2 } },
      selectedIds: ["a"]
    });
    workspace = clearActiveGraph(workspace);

    expect(getActiveGraph(workspace)).toMatchObject({
      id: "case-alpha",
      documentIds: [],
      positions: {},
      viewport: null,
      selectedIds: []
    });
  });

  it("clears the corpus view by opening a new empty graph", () => {
    const workspace = clearActiveGraph({}, { emptyGraphName: "Fresh graph" });
    expect(getActiveGraph(workspace)).toMatchObject({
      name: "Fresh graph",
      documentIds: []
    });
    expect(workspace.graphs.some((graph) => graph.id === "all-documents")).toBe(true);
  });

'''
)

replace(
    "src/store.jsx",
    '''  addDocumentsToActiveGraph as addDocumentsToGraphWorkspace,
  createGraph as createGraphWorkspace,
  deleteActiveGraph as deleteGraphWorkspace,''',
    '''  addDocumentsToActiveGraph as addDocumentsToGraphWorkspace,
  clearActiveGraph as clearGraphWorkspace,
  createGraph as createGraphWorkspace,
  deleteActiveGraph as deleteGraphWorkspace,'''
)
replace(
    "src/store.jsx",
    '''  const deleteGraph = useCallback(() => {
    return commitWorkspace(deleteGraphWorkspace(workspaceRef.current || {}));
  }, [commitWorkspace]);

  const select = useCallback((ids) => {''',
    '''  const deleteGraph = useCallback(() => {
    return commitWorkspace(deleteGraphWorkspace(workspaceRef.current || {}));
  }, [commitWorkspace]);

  const clearGraph = useCallback(() => {
    return commitWorkspace(clearGraphWorkspace(workspaceRef.current || {}));
  }, [commitWorkspace]);

  const select = useCallback((ids) => {'''
)
replace(
    "src/store.jsx",
    '''    renameGraph,
    deleteGraph,
    select,''',
    '''    renameGraph,
    deleteGraph,
    clearGraph,
    select,'''
)
replace(
    "src/store.jsx",
    '''    createGraph, switchGraph, renameGraph, deleteGraph,
    activeGraph, select,''',
    '''    createGraph, switchGraph, renameGraph, deleteGraph, clearGraph,
    activeGraph, select,'''
)

replace(
    "src/components/Documents.jsx",
    'import { documentsToJsonl, downloadText } from "../lib/importer";',
    'import { connectedDocumentIds } from "../lib/document-delete";\nimport { documentsToJsonl, downloadText } from "../lib/importer";'
)
replace(
    "src/components/Documents.jsx",
    '''export function DocumentsPage() {
  const { documents } = useQuasar();''',
    '''export function DocumentsPage() {
  const { documents, execute, setNotice } = useQuasar();'''
)
replace(
    "src/components/Documents.jsx",
    '''  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  return (''',
    '''  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  async function removeDocument(document) {
    const deleteIds = connectedDocumentIds(documents, [document._id]);
    if (!window.confirm(`Delete ${document._id} and ${deleteIds.length - 1} connected relation document(s)?`)) return;
    try {
      await execute(
        operation.batch(deleteIds.map((item) => operation.remove(item)), "Delete corpus documents"),
        `Delete ${deleteIds.length} corpus document(s)`
      );
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  return ('''
)
replace(
    "src/components/Documents.jsx",
    '''          <thead><tr><th>Document</th><th>Type</th><th>Dataset</th><th>Updated</th><th>Evidence</th></tr></thead>''',
    '''          <thead><tr><th>Document</th><th>Type</th><th>Dataset</th><th>Updated</th><th>Evidence</th><th>Actions</th></tr></thead>'''
)
replace(
    "src/components/Documents.jsx",
    '''                <td>{document.evidence?.length || 0} evidence · {document.sources?.length || 0} sources</td>
              </tr>''',
    '''                <td>{document.evidence?.length || 0} evidence · {document.sources?.length || 0} sources</td>
                <td>
                  <button className="icon-button danger" type="button" aria-label={`Delete ${documentLabel(document)}`} title="Delete document" onClick={() => removeDocument(document)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>'''
)
replace(
    "src/components/Documents.jsx",
    '''  async function remove() {
    if (!window.confirm(`Delete ${document._id}?`)) return;
    try {
      await execute(operation.remove(document._id), `Delete ${document._id}`);
      navigate("/documents");''',
    '''  async function remove() {
    const deleteIds = connectedDocumentIds(documents, [document._id]);
    if (!window.confirm(`Delete ${document._id} and ${deleteIds.length - 1} connected relation document(s)?`)) return;
    try {
      await execute(
        operation.batch(deleteIds.map((item) => operation.remove(item)), "Delete corpus documents"),
        `Delete ${deleteIds.length} corpus document(s)`
      );
      navigate("/documents");'''
)

replace(
    "src/components/GraphPage.jsx",
    'import { actorApplicability, isBuiltinActor } from "../lib/actors";',
    'import { actorApplicability, isBuiltinActor } from "../lib/actors";\nimport { connectedDocumentIds } from "../lib/document-delete";'
)
replace(
    "src/components/GraphPage.jsx",
    '''    createGraph, switchGraph, renameGraph, deleteGraph, execute,
    queueStatus, startQueue, stopQueue''',
    '''    createGraph, switchGraph, renameGraph, deleteGraph, clearGraph, execute,
    queueStatus, startQueue, stopQueue'''
)
replace(
    "src/components/GraphPage.jsx",
    '''  function removeSelectionFromGraph() {
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
  }''',
    '''  function removeSelectionFromGraph() {
    if (!selectedIds.length || activeGraph?.documentIds === null) return;
    removeDocumentsFromActiveGraph(connectedDocumentIds(scopedDocuments, selectedIds));
  }

  function removeNodeFromGraph(id) {
    if (activeGraph?.documentIds === null) return;
    select([id]);
    removeDocumentsFromActiveGraph(connectedDocumentIds(scopedDocuments, [id]));
    setCanvasMenu(null);
  }'''
)
replace(
    "src/components/GraphPage.jsx",
    '''  async function deleteCorpusDocuments(ids) {
    const selectedSet = new Set(ids);
    const relationIds = documents
      .filter((document) => document.dtype === "relation")
      .filter((document) => selectedSet.has(document.data?.subject) || selectedSet.has(document.data?.object))
      .map((document) => document._id);
    const deleteIds = [...new Set([...ids, ...relationIds])];''',
    '''  async function deleteCorpusDocuments(ids) {
    const deleteIds = connectedDocumentIds(documents, ids);'''
)
replace(
    "src/components/GraphPage.jsx",
    '''      if (activeGraph?.documentIds !== null) removeDocumentsFromActiveGraph(deleteIds);
      setCanvasMenu(null);''',
    '''      if (activeGraph?.documentIds !== null) removeDocumentsFromActiveGraph(deleteIds);
      select([]);
      setCanvasMenu(null);'''
)
replace(
    "src/components/GraphPage.jsx",
    '''  function deleteCurrentGraph() {
    if (!window.confirm(`Delete graph "${activeGraph?.name || ""}"? Corpus documents will not be deleted.`)) return;
    try {
      deleteGraph();
      setReviewStatus("all");
      clearFilters();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function addExistingDocuments(ids) {''',
    '''  function deleteCurrentGraph() {
    if (!window.confirm(`Delete graph "${activeGraph?.name || ""}"? Corpus documents will not be deleted.`)) return;
    try {
      deleteGraph();
      setReviewStatus("all");
      clearFilters();
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function clearCurrentGraph() {
    const corpusView = activeGraph?.documentIds === null;
    const message = corpusView
      ? "Clear the All documents view by creating a new empty graph? Corpus documents will not be deleted."
      : `Clear graph "${activeGraph?.name || ""}"? Corpus documents will not be deleted.`;
    if (!window.confirm(message)) return;
    try {
      clearGraph();
      setReviewStatus("all");
      clearFilters();
      select([]);
      setCanvasMenu(null);
      setNotice({
        kind: "success",
        message: corpusView ? "Created a new empty graph." : "Graph cleared."
      });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function addExistingDocuments(ids) {'''
)
replace(
    "src/components/GraphPage.jsx",
    '''            {activeGraph?.documentIds !== null && <button className="button danger" onClick={removeSelectionFromGraph} disabled={!selectedIds.length}>Remove from graph</button>}
            <button className="button" onClick={openSelectedRelation} disabled={selectedIds.length !== 2}><Link2 size={16} /> Connect selected</button>''',
    '''            {activeGraph?.documentIds !== null && <button className="button danger" onClick={removeSelectionFromGraph} disabled={!selectedIds.length}>Remove from graph</button>}
            <button className="button danger" onClick={() => deleteCorpusDocuments(selectedIds)} disabled={!selectedIds.length}>Delete selected documents</button>
            <button className="button" onClick={clearCurrentGraph}>Clear graph</button>
            <button className="button" onClick={openSelectedRelation} disabled={selectedIds.length !== 2}><Link2 size={16} /> Connect selected</button>'''
)
replace(
    "src/components/GraphPage.jsx",
    '''                          {menuMatches("Clear filters") && <button role="menuitem" onClick={() => { clearFilters(); setCanvasMenu(null); }}><X size={15} /> Clear filters</button>}
                          {activeGraph?.documentIds !== null && menuMatches("Add from corpus")''',
    '''                          {menuMatches("Clear filters") && <button role="menuitem" onClick={() => { clearFilters(); setCanvasMenu(null); }}><X size={15} /> Clear filters</button>}
                          {menuMatches("Clear graph") && <button role="menuitem" className="danger" onClick={clearCurrentGraph}><Trash2 size={15} /> Clear graph</button>}
                          {selectedIds.length > 0 && menuMatches("Delete selected documents") && <button role="menuitem" className="danger" onClick={() => deleteCorpusDocuments(selectedIds)}><Trash2 size={15} /> Delete selected documents</button>}
                          {activeGraph?.documentIds !== null && menuMatches("Add from corpus")'''
)

replace(
    "src/components/OperatorUiEnhancer.jsx",
    '''  const [removeDisabled, setRemoveDisabled] = useState(true);''',
    '''  const [removeDisabled, setRemoveDisabled] = useState(true);
  const [deleteDisabled, setDeleteDisabled] = useState(true);'''
)
replace(
    "src/components/OperatorUiEnhancer.jsx",
    '''      setRemoveDisabled(Boolean(headingButton("Remove from graph")?.disabled));''',
    '''      setRemoveDisabled(Boolean(headingButton("Remove from graph")?.disabled));
      setDeleteDisabled(Boolean(headingButton("Delete selected documents")?.disabled));'''
)
replace(
    "src/components/OperatorUiEnhancer.jsx",
    '''        <button
          type="button"
          className="graph-canvas-action danger"
          aria-label="Remove from graph"
          title="Remove from graph"
          disabled={removeDisabled}
          onClick={() => headingButton("Remove from graph")?.click()}
        >
          <Trash2 size={18} aria-hidden="true" />
          <span>Remove</span>
        </button>
      </div>''',
    '''        <button
          type="button"
          className="graph-canvas-action"
          aria-label="Clear graph"
          title="Clear graph"
          onClick={() => headingButton("Clear graph")?.click()}
        >
          <X size={18} aria-hidden="true" />
          <span>Clear</span>
        </button>
        <button
          type="button"
          className="graph-canvas-action danger"
          aria-label="Remove from graph"
          title="Remove from graph"
          disabled={removeDisabled}
          onClick={() => headingButton("Remove from graph")?.click()}
        >
          <Trash2 size={18} aria-hidden="true" />
          <span>Remove</span>
        </button>
        <button
          type="button"
          className="graph-canvas-action danger"
          aria-label="Delete selected documents"
          title="Delete selected documents"
          disabled={deleteDisabled}
          onClick={() => headingButton("Delete selected documents")?.click()}
        >
          <Trash2 size={18} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>'''
)

replace(
    "src/components/MobileGraphToolTray.jsx",
    '''  const [removeDisabled, setRemoveDisabled] = useState(true);''',
    '''  const [removeDisabled, setRemoveDisabled] = useState(true);
  const [deleteDisabled, setDeleteDisabled] = useState(true);'''
)
replace(
    "src/components/MobileGraphToolTray.jsx",
    '''        setRemoveDisabled(Boolean(hiddenGraphAction("Remove from graph")?.disabled));''',
    '''        setRemoveDisabled(Boolean(hiddenGraphAction("Remove from graph")?.disabled));
        setDeleteDisabled(Boolean(hiddenGraphAction("Delete selected documents")?.disabled));'''
)
replace(
    "src/components/MobileGraphToolTray.jsx",
    '''            <ToolButton
              label="Remove"
              Icon={Trash2}
              disabled={removeDisabled}
              onClick={() => run(() => hiddenGraphAction("Remove from graph")?.click())}
            />''',
    '''            <ToolButton
              label="Clear"
              Icon={Trash2}
              onClick={() => run(() => hiddenGraphAction("Clear graph")?.click())}
            />
            <ToolButton
              label="Remove"
              Icon={Trash2}
              disabled={removeDisabled}
              onClick={() => run(() => hiddenGraphAction("Remove from graph")?.click())}
            />
            <ToolButton
              label="Delete"
              Icon={Trash2}
              disabled={deleteDisabled}
              onClick={() => run(() => hiddenGraphAction("Delete selected documents")?.click())}
            />'''
)

replace(
    "e2e/application.spec.ts",
    '''    await expect(tray.getByRole("menuitem", { name: "Remove" })).toBeVisible();''',
    '''    await expect(tray.getByRole("menuitem", { name: "Clear" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Remove" })).toBeVisible();
    await expect(tray.getByRole("menuitem", { name: "Delete" })).toBeVisible();'''
)

Path("e2e/graph-destructive-ops.spec.ts").write_text('''import { expect, test } from "@playwright/test";

async function createPerson(page, name) {
  await page.goto("/documents/new?dtype=person&returnTo=graph");
  await page.getByLabel("fname").fill(name);
  await page.getByLabel("lname").fill("Test");
  await page.getByLabel("full_name").fill(`${name} Test`);
  await page.getByRole("button", { name: "Save document" }).click();
  await expect(page).toHaveURL(/\/graph\?node=/);
}

test("deletes a selected graph document from the corpus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createPerson(page, "Delete");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete selected documents" }).click();
  await expect(page.locator(".graph-count")).toContainText("0 nodes");
});

test("clears the all-documents view into a new empty graph on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPerson(page, "Clear");
  await page.getByRole("button", { name: "Graph tools" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menu", { name: "Graph tools" }).getByRole("menuitem", { name: "Clear" }).click();
  await expect(page.getByLabel("Active graph", { exact: true })).not.toHaveValue("all-documents");
  await expect(page.locator(".graph-count")).toContainText("0 nodes");
});
''')
