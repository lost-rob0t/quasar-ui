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
text = replace_once(
    text,
    '''const profile = process.env.GRAPH_BENCH_PROFILE || "full";''',
    '''const profile = process.env.GRAPH_BENCH_PROFILE || "full";
const baselineOnly = process.env.GRAPH_BENCH_BASELINE_ONLY === "1";''',
    "baseline-only mode"
)
text = replace_once(
    text,
    '''    const sizes = profile === "quick" ? ["small", "medium"] : ["small", "medium", "large", "very-large"];''',
    '''    if (baselineOnly) {
      const finalResults = [];
      for (const size of ["small", "medium", "large", "very-large", "stress"]) {
        const isLarge = ["large", "very-large", "stress"].includes(size);
        console.log(`benchmark baseline-only final ${size}/mixed`);
        finalResults.push(await runMeasured(page, {
          size,
          shape: "mixed",
          strategy: "reconcile",
          detailMode: "adaptive",
          layoutMode: "size-aware",
          interactionIterations: size === "stress" ? 2 : isLarge ? 3 : 8,
          viewportFrames: isLarge ? 60 : 90,
          includeIncremental: size !== "stress",
          graphSwitchIterations: size === "stress" ? 2 : isLarge ? 5 : 10
        }, null, context));
      }
      const browserVersion = await browser.version();
      const commit = process.env.GITHUB_SHA || process.env.GRAPH_BENCH_COMMIT || "working-tree";
      const baseline = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        environment: {
          commit,
          browserVersion,
          platform: `${os.platform()} ${os.release()} ${os.arch()}`,
          cpu: os.cpus()[0]?.model || "unknown",
          logicalCpuCount: os.cpus().length,
          totalMemoryBytes: os.totalmem(),
          viewport: VIEWPORT,
          deviceScaleFactor: DEVICE_SCALE_FACTOR
        },
        methodology: {
          warmupRuns: WARMUP_RUNS,
          measuredRuns: MEASURED_RUNS,
          reported: "median and p95",
          fixtureSeed: 0x5eed1234,
          profile: "baseline-only"
        },
        iterations: { final: finalResults }
      };
      await fs.mkdir("benchmarks/baseline", { recursive: true });
      await fs.writeFile(
        "benchmarks/baseline/graph-baseline.json",
        `${JSON.stringify(baseline, null, 2)}\n`
      );
      console.log("benchmarks/baseline/graph-baseline.json");
      return;
    }

    const sizes = profile === "quick" ? ["small", "medium"] : ["small", "medium", "large", "very-large"];''',
    "baseline-only execution"
)
path.write_text(text, encoding="utf-8")

# Remove the one-shot files from the final branch commit.
Path("scripts/apply-performance-audit-fixes.py").unlink(missing_ok=True)
Path(".github/workflows/apply-performance-audit-fixes.yml").unlink(missing_ok=True)
