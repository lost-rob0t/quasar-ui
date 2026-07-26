import cytoscape from "cytoscape";
import edgehandles from "cytoscape-edgehandles";

const instances = new WeakMap();
let pluginsRegistered = false;

function registerPlugins() {
  if (pluginsRegistered) return;
  cytoscape.use(edgehandles);
  pluginsRegistered = true;
}

export class GraphAdapter {
  constructor(options) {
    registerPlugins();
    instances.set(this, cytoscape(options));

    return new Proxy(this, {
      get(target, property) {
        if (property in target) {
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }

        const instance = instances.get(target);
        const value = instance[property];
        return typeof value === "function" ? value.bind(instance) : value;
      }
    });
  }
}

export function createGraphAdapter(options) {
  return new GraphAdapter(options);
}
