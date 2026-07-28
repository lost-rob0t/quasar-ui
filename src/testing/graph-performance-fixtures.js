const FIXTURE_STAMP = "2026-07-28T00:00:00.000Z";

export const GRAPH_PERFORMANCE_SIZES = Object.freeze({
  small: Object.freeze({ nodes: 250, edges: 500 }),
  medium: Object.freeze({ nodes: 1_000, edges: 2_000 }),
  large: Object.freeze({ nodes: 5_000, edges: 10_000 }),
  "very-large": Object.freeze({ nodes: 10_000, edges: 25_000 }),
  stress: Object.freeze({ nodes: 25_000, edges: 50_000 })
});

export const GRAPH_PERFORMANCE_SHAPES = Object.freeze([
  "sparse-random",
  "hierarchy",
  "hub-heavy",
  "disconnected",
  "multigraph",
  "long-labels",
  "unresolved",
  "mixed"
]);

const DTYPES = Object.freeze([
  "person",
  "org",
  "event",
  "location",
  "entity",
  "document",
  "source",
  "concept",
  "research-node"
]);

const DATASETS = Object.freeze(["alpha", "bravo", "charlie", "delta"]);
const PREDICATES = Object.freeze([
  "member-of",
  "employed-by",
  "funded-by",
  "located-at",
  "associated-with",
  "owns",
  "attended",
  "mentions"
]);

export function createSeededRandom(seed = 0x5eed1234) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function integer(random, maximum) {
  return Math.floor(random() * Math.max(1, maximum));
}

function nodeId(index) {
  return `starintel:entity:bench-${index}`;
}

function longLabel(index) {
  return `Benchmark entity ${index} with a deliberately long label for text rendering and truncation behavior`;
}

function nodeDocument(index, shape, random) {
  const dtype = shape === "mixed" ? DTYPES[index % DTYPES.length] : DTYPES[index % (DTYPES.length - 1)];
  const label = shape === "long-labels" || index % 97 === 0 ? longLabel(index) : `Benchmark ${dtype} ${index}`;
  return {
    _id: nodeId(index),
    dataset: DATASETS[index % DATASETS.length],
    dtype,
    schema_version: "0.9.0",
    version: 1,
    date_added: FIXTURE_STAMP,
    date_updated: FIXTURE_STAMP,
    title: label,
    summary: index % 13 === 0 ? `Synthetic benchmark record ${index}` : "",
    sources: [],
    evidence: [],
    verification: { verified: true, status: "verified" },
    data: dtype === "person"
      ? { full_name: label, score: random() }
      : { name: label, score: random() }
  };
}

function endpointPair(shape, edgeIndex, nodeCount, random) {
  switch (shape) {
    case "hierarchy": {
      const target = 1 + (edgeIndex % Math.max(1, nodeCount - 1));
      return [Math.floor((target - 1) / 2), target];
    }
    case "hub-heavy": {
      const hubCount = Math.max(1, Math.floor(Math.sqrt(nodeCount) / 2));
      return [edgeIndex % hubCount, integer(random, nodeCount)];
    }
    case "disconnected": {
      const componentCount = Math.max(2, Math.min(32, Math.floor(Math.sqrt(nodeCount))));
      const component = edgeIndex % componentCount;
      const start = Math.floor((component * nodeCount) / componentCount);
      const end = Math.max(start + 1, Math.floor(((component + 1) * nodeCount) / componentCount));
      return [start + integer(random, end - start), start + integer(random, end - start)];
    }
    case "multigraph": {
      const pairCount = Math.max(1, Math.floor(nodeCount / 3));
      const pair = edgeIndex % pairCount;
      return [pair % nodeCount, (pair * 7 + 1) % nodeCount];
    }
    default:
      return [integer(random, nodeCount), integer(random, nodeCount)];
  }
}

function relationDocument(index, sourceIndex, targetIndex, shape) {
  const unresolved = shape === "unresolved" && index % 17 === 0;
  const target = unresolved ? `starintel:entity:unresolved-${index}` : nodeId(targetIndex);
  const predicate = PREDICATES[index % PREDICATES.length];
  const label = shape === "long-labels"
    ? `${predicate}-through-a-deliberately-long-edge-label-${index}`
    : predicate;
  return {
    _id: `starintel:relation:bench-${index}`,
    dataset: DATASETS[index % DATASETS.length],
    dtype: "relation",
    schema_version: "0.9.0",
    version: 1,
    date_added: FIXTURE_STAMP,
    date_updated: FIXTURE_STAMP,
    title: label,
    sources: [],
    evidence: [],
    verification: { verified: true, status: "verified" },
    data: {
      subject: nodeId(sourceIndex),
      object: target,
      predicate: label,
      directed: index % 5 !== 0,
      confidence: (index % 100) / 100
    }
  };
}

export function generateGraphPerformanceFixture({
  size = "small",
  shape = "mixed",
  seed = 0x5eed1234,
  nodes,
  edges
} = {}) {
  const preset = GRAPH_PERFORMANCE_SIZES[size];
  if (!preset && (!Number.isInteger(nodes) || !Number.isInteger(edges))) {
    throw new RangeError(`Unknown graph fixture size: ${size}`);
  }
  if (!GRAPH_PERFORMANCE_SHAPES.includes(shape)) {
    throw new RangeError(`Unknown graph fixture shape: ${shape}`);
  }

  const nodeCount = nodes ?? preset.nodes;
  const edgeCount = edges ?? preset.edges;
  const random = createSeededRandom(seed);
  const documents = Array.from({ length: nodeCount }, (_, index) => nodeDocument(index, shape, random));

  for (let index = 0; index < edgeCount; index += 1) {
    let [source, target] = endpointPair(shape, index, nodeCount, random);
    if (source === target) target = (target + 1) % nodeCount;
    documents.push(relationDocument(index, source, target, shape));
  }

  return {
    id: `${size}-${shape}-${seed}`,
    size,
    shape,
    seed,
    nodeCount,
    edgeCount,
    documents
  };
}
