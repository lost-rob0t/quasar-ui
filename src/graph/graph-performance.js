export const LARGE_GRAPH_NODE_THRESHOLD = 5_000;
export const VERY_LARGE_GRAPH_NODE_THRESHOLD = 10_000;
export const LARGE_GRAPH_EDGE_THRESHOLD = 10_000;
export const VERY_LARGE_GRAPH_EDGE_THRESHOLD = 25_000;
export const LAYOUT_ANIMATION_NODE_LIMIT = 1_500;
export const FORCE_LAYOUT_NODE_LIMIT = 4_000;
export const LABEL_ZOOM_THRESHOLD = 0.55;

export function graphDetailLevel(nodeCount, edgeCount) {
  if (nodeCount >= VERY_LARGE_GRAPH_NODE_THRESHOLD || edgeCount >= VERY_LARGE_GRAPH_EDGE_THRESHOLD) {
    return "minimal";
  }
  if (nodeCount >= LARGE_GRAPH_NODE_THRESHOLD || edgeCount >= LARGE_GRAPH_EDGE_THRESHOLD) {
    return "reduced";
  }
  return "full";
}

export function rendererOptionsForGraph(nodeCount, edgeCount) {
  const detail = graphDetailLevel(nodeCount, edgeCount);
  return {
    pixelRatio: detail === "minimal" ? 1 : "auto",
    hideEdgesOnViewport: detail !== "full",
    textureOnViewport: detail === "minimal",
    motionBlur: false
  };
}

export function sizeAwareLayoutOptions(name, nodeCount, options = {}) {
  const requested = String(name || "organic");
  const animate = options.animate === true && nodeCount < LAYOUT_ANIMATION_NODE_LIMIT;
  const base = {
    name: requested,
    padding: options.padding ?? 60,
    fit: options.fit !== false,
    animate
  };

  if (requested === "organic" || requested === "interactive-organic" || requested === "cose") {
    if (nodeCount > FORCE_LAYOUT_NODE_LIMIT) {
      return { ...base, name: "orthogonal", animate: false };
    }
    return {
      ...base,
      randomize: requested !== "interactive-organic",
      numIter: Math.min(options.numIter ?? 600, nodeCount > 2_000 ? 250 : 600)
    };
  }

  return base;
}

export function shouldRunInitialLayout({ nodeCount, hasAnySavedPosition, graphChanged }) {
  return Boolean(graphChanged && nodeCount > 0 && !hasAnySavedPosition);
}

export function detailClasses({ nodeCount, edgeCount, zoom = 1, interacting = false, labels = true }) {
  const detail = graphDetailLevel(nodeCount, edgeCount);
  return {
    detail,
    reduced: detail === "reduced",
    minimal: detail === "minimal",
    interaction: interacting,
    hideLabels: !labels || zoom < LABEL_ZOOM_THRESHOLD
  };
}

export function applyGraphDetailClasses(cy, state, previous = null) {
  const next = detailClasses(state);
  if (
    previous
    && previous.detail === next.detail
    && previous.interaction === next.interaction
    && previous.hideLabels === next.hideLabels
  ) {
    return next;
  }

  const elements = cy.elements();
  const edges = cy.edges();
  cy.batch(() => {
    elements.toggleClass("detail-reduced", next.reduced);
    elements.toggleClass("detail-minimal", next.minimal);
    elements.toggleClass("zoom-labels-hidden", next.hideLabels);
    edges.toggleClass("interaction-detail", next.interaction);
  });
  return next;
}

const ACTIVE_LAYOUT_KEY = "quasarActiveLayout";

export function stopActiveGraphLayout(cy) {
  const active = cy.scratch(ACTIVE_LAYOUT_KEY);
  if (!active) return false;
  cy.scratch(ACTIVE_LAYOUT_KEY, null);
  active.stop?.();
  return true;
}

export function runExclusiveGraphLayout(cy, options, onStop) {
  stopActiveGraphLayout(cy);
  const layout = cy.layout(options);
  cy.scratch(ACTIVE_LAYOUT_KEY, layout);
  layout.one("layoutstop", () => {
    if (cy.scratch(ACTIVE_LAYOUT_KEY) !== layout) return;
    cy.scratch(ACTIVE_LAYOUT_KEY, null);
    onStop?.(layout);
  });
  layout.run();
  return layout;
}
