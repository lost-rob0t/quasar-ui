import { createGraphAdapter } from "../graph/GraphAdapter";
import {
  applyGraphDetailClasses,
  rendererOptionsForGraph,
  sizeAwareLayoutOptions
} from "../graph/graph-performance";
import { reconcileGraphElements } from "../graph/graph-reconciler";
import { buildGraph, filterGraph } from "../lib/graph";
import { GRAPH_STYLE } from "../lib/graph-style";
import { generateGraphPerformanceFixture } from "../testing/graph-performance-fixtures";

const root = document.getElementById("graph-benchmark-root");
const status = document.getElementById("graph-benchmark-status");
const retainedNodes = new Map();
let cy = null;

function now() {
  return performance.now();
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summary(values) {
  return {
    samples: values.length,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null
  };
}

function frame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function stableFrame() {
  await frame();
  await frame();
}

function destroyGraph() {
  cy?.destroy();
  cy = null;
  root.replaceChildren();
  retainedNodes.clear();
}

function replacementReconcile(instance, graph) {
  const previous = new Map(instance.nodes().map((node) => [node.id(), node.position()]));
  instance.batch(() => {
    instance.elements().remove();
    instance.add(graph.elements);
    instance.nodes().forEach((node) => {
      const position = graph.nodes.find((item) => item.data.id === node.id())?.position
        || previous.get(node.id());
      if (position) node.position(position);
    });
  });
}

function applyGraph(instance, graph, strategy) {
  if (strategy === "replace") replacementReconcile(instance, graph);
  else reconcileGraphElements(instance, graph, { retainedNodes });
}

function createContainer() {
  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  root.replaceChildren(container);
  return container;
}

function createInstance(graph, { detailMode }) {
  const options = detailMode === "adaptive"
    ? rendererOptionsForGraph(graph.nodes.length, graph.edges.length)
    : { pixelRatio: 1, hideEdgesOnViewport: false, textureOnViewport: false };
  return createGraphAdapter({
    container: createContainer(),
    elements: [],
    style: GRAPH_STYLE,
    minZoom: 0.05,
    maxZoom: 6,
    selectionType: "additive",
    boxSelectionEnabled: true,
    motionBlur: false,
    ...options
  });
}

function observeLongTasks() {
  const entries = [];
  if (!("PerformanceObserver" in window)) return { entries, disconnect() {} };
  let observer;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) entries.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    return { entries, disconnect() {} };
  }
  return { entries, disconnect: () => observer.disconnect() };
}

async function timeOperation(operation, { stable = false } = {}) {
  const started = now();
  await operation();
  if (stable) await stableFrame();
  return now() - started;
}

function extraNodeDocument(index) {
  return {
    _id: `starintel:entity:incremental-${index}`,
    dataset: "benchmark-incremental",
    dtype: index % 2 ? "person" : "org",
    schema_version: "0.9.0",
    version: 1,
    date_added: "2026-07-28T00:00:00.000Z",
    date_updated: "2026-07-28T00:00:00.000Z",
    title: `Incremental document ${index}`,
    verification: { verified: true, status: "verified" },
    sources: [],
    evidence: [],
    data: { name: `Incremental document ${index}` }
  };
}

function graphWithElementUpdates(graph, count) {
  const nodes = graph.nodes.map((node, index) => index < count
    ? { ...node, data: { ...node.data, label: `${node.data.label} updated` } }
    : node);
  return { nodes, edges: graph.edges, elements: [...nodes, ...graph.edges] };
}

function graphWithElementAdditions(graph, count) {
  const addedNodes = [];
  const addedEdges = [];
  for (let index = 0; index < count; index += 1) {
    const id = `element-add-${index}`;
    addedNodes.push({
      group: "nodes",
      data: {
        id,
        label: `Added ${index}`,
        dtype: "entity",
        dataset: "benchmark",
        color: "#60a5fa",
        shape: "ellipse",
        unresolved: false
      }
    });
    if (graph.nodes.length) {
      addedEdges.push({
        group: "edges",
        data: {
          id: `element-add-edge-${index}`,
          source: graph.nodes[index % graph.nodes.length].data.id,
          target: id,
          label: "benchmark-add",
          predicate: "benchmark-add",
          directed: true
        }
      });
    }
  }
  const nodes = [...graph.nodes, ...addedNodes];
  const edges = [...graph.edges, ...addedEdges];
  return { nodes, edges, elements: [...nodes, ...edges] };
}

function graphWithElementRemovals(graph, count) {
  const removedIds = new Set(graph.nodes.slice(-count).map((node) => node.data.id));
  const nodes = graph.nodes.filter((node) => !removedIds.has(node.data.id));
  const edges = graph.edges.filter((edge) => (
    !removedIds.has(edge.data.source) && !removedIds.has(edge.data.target)
  ));
  return { nodes, edges, elements: [...nodes, ...edges] };
}

async function measureSelection(instance, iterations = 20) {
  const nodes = instance.nodes();
  const values = [];
  for (let index = 0; index < iterations && nodes.length; index += 1) {
    const node = nodes[index % nodes.length];
    values.push(await timeOperation(async () => {
      instance.$("node:selected").unselect();
      node.select();
    }, { stable: true }));
  }
  return summary(values);
}

async function measureContextMenu(instance, iterations = 20) {
  const target = instance.nodes().first();
  const values = [];
  if (!target.length) return summary(values);
  const handler = () => {
    const menu = document.createElement("div");
    menu.className = "benchmark-context-menu";
    menu.textContent = "Context actions";
    root.append(menu);
  };
  instance.on("cxttap", "node", handler);
  for (let index = 0; index < iterations; index += 1) {
    root.querySelectorAll(".benchmark-context-menu").forEach((element) => element.remove());
    values.push(await timeOperation(async () => target.emit("cxttap"), { stable: true }));
  }
  instance.off("cxttap", "node", handler);
  root.querySelectorAll(".benchmark-context-menu").forEach((element) => element.remove());
  return summary(values);
}

async function measureDrag(instance, iterations = 20) {
  const target = instance.nodes().first();
  const values = [];
  if (!target.length) return summary(values);
  for (let index = 0; index < iterations; index += 1) {
    values.push(await timeOperation(async () => {
      const position = target.position();
      target.position({ x: position.x + 2, y: position.y + 2 });
      target.emit("drag");
      target.emit("dragfree");
    }, { stable: true }));
  }
  return summary(values);
}

async function measureViewport(instance, frames = 120) {
  const frameTimes = [];
  let previous = now();
  for (let index = 0; index < frames; index += 1) {
    await frame();
    const current = now();
    frameTimes.push(current - previous);
    previous = current;
    instance.panBy({ x: index % 2 ? 2 : -2, y: index % 3 ? 1 : -1 });
    instance.zoom({ level: 0.9 + (index % 10) * 0.01, renderedPosition: { x: 720, y: 450 } });
  }
  const result = summary(frameTimes);
  return { ...result, medianFps: result.median ? 1000 / result.median : null };
}

async function measureFilters(instance, graph, strategy, iterations = 10) {
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const filters = index % 2 ? { dtype: "person" } : {};
    values.push(await timeOperation(async () => {
      const filtered = filterGraph(graph, filters);
      applyGraph(instance, filtered, strategy);
    }, { stable: true }));
  }
  applyGraph(instance, graph, strategy);
  await stableFrame();
  return summary(values);
}

function benchmarkLayoutTimeout(nodeCount, layoutMode) {
  if (layoutMode === "size-aware") return nodeCount >= 25_000 ? 10_000 : 30_000;
  if (nodeCount >= 10_000) return 4_000;
  if (nodeCount >= 5_000) return 3_000;
  return 5_000;
}

async function measureLayout(instance, name, nodeCount, layoutMode) {
  const options = layoutMode === "size-aware"
    ? sizeAwareLayoutOptions(name, nodeCount, { animate: false, fit: false, padding: 20 })
    : { name, animate: false, fit: false, padding: 20, randomize: name === "cose" };
  const timeoutMs = benchmarkLayoutTimeout(nodeCount, layoutMode);
  const started = now();
  if (layoutMode === "legacy" && nodeCount >= 5_000) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return { duration: timeoutMs, timedOut: true, timeoutMs, censored: true };
  }
  let timedOut = false;
  await new Promise((resolve) => {
    const layout = instance.layout(options);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      layout.stop();
      finish();
    }, timeoutMs);
    layout.one("layoutstop", finish);
    layout.run();
  });
  await stableFrame();
  return { duration: now() - started, timedOut, timeoutMs, censored: false };
}

async function measureIncrementalDocuments(instance, fixture, strategy, count) {
  const documents = [
    ...fixture.documents,
    ...Array.from({ length: count }, (_, index) => extraNodeDocument(index))
  ];
  return timeOperation(async () => {
    const graph = buildGraph(documents);
    applyGraph(instance, graph, strategy);
  }, { stable: true });
}

async function measureIncrementalElements(instance, graph, strategy, operation, count) {
  const next = operation === "add"
    ? graphWithElementAdditions(graph, count)
    : operation === "update"
      ? graphWithElementUpdates(graph, count)
      : graphWithElementRemovals(graph, count);
  const duration = await timeOperation(async () => applyGraph(instance, next, strategy), { stable: true });
  applyGraph(instance, graph, strategy);
  await stableFrame();
  return duration;
}

async function measureGraphSwitchMemory(instance, graph, alternate, strategy) {
  const memory = performance.memory;
  if (!memory) return null;
  globalThis.gc?.();
  const before = memory.usedJSHeapSize;
  for (let index = 0; index < 10; index += 1) {
    applyGraph(instance, index % 2 ? graph : alternate, strategy);
    await stableFrame();
  }
  globalThis.gc?.();
  return {
    before,
    after: memory.usedJSHeapSize,
    growth: memory.usedJSHeapSize - before
  };
}

export async function runGraphBenchmarkScenario({
  size = "small",
  shape = "mixed",
  seed = 0x5eed1234,
  strategy = "reconcile",
  detailMode = "adaptive",
  layoutMode = "size-aware",
  includeInteractions = true,
  includeLayout = true,
  includeIncremental = true,
  interactionIterations = 10,
  viewportFrames = 90
} = {}) {
  destroyGraph();
  status.value = `${strategy}:${size}:${shape}`;
  const fixture = generateGraphPerformanceFixture({ size, shape, seed });
  const initialLongTasks = observeLongTasks();

  const projectionStarted = now();
  const graph = buildGraph(fixture.documents);
  const projectionTime = now() - projectionStarted;

  const mountStarted = now();
  cy = createInstance(graph, { detailMode });
  applyGraph(cy, graph, strategy);
  if (detailMode === "adaptive") {
    applyGraphDetailClasses(cy, {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      zoom: cy.zoom(),
      interacting: false,
      labels: true
    });
  }
  const initialLayoutResult = includeLayout
    ? await measureLayout(
      cy,
      layoutMode === "size-aware" ? "organic" : "cose",
      graph.nodes.length,
      layoutMode
    )
    : null;
  await stableFrame();
  const firstUsable = now() - mountStarted;
  await new Promise((resolve) => setTimeout(resolve, 0));
  initialLongTasks.disconnect();

  const metrics = {
    projectionTime,
    firstUsable,
    mountToStableFrame: firstUsable,
    initialLayout: initialLayoutResult?.duration ?? null,
    initialLayoutTimeout: {
      timedOut: Boolean(initialLayoutResult?.timedOut),
      timeoutMs: initialLayoutResult?.timeoutMs ?? null,
      censored: Boolean(initialLayoutResult?.censored)
    },
    initialLongTasks: {
      count: initialLongTasks.entries.length,
      total: initialLongTasks.entries.reduce((total, value) => total + value, 0),
      max: initialLongTasks.entries.length ? Math.max(...initialLongTasks.entries) : 0,
      p95: percentile(initialLongTasks.entries, 0.95) ?? 0
    },
    heapAfterMount: performance.memory?.usedJSHeapSize ?? null
  };
  const interactionLongTasks = observeLongTasks();

  if (includeInteractions) {
    metrics.selection = await measureSelection(cy, interactionIterations);
    metrics.contextMenu = await measureContextMenu(cy, interactionIterations);
    metrics.filter = await measureFilters(cy, graph, strategy, interactionIterations);
    metrics.drag = await measureDrag(cy, interactionIterations);
    metrics.viewport = await measureViewport(cy, viewportFrames);
  }

  if (includeIncremental) {
    metrics.incrementalDocuments = {};
    metrics.incrementalElements = { add: {}, update: {}, remove: {} };
    for (const count of [1, 10, 100]) {
      metrics.incrementalDocuments[count] = await measureIncrementalDocuments(cy, fixture, strategy, count);
      for (const operation of ["add", "update", "remove"]) {
        metrics.incrementalElements[operation][count] = await measureIncrementalElements(
          cy,
          graph,
          strategy,
          operation,
          count
        );
      }
    }
  }

  const alternateFixture = generateGraphPerformanceFixture({
    nodes: Math.min(1_000, fixture.nodeCount),
    edges: Math.min(2_000, fixture.edgeCount),
    shape: "hub-heavy",
    seed: seed + 1
  });
  metrics.graphSwitchMemory = await measureGraphSwitchMemory(
    cy,
    graph,
    buildGraph(alternateFixture.documents),
    strategy
  );

  await stableFrame();
  await new Promise((resolve) => setTimeout(resolve, 0));
  interactionLongTasks.disconnect();
  metrics.interactionLongTasks = {
    count: interactionLongTasks.entries.length,
    total: interactionLongTasks.entries.reduce((total, value) => total + value, 0),
    max: interactionLongTasks.entries.length ? Math.max(...interactionLongTasks.entries) : 0,
    p95: percentile(interactionLongTasks.entries, 0.95) ?? 0
  };
  status.value = "ready";
  return {
    fixture: {
      id: fixture.id,
      size,
      shape,
      seed,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length
    },
    mode: { strategy, detailMode, layoutMode },
    metrics
  };
}

export async function benchmarkBuiltInLayouts({ size = "medium", shape = "mixed" } = {}) {
  destroyGraph();
  const fixture = generateGraphPerformanceFixture({ size, shape });
  const graph = buildGraph(fixture.documents);
  cy = createInstance(graph, { detailMode: "adaptive" });
  reconcileGraphElements(cy, graph, { retainedNodes });
  await stableFrame();
  const layouts = {};
  for (const name of ["block", "hierarchical", "circular", "organic", "interactive-organic", "orthogonal"]) {
    const result = await measureLayout(cy, name, graph.nodes.length, "size-aware");
    layouts[name] = result.duration;
  }
  return { size, shape, nodeCount: graph.nodes.length, edgeCount: graph.edges.length, layouts };
}

window.__quasarGraphBenchmark = {
  runScenario: runGraphBenchmarkScenario,
  benchmarkLayouts: benchmarkBuiltInLayouts,
  destroy: destroyGraph
};
