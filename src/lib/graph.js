import { documentLabel } from "starintel_doc";

export const DTYPE_COLORS = Object.freeze({
  person: "#38bdf8",
  org: "#a78bfa",
  relation: "#94a3b8",
  event: "#f59e0b",
  meeting: "#f59e0b",
  contract: "#22c55e",
  procurement: "#22c55e",
  grant: "#10b981",
  "lobbying-filing": "#fb7185",
  "campaign-finance": "#f97316",
  "investigation-target": "#ef4444",
  target: "#ef4444",
  claim: "#eab308",
  analysis: "#06b6d4",
  "research-pass": "#0ea5e9",
  domain: "#14b8a6",
  host: "#2dd4bf",
  network: "#0d9488",
  url: "#60a5fa",
  location: "#84cc16",
  address: "#84cc16",
  document: "#94a3b8",
  unresolved: "#64748b"
});

export const DTYPE_SHAPES = Object.freeze({
  person: "ellipse",
  org: "round-rectangle",
  event: "diamond",
  meeting: "diamond",
  relation: "round-tag",
  "investigation-target": "hexagon",
  target: "hexagon",
  claim: "triangle",
  analysis: "pentagon",
  domain: "round-hexagon",
  host: "rectangle",
  network: "octagon",
  url: "tag",
  document: "round-rectangle",
  unresolved: "ellipse"
});

function endpointId(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  return value.id || value.entity_id || value.document_id || value.external_id || null;
}

function endpointIds(value) {
  if (Array.isArray(value)) return value.map(endpointId).filter(Boolean);
  const id = endpointId(value);
  return id ? [id] : [];
}

function relationParts(document) {
  const data = document.data || {};
  return {
    subjects: endpointIds(data.subject || data.source),
    objects: endpointIds(data.object || data.target),
    predicate: data.predicate || data.relation_type || document.title || "related-to",
    directed: data.directed !== false,
    confidence: data.confidence ?? document.assessment?.confidence ?? null
  };
}

function nodeData(document, position) {
  const dtype = document.dtype || "document";
  return {
    group: "nodes",
    data: {
      id: document._id,
      label: documentLabel(document),
      dtype,
      document,
      unresolved: false,
      color: DTYPE_COLORS[dtype] || "#94a3b8",
      shape: DTYPE_SHAPES[dtype] || "ellipse"
    },
    ...(position ? { position } : {})
  };
}

function unresolvedNode(id) {
  return {
    group: "nodes",
    data: {
      id,
      label: id,
      dtype: "unresolved",
      unresolved: true,
      color: DTYPE_COLORS.unresolved,
      shape: DTYPE_SHAPES.unresolved
    }
  };
}

export function buildGraph(documents, positions = {}) {
  const entities = documents.filter((document) => document.dtype !== "relation");
  const nodes = new Map(entities.map((document) => [document._id, nodeData(document, positions[document._id])]));
  const edges = [];

  for (const relation of documents.filter((document) => document.dtype === "relation")) {
    const { subjects, objects, predicate, directed, confidence } = relationParts(relation);
    for (const source of subjects) {
      for (const target of objects) {
        if (!nodes.has(source)) nodes.set(source, unresolvedNode(source));
        if (!nodes.has(target)) nodes.set(target, unresolvedNode(target));
        edges.push({
          group: "edges",
          data: {
            id: `${relation._id}:${source}:${target}`,
            relationId: relation._id,
            source,
            target,
            label: predicate,
            predicate,
            directed,
            confidence,
            document: relation
          }
        });
      }
    }
  }

  for (const document of entities) {
    for (const target of document.related_ids || []) {
      if (!nodes.has(target)) nodes.set(target, unresolvedNode(target));
      edges.push({
        group: "edges",
        data: {
          id: `related:${document._id}:${target}`,
          relationId: null,
          source: document._id,
          target,
          label: "related",
          predicate: "related",
          directed: false,
          confidence: null
        }
      });
    }
  }

  return { nodes: [...nodes.values()], edges, elements: [...nodes.values(), ...edges] };
}

export function filterGraph(graph, query = "", dtype = "") {
  const needle = query.trim().toLowerCase();
  const matching = new Set(
    graph.nodes
      .filter((node) => (!dtype || node.data.dtype === dtype)
        && (!needle || `${node.data.id} ${node.data.label} ${node.data.dtype}`.toLowerCase().includes(needle)))
      .map((node) => node.data.id)
  );
  const edges = graph.edges.filter((edge) => matching.has(edge.data.source) && matching.has(edge.data.target));
  return { nodes: graph.nodes.filter((node) => matching.has(node.data.id)), edges, elements: [...graph.nodes.filter((node) => matching.has(node.data.id)), ...edges] };
}

export function graphStatistics(documents, graph = buildGraph(documents)) {
  const byDtype = {};
  const byDataset = {};
  const byStatus = {};
  let sourceCount = 0;
  let evidenceCount = 0;
  for (const document of documents) {
    byDtype[document.dtype] = (byDtype[document.dtype] || 0) + 1;
    byDataset[document.dataset] = (byDataset[document.dataset] || 0) + 1;
    if (document.status) byStatus[document.status] = (byStatus[document.status] || 0) + 1;
    sourceCount += document.sources?.length || 0;
    evidenceCount += document.evidence?.length || 0;
  }
  const degree = new Map(graph.nodes.map((node) => [node.data.id, 0]));
  graph.edges.forEach((edge) => {
    degree.set(edge.data.source, (degree.get(edge.data.source) || 0) + 1);
    degree.set(edge.data.target, (degree.get(edge.data.target) || 0) + 1);
  });
  const topConnected = [...degree.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([id, count]) => ({ id, count, label: graph.nodes.find((node) => node.data.id === id)?.data.label || id }));
  return {
    documents: documents.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    relations: documents.filter((document) => document.dtype === "relation").length,
    sources: sourceCount,
    evidence: evidenceCount,
    unresolvedNodes: graph.nodes.filter((node) => node.data.unresolved).length,
    byDtype,
    byDataset,
    byStatus,
    topConnected
  };
}

function edgeCost(edge) {
  const confidence = Number(edge.data.confidence);
  return 1 + (Number.isFinite(confidence) ? 1 - confidence : 0.5);
}

export function findPaths(graph, startId, endId, limit = 5, maxDepth = 8) {
  if (!startId || !endId || startId === endId) return [];
  const adjacency = new Map(graph.nodes.map((node) => [node.data.id, []]));
  graph.edges.forEach((edge) => {
    adjacency.get(edge.data.source)?.push({ edge, next: edge.data.target });
    adjacency.get(edge.data.target)?.push({ edge, next: edge.data.source });
  });
  if (!adjacency.has(startId) || !adjacency.has(endId)) return [];

  const queue = [{ nodes: [startId], edges: [], cost: 0 }];
  const results = [];
  let expansions = 0;
  while (queue.length && results.length < limit && expansions < 10000) {
    queue.sort((left, right) => left.edges.length - right.edges.length || left.cost - right.cost);
    const path = queue.shift();
    const current = path.nodes.at(-1);
    if (current === endId) {
      results.push(path);
      continue;
    }
    if (path.edges.length >= maxDepth) continue;
    for (const candidate of adjacency.get(current) || []) {
      if (path.nodes.includes(candidate.next)) continue;
      queue.push({
        nodes: [...path.nodes, candidate.next],
        edges: [...path.edges, candidate.edge],
        cost: path.cost + edgeCost(candidate.edge)
      });
    }
    expansions += 1;
  }
  return results.sort((left, right) => left.edges.length - right.edges.length || left.cost - right.cost);
}
