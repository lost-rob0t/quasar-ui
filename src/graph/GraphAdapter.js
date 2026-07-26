import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";
import { installGraphGestures } from "./graph-gestures";
import { installMaltegoLayouts } from "./maltego-layouts";

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
  if (!container?.addEventListener) return cy;

  const rootWindow = container.ownerDocument?.defaultView;
  const allowPan = options.panningEnabled !== false && options.userPanningEnabled !== false;
  const allowZoom = options.zoomingEnabled !== false && options.userZoomingEnabled !== false;
  const allowBoxSelection = options.boxSelectionEnabled === true;

  const syncViewportState = () => {
    const pan = cy.pan();
    container.dataset.graphPanX = String(pan.x);
    container.dataset.graphPanY = String(pan.y);
    container.dataset.graphZoom = String(cy.zoom());
  };

  const restoreViewportInput = () => {
    cy.boxSelectionEnabled(false);
    cy.userPanningEnabled(allowPan);
    cy.userZoomingEnabled(allowZoom);
  };

  const prepareViewportInput = (event) => {
    const boxSelection = allowBoxSelection
      && event.shiftKey
      && event.pointerType !== "touch";
    cy.boxSelectionEnabled(boxSelection);
    cy.userPanningEnabled(allowPan && !boxSelection);
    cy.userZoomingEnabled(allowZoom);
  };

  const cleanup = () => {
    container.removeEventListener("pointerdown", prepareViewportInput, true);
    rootWindow?.removeEventListener("pointerup", restoreViewportInput, true);
    rootWindow?.removeEventListener("pointercancel", restoreViewportInput, true);
    cy.off("pan zoom", syncViewportState);
  };

  container.addEventListener("pointerdown", prepareViewportInput, true);
  rootWindow?.addEventListener("pointerup", restoreViewportInput, true);
  rootWindow?.addEventListener("pointercancel", restoreViewportInput, true);
  cy.on("pan zoom", syncViewportState);
  cy.one("destroy", cleanup);

  cy.panningEnabled(options.panningEnabled !== false);
  cy.zoomingEnabled(options.zoomingEnabled !== false);
  restoreViewportInput();
  syncViewportState();
  return cy;
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
    installAutomaticNodePlacement(cy);
    installGraphGestures(cy);
    return installViewportInput(cy, options);
  }
}

export function createGraphAdapter(options) {
  return GraphAdapter.create(options);
}
