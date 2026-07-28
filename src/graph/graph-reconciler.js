function elementId(element) {
  return String(element?.data?.id || "");
}

function incomingMaps(graph) {
  return {
    nodes: new Map((graph?.nodes || []).map((element) => [elementId(element), element])),
    edges: new Map((graph?.edges || []).map((element) => [elementId(element), element]))
  };
}

function samePosition(left, right) {
  return Number(left?.x) === Number(right?.x) && Number(left?.y) === Number(right?.y);
}

function documentVersion(value) {
  if (!value || typeof value !== "object") return null;
  return value._rev
    || [value._id, value.version, value.date_updated, value.updated_at].filter(Boolean).join("|")
    || null;
}

function sameDataValue(key, left, right) {
  if (Object.is(left, right)) return true;
  if (key !== "document") return false;
  const leftVersion = documentVersion(left);
  const rightVersion = documentVersion(right);
  return Boolean(leftVersion && leftVersion === rightVersion);
}

function changedDataKeys(element, incomingData) {
  const current = element.data();
  const keys = new Set([...Object.keys(current), ...Object.keys(incomingData || {})]);
  const changed = [];
  for (const key of keys) {
    if (key === "id") continue;
    if (!sameDataValue(key, current[key], incomingData?.[key])) changed.push(key);
  }
  return changed;
}

function needsEdgeReplacement(element, incoming) {
  return element.data("source") !== incoming.data.source
    || element.data("target") !== incoming.data.target;
}

function updateData(element, incomingData, keys) {
  for (const key of keys) {
    if (Object.hasOwn(incomingData, key)) element.data(key, incomingData[key]);
    else element.removeData(key);
  }
}

export function diffGraphElements(cy, graph) {
  const incoming = incomingMaps(graph);
  const nodesToAdd = [];
  const nodesToUpdate = [];
  const nodesToRemove = [];
  const edgesToAdd = [];
  const edgesToUpdate = [];
  const edgesToRemove = [];

  cy.edges().forEach((edge) => {
    if (!incoming.edges.has(edge.id())) edgesToRemove.push(edge);
  });
  cy.nodes().forEach((node) => {
    if (!incoming.nodes.has(node.id())) nodesToRemove.push(node);
  });

  for (const [id, element] of incoming.nodes) {
    const current = cy.getElementById(id);
    if (!current.length) {
      nodesToAdd.push(element);
      continue;
    }
    const dataKeys = changedDataKeys(current, element.data);
    const positionChanged = element.position && !samePosition(current.position(), element.position);
    if (dataKeys.length || positionChanged) {
      nodesToUpdate.push({ current, incoming: element, dataKeys, positionChanged });
    }
  }

  for (const [id, element] of incoming.edges) {
    const current = cy.getElementById(id);
    if (!current.length) {
      edgesToAdd.push(element);
      continue;
    }
    if (needsEdgeReplacement(current, element)) {
      edgesToRemove.push(current);
      edgesToAdd.push(element);
      continue;
    }
    const dataKeys = changedDataKeys(current, element.data);
    if (dataKeys.length) edgesToUpdate.push({ current, incoming: element, dataKeys });
  }

  return {
    nodesToAdd,
    nodesToUpdate,
    nodesToRemove,
    edgesToAdd,
    edgesToUpdate,
    edgesToRemove
  };
}

export function reconcileGraphElements(cy, graph, { retainedNodes = new Map() } = {}) {
  const viewport = { pan: cy.pan(), zoom: cy.zoom() };
  const diff = diffGraphElements(cy, graph);
  const restoredSelection = [];

  for (const node of diff.nodesToRemove) {
    retainedNodes.set(node.id(), {
      position: node.position(),
      selected: node.selected()
    });
  }

  const nodesToAdd = diff.nodesToAdd.map((node) => {
    if (node.position) return node;
    const retained = retainedNodes.get(elementId(node));
    return retained?.position ? { ...node, position: retained.position } : node;
  });

  cy.batch(() => {
    for (const edge of diff.edgesToRemove) edge.remove();
    for (const node of diff.nodesToRemove) node.remove();

    if (nodesToAdd.length) cy.add(nodesToAdd);

    for (const update of diff.nodesToUpdate) {
      updateData(update.current, update.incoming.data, update.dataKeys);
      if (update.positionChanged) update.current.position(update.incoming.position);
    }

    if (diff.edgesToAdd.length) cy.add(diff.edgesToAdd);
    for (const update of diff.edgesToUpdate) {
      updateData(update.current, update.incoming.data, update.dataKeys);
    }

    for (const node of nodesToAdd) {
      const retained = retainedNodes.get(elementId(node));
      if (!retained?.selected) continue;
      const added = cy.getElementById(elementId(node));
      if (added.length) {
        added.select();
        restoredSelection.push(added.id());
      }
    }
  });

  const currentPan = cy.pan();
  const currentZoom = cy.zoom();
  if (
    currentZoom !== viewport.zoom
    || currentPan.x !== viewport.pan.x
    || currentPan.y !== viewport.pan.y
  ) {
    cy.viewport(viewport);
  }

  return {
    added: nodesToAdd.length + diff.edgesToAdd.length,
    restoredSelection,
    updated: diff.nodesToUpdate.length + diff.edgesToUpdate.length,
    removed: diff.nodesToRemove.length + diff.edgesToRemove.length,
    ...diff
  };
}
