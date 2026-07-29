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
    '''      reconcileGraphElements(cy, graph, { retainedNodes: retainedNodes.current });''',
    '''      reconcileGraphElements(cy, graph, {
        retainedNodes: retainedNodes.current,
        applyIncomingPositions: graphChanged
      });''',
    "position reconciliation policy"
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
    [activeGraph?.id, graphDocuments, workspace?.positions]
  );
  const visibleGraph = useMemo(() => filterGraph(graph, { query, dtype, dataset, predicate }), [graph, query, dtype, dataset, predicate]);
  const rendererTier = graphDetailLevel(visibleGraph.nodes.length, visibleGraph.edges.length);''',
    "live projection positions"
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
    '''            viewport={viewportRef.current}''',
    "latest viewport prop"
)
path.write_text(text, encoding="utf-8")

# Remove the one-shot files from the final branch commit.
Path("scripts/apply-performance-audit-fixes.py").unlink(missing_ok=True)
Path(".github/workflows/apply-performance-audit-fixes.yml").unlink(missing_ok=True)
