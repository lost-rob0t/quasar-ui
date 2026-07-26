import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";
import { installGraphGestures } from "./graph-gestures";
import { installMaltegoLayouts } from "./maltego-layouts";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const AUTO_NODE_SPACING = 96;

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

export class GraphAdapter {
  static create(options) {
    registerPlugins();
    const cy = installMaltegoLayouts(cytoscape(options));
    installAutomaticNodePlacement(cy);
    return installGraphGestures(cy);
  }
}

export function createGraphAdapter(options) {
  return GraphAdapter.create(options);
}
