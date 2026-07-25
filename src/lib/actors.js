export const BUILTIN_ACTORS = Object.freeze([
  {
    id: "quasar.actor.derive-node",
    label: "Create derived node",
    version: 1,
    accepts: ["*"],
    source: `(context) => {
      const source = context.selection[0];
      if (!source) return { documents: [], message: "Select one document." };
      const stamp = new Date().toISOString();
      const id = source._id + ":derived:" + Date.now().toString(36);
      return {
        message: "Created one derived node and relation.",
        documents: [
          {
            _id: id,
            dataset: source.dataset,
            dtype: "entity",
            schema_version: "0.9.0",
            version: 1,
            date_added: stamp,
            date_updated: stamp,
            title: "Derived from " + (source.title || source._id),
            sources: [],
            evidence: [],
            data: { name: "Derived from " + (source.title || source._id), etype: "derived" },
            extensions: { "quasar.actor": { actor_id: "quasar.actor.derive-node", input_ids: [source._id] } }
          },
          {
            _id: "starintel:relation:" + Date.now().toString(36) + "-derived",
            dataset: source.dataset,
            dtype: "relation",
            schema_version: "0.9.0",
            version: 1,
            date_added: stamp,
            date_updated: stamp,
            title: "derived-from",
            sources: [],
            evidence: [],
            data: { subject: id, predicate: "derived-from", object: source._id, directed: true },
            extensions: { "quasar.actor": { actor_id: "quasar.actor.derive-node", input_ids: [source._id] } }
          }
        ]
      };
    }`
  }
]);

export function normalizeActorManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new TypeError("Actor manifest must be an object");
  const actor = {
    id: String(manifest.id || "").trim(),
    label: String(manifest.label || manifest.id || "").trim(),
    version: Number(manifest.version || 1),
    accepts: Array.isArray(manifest.accepts) ? manifest.accepts.map(String) : ["*"],
    source: String(manifest.source || "").trim()
  };
  if (!actor.id) throw new TypeError("Actor id is required");
  if (!actor.label) throw new TypeError("Actor label is required");
  if (!actor.source) throw new TypeError("Actor source is required");
  return actor;
}

export function actorApplicable(actor, selection) {
  const accepted = new Set(actor.accepts || ["*"]);
  if (accepted.has("*")) return true;
  return selection.length > 0 && selection.every((document) => accepted.has(document.dtype));
}

export function runBrowserActor(manifest, context, { timeout = 30000 } = {}) {
  const actor = normalizeActorManifest(manifest);
  const bootstrap = `
    "use strict";
    const actor = (${actor.source});
    self.onmessage = async (event) => {
      try {
        const result = await actor(event.data);
        self.postMessage({ ok: true, result: result || { documents: [] } });
      } catch (error) {
        self.postMessage({ ok: false, error: { name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack || "" } });
      }
    };
  `;
  const url = URL.createObjectURL(new Blob([bootstrap], { type: "text/javascript" }));
  const worker = new Worker(url, { name: actor.id });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error(`Actor timed out after ${timeout}ms`));
    }, timeout);

    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      if (event.data?.ok) resolve(event.data.result || { documents: [] });
      else {
        const error = new Error(event.data?.error?.message || "Actor failed");
        error.name = event.data?.error?.name || "ActorError";
        error.stack = event.data?.error?.stack || error.stack;
        reject(error);
      }
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error(event.message || "Actor worker failed"));
    };
    worker.postMessage({ ...context, actor: { id: actor.id, label: actor.label, version: actor.version } });
  });
}
