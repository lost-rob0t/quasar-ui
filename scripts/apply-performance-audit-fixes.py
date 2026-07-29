#!/usr/bin/env python3
from pathlib import Path


def replace_once(text, before, after, label):
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(before, after, 1)


path = Path("src/components/GraphPage.jsx")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  applyGraphDetailClasses,
  rendererOptionsForGraph,''',
    '''  applyGraphDetailClasses,
  graphDetailLevel,
  rendererOptionsForGraph,''',
    "graph detail import"
)
text = replace_once(
    text,
    '''  graph,
  layout,
  viewport,
  workspaceId,''',
    '''  graph,
  layout,
  viewportRef,
  workspaceId,''',
    "viewport ref prop"
)
text = replace_once(
    text,
    '''      reconcileGraphElements(cy, graph, { retainedNodes: retainedNodes.current });''',
    '''      reconcileGraphElements(cy, graph, {
        retainedNodes: retainedNodes.current,
        applyIncomingPositions: graphChanged
      });''',
    "position reconciliation policy"
)
text = replace_once(
    text,
    '''    if (graphChanged && viewport?.pan && Number.isFinite(viewport.zoom)) {
      cy.viewport(viewport);
    }''',
    '''    const savedViewport = viewportRef?.current;
    if (graphChanged && savedViewport?.pan && Number.isFinite(savedViewport.zoom)) {
      cy.viewport(savedViewport);
    }''',
    "latest viewport restore"
)
text = replace_once(
    text,
    '''  }, [apiRef, graph, layout, viewport, workspaceId]);''',
    '''  }, [apiRef, graph, layout, viewportRef, workspaceId]);''',
    "viewport effect dependency"
)
text = replace_once(
    text,
    '''  const [runningActorId, setRunningActorId] = useState("");
  const [lastActorRun, setLastActorRun] = useState(null);''',
    '''  const [runningActorId, setRunningActorId] = useState("");
  const [lastActorRun, setLastActorRun] = useState(null);
  const [positionVersion, setPositionVersion] = useState(0);''',
    "position epoch state"
)
text = replace_once(
    text,
    '''  const positionsRef = useRef(workspace?.positions || {});
  if (positionsRef.current !== workspace?.positions && workspace?.positions) {
    positionsRef.current = workspace.positions;
  }''',
    '''  const positionsRef = useRef(workspace?.positions || {});
  const viewportRef = useRef(workspace?.viewport || null);
  const renderedWorkspaceRef = useRef(workspace);
  if (renderedWorkspaceRef.current !== workspace) {
    renderedWorkspaceRef.current = workspace;
    positionsRef.current = workspace?.positions || {};
    viewportRef.current = workspace?.viewport || null;
  }''',
    "live graph refs"
)
text = replace_once(
    text,
    '''  const graph = useMemo(() => buildGraph(graphDocuments, workspace?.positions || {}), [graphDocuments, workspace?.positions]);
  const visibleGraph = useMemo(() => filterGraph(graph, { query, dtype, dataset, predicate }), [graph, query, dtype, dataset, predicate]);''',
    '''  const graph = useMemo(
    () => buildGraph(graphDocuments, positionsRef.current),
    [activeGraph?.id, graphDocuments, positionVersion, workspace?.positions]
  );
  const visibleGraph = useMemo(() => filterGraph(graph, { query, dtype, dataset, predicate }), [graph, query, dtype, dataset, predicate]);
  const rendererTier = graphDetailLevel(visibleGraph.nodes.length, visibleGraph.edges.length);''',
    "live projection positions"
)
text = replace_once(
    text,
    '''    () => (id, position) => {
      positionsRef.current = { ...positionsRef.current, [id]: position };
      persistGraphPosition(id, position);
    },''',
    '''    () => (id, position) => {
      positionsRef.current = { ...positionsRef.current, [id]: position };
      persistGraphPosition(id, position);
      setPositionVersion((value) => value + 1);
    },''',
    "dragfree projection refresh"
)
text = replace_once(
    text,
    '''  const onViewport = useMemo(
    () => (viewport) => persistGraphViewport(viewport),
    [persistGraphViewport]
  );''',
    '''  const onViewport = useMemo(
    () => (viewport) => {
      viewportRef.current = viewport;
      persistGraphViewport(viewport);
    },
    [persistGraphViewport]
  );''',
    "live viewport ref"
)
text = replace_once(
    text,
    '''          <GraphCanvas
            graph={visibleGraph}''',
    '''          <GraphCanvas
            key={`renderer:${rendererTier}`}
            graph={visibleGraph}''',
    "renderer tier remount"
)
text = replace_once(
    text,
    '''            viewport={workspace?.viewport || null}''',
    '''            viewportRef={viewportRef}''',
    "latest viewport ref prop"
)
path.write_text(text, encoding="utf-8")

path = Path("scripts/bench-graph.mjs")
text = path.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''const WARMUP_RUNS = 2;
const MEASURED_RUNS = 5;''',
    '''const WARMUP_RUNS = Math.max(0, Number(process.env.GRAPH_BENCH_WARMUP_RUNS ?? 2));
const MEASURED_RUNS = Math.max(1, Number(process.env.GRAPH_BENCH_MEASURED_RUNS ?? 5));
if (!Number.isInteger(WARMUP_RUNS) || !Number.isInteger(MEASURED_RUNS)) {
  throw new TypeError("Graph benchmark run counts must be integers");
}''',
    "benchmark run configuration"
)
path.write_text(text, encoding="utf-8")

# Remove the one-shot files from the final branch commit.
Path("scripts/apply-performance-audit-fixes.py").unlink(missing_ok=True)
Path(".github/workflows/apply-performance-audit-fixes.yml").unlink(missing_ok=True)
