import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";
import { installGraphGestures } from "./graph-gestures";
import { installMaltegoLayouts } from "./maltego-layouts";
import { installUserNavigationGuard } from "./user-navigation-guard";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const AUTO_NODE_SPACING = 96;
const DEFAULT_WHEEL_SENSITIVITY = 0.18;

let pluginsRegistered = false;

function registerPlugins() {
  if (pluginsRegistered) return;
  cytoscape.use(edgehandles);
  pluginsRegistered = true;
}

export function automaticNodePosition(index, extent) {
  const safeIndex = Math.max(0, Number(index) || 0);
  const centerX = (Number(extent?.x1) + Number(extent?.x2)) / 2;
  const centerY = (Number(extent?.y1) + Number(extent?.y2)) / 2;
  const radius = AUTO_NODE_SPACING * Math.sqrt(safeIndex + 1);
  const angle = safeIndex * GOLDEN_ANGLE;

  return {
    x: (Number.isFinite(centerX) ? centerX : 0) + Math.cos(angle) * radius,
    y: (Number.isFinite(centerY) ? centerY : 0) + Math.sin(angle) * radius
  };
}

function hasPosition(node) {
  const position = node.position();
  return Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && (Math.abs(position.x) > 0.001 || Math.abs(position.y) > 0.001);
}

function installAutomaticNodePlacement(cy) {
  let automaticIndex = 0;

  cy.on("remove", "node", () => {
    if (cy.nodes().length === 0) automaticIndex = 0;
  });

  cy.on("add", "node", (event) => {
    const node = event.target;
    if (hasPosition(node)) return;
    node.position(automaticNodePosition(automaticIndex, cy.extent()));
    automaticIndex += 1;
  });

  return cy;
}

function installViewportInput(cy, options) {
  const container = options.container;
  const allowPan = options.panningEnabled !== false && options.userPanningEnabled !== false;
  const allowZoom = options.zoomingEnabled !== false && options.userZoomingEnabled !== false;

  cy.panningEnabled(options.panningEnabled !== false);
  cy.userPanningEnabled(allowPan);
  cy.zoomingEnabled(options.zoomingEnabled !== false);
  cy.userZoomingEnabled(allowZoom);
  cy.boxSelectionEnabled(false);

  if (!container?.addEventListener) return cy;

  const syncViewportState = () => {
    const pan = cy.pan();
    container.dataset.graphPanX = String(pan.x);
    container.dataset.graphPanY = String(pan.y);
    container.dataset.graphZoom = String(cy.zoom());
  };

  const cleanup = () => {
    cy.off("pan zoom", syncViewportState);
  };

  cy.on("pan zoom", syncViewportState);
  cy.one("destroy", cleanup);
  syncViewportState();
  return cy;
}

function exposeDevelopmentGraph(cy) {
  const container = cy.container?.();
  if (!import.meta.env.DEV || !container) return;

  Object.defineProperty(container, "__quasarGraphAdapter", {
    configurable: true,
    value: cy
  });
  cy.one("destroy", () => {
    delete container.__quasarGraphAdapter;
  });
}

export class GraphAdapter {
  static create(options) {
    registerPlugins();
    const cy = installMaltegoLayouts(cytoscape({
      panningEnabled: true,
      userPanningEnabled: true,
      zoomingEnabled: true,
      userZoomingEnabled: true,
      wheelSensitivity: DEFAULT_WHEEL_SENSITIVITY,
      ...options
    }));
    const restoreUserNavigation = installUserNavigationGuard(cy);
    cy.one("destroy", restoreUserNavigation);
    installAutomaticNodePlacement(cy);
    installGraphGestures(cy);
    exposeDevelopmentGraph(cy);
    return installViewportInput(cy, options);
  }
}

export function createGraphAdapter(options) {
  return GraphAdapter.create(options);
}
