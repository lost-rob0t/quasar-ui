const GESTURE_SCRATCH = "quasar-graph-gestures";
const DROP_PADDING = 14;

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

export function findRelationDropTarget(cy, sourceNode) {
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
    if (!boxesOverlap(sourceBox, targetBox, DROP_PADDING)) return;
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
    drag: null
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
    state.drag = state.armedNodeId === node.id()
      ? { id: node.id(), position: { ...node.position() } }
      : null;
  });
  cy.on("dragfree", "node", (event) => {
    const sourceNode = event.target;
    const drag = state.drag;
    state.drag = null;
    if (!drag || drag.id !== sourceNode.id()) return;

    const targetNode = findRelationDropTarget(cy, sourceNode);
    if (!targetNode) return;

    sourceNode.position(drag.position);
    state.armedNodeId = null;
    emitRelationDraft(cy, sourceNode, targetNode);
  });
  cy.on("taphold", emitContextTap);

  return cy;
}
