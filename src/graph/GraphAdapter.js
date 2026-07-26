import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";

let pluginsRegistered = false;

function registerPlugins() {
  if (pluginsRegistered) return;
  cytoscape.use(edgehandles);
  pluginsRegistered = true;
}

export class GraphAdapter {
  static create(options) {
    registerPlugins();
    return cytoscape(options);
  }
}

export function createGraphAdapter(options) {
  return GraphAdapter.create(options);
}
