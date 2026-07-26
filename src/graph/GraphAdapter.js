import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";
import { installGraphGestures } from "./graph-gestures";

let pluginsRegistered = false;

function registerPlugins() {
  if (pluginsRegistered) return;
  cytoscape.use(edgehandles);
  pluginsRegistered = true;
}

export class GraphAdapter {
  static create(options) {
    registerPlugins();
    return installGraphGestures(cytoscape(options));
  }
}

export function createGraphAdapter(options) {
  return GraphAdapter.create(options);
}
