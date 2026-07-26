const DEFAULT_ACTOR_TIMEOUT_MS = 30_000;
const MAX_ACTOR_TIMEOUT_MS = 120_000;
const MAX_ACTOR_SELECTION = 32;
const MAX_ACTOR_DOCUMENTS = 1_024;

export function generateUsernameCandidatesActor(context) {
  const maxSelection = 8;
  const maxCandidatesPerDocument = 16;
  const selected = Array.isArray(context.selection) ? context.selection.slice(0, maxSelection) : [];
  const documents = [];

  const normalizePart = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const normalizeUsername = (value) => String(value || "")
    .trim()
    .replace(/^@+/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 64);
  const hash = (value) => {
    let state = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      state ^= value.charCodeAt(index);
      state = Math.imul(state, 0x01000193);
    }
    return (state >>> 0).toString(36);
  };
  const addValue = (target, value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => addValue(target, item));
      return;
    }
    const username = normalizeUsername(value);
    if (username.length >= 2) target.add(username);
  };

  for (const source of selected) {
    const data = source && typeof source.data === "object" ? source.data : {};
    const candidates = new Set();
    addValue(candidates, data.username);
    addValue(candidates, data.user_name);
    addValue(candidates, data.handle);
    addValue(candidates, data.usernames);
    addValue(candidates, data.handles);
    if (Array.isArray(data.external_ids)) {
      data.external_ids
        .filter((identifier) => ["username", "handle"].includes(String(identifier?.scheme || "").toLowerCase()))
        .forEach((identifier) => addValue(candidates, identifier.value));
    }

    const explicitFirst = normalizePart(data.first_name || data.given_name || data.fname);
    const explicitMiddle = normalizePart(data.middle_name || data.mname);
    const explicitLast = normalizePart(data.last_name || data.family_name || data.surname || data.lname);
    const fullName = String(data.full_name || data.name || data.display_name || source.title || "").trim().slice(0, 256);
    const parts = fullName.split(/\s+/).map(normalizePart).filter(Boolean);
    const first = explicitFirst || parts[0] || "";
    const last = explicitLast || (parts.length > 1 ? parts.at(-1) : "");
    const middle = explicitMiddle || (parts.length > 2 ? parts.slice(1, -1).map((part) => part[0]).join("") : "");

    [
      first,
      last,
      first && last ? `${first}${last}` : "",
      first && last ? `${first}.${last}` : "",
      first && last ? `${first}_${last}` : "",
      first && last ? `${first}-${last}` : "",
      first && last ? `${first[0]}${last}` : "",
      first && last ? `${first}${last[0]}` : "",
      first && last ? `${last}${first}` : "",
      first && last ? `${last}.${first}` : "",
      first && last ? `${last}_${first}` : "",
      first && last ? `${last}-${first}` : "",
      first && middle && last ? `${first}${middle}${last}` : "",
      first && middle && last ? `${first}.${middle}.${last}` : "",
      parts.length > 1 ? parts.map((part) => part[0]).join("") : ""
    ].forEach((value) => addValue(candidates, value));

    const stamp = new Date().toISOString();
    for (const username of [...candidates].slice(0, maxCandidatesPerDocument)) {
      const suffix = `${username.replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${hash(`${source._id}\0${username}`)}`;
      const usernameId = `starintel:entity:username:${suffix}`;
      const actorExtension = {
        actor_id: "quasar.actor.username-candidates",
        input_ids: [source._id],
        generated: true
      };
      documents.push(
        {
          _id: usernameId,
          dataset: source.dataset || "default",
          dtype: "entity",
          schema_version: "0.9.0",
          version: 1,
          date_added: stamp,
          date_updated: stamp,
          title: `@${username}`,
          summary: `Username candidate generated from ${source.title || source._id}`,
          sources: [],
          evidence: [],
          data: {
            name: username,
            etype: "username",
            status: "candidate",
            external_ids: [{
              scheme: "username",
              value: username,
              notes: `Candidate generated from ${source._id}`
            }]
          },
          extensions: { "quasar.actor": actorExtension }
        },
        {
          _id: `starintel:relation:username-candidate:${hash(`${source._id}\0${usernameId}`)}`,
          dataset: source.dataset || "default",
          dtype: "relation",
          schema_version: "0.9.0",
          version: 1,
          date_added: stamp,
          date_updated: stamp,
          title: "may-use-username",
          sources: [],
          evidence: [],
          data: {
            subject: source._id,
            predicate: "may-use-username",
            object: usernameId,
            directed: true
          },
          extensions: { "quasar.actor": actorExtension }
        }
      );
    }
  }

  const truncated = Array.isArray(context.selection) && context.selection.length > maxSelection;
  return {
    documents,
    message: `Generated ${documents.length / 2} username candidate(s)${truncated ? ` from the first ${maxSelection} selected documents` : ""}.`
  };
}

export function prepareWhatsMyNameSearchesActor(context) {
  const maxSelection = 16;
  const maxUsernamesPerDocument = 16;
  const selected = Array.isArray(context.selection) ? context.selection.slice(0, maxSelection) : [];
  const documents = [];

  const normalizePart = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const normalizeUsername = (value) => String(value || "")
    .trim()
    .replace(/^@+/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 64);
  const hash = (value) => {
    let state = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      state ^= value.charCodeAt(index);
      state = Math.imul(state, 0x01000193);
    }
    return (state >>> 0).toString(36);
  };
  const addValue = (target, value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => addValue(target, item));
      return;
    }
    const username = normalizeUsername(value);
    if (username.length >= 2) target.add(username);
  };

  for (const source of selected) {
    const data = source && typeof source.data === "object" ? source.data : {};
    const usernames = new Set();
    addValue(usernames, data.username);
    addValue(usernames, data.user_name);
    addValue(usernames, data.handle);
    addValue(usernames, data.usernames);
    addValue(usernames, data.handles);
    if (Array.isArray(data.external_ids)) {
      data.external_ids
        .filter((identifier) => ["username", "handle"].includes(String(identifier?.scheme || "").toLowerCase()))
        .forEach((identifier) => addValue(usernames, identifier.value));
    }

    const name = String(data.full_name || data.name || data.display_name || source.title || "").trim().slice(0, 256);
    const parts = name.split(/\s+/).map(normalizePart).filter(Boolean);
    const first = normalizePart(data.first_name || data.given_name || data.fname) || parts[0] || "";
    const last = normalizePart(data.last_name || data.family_name || data.surname || data.lname) || (parts.length > 1 ? parts.at(-1) : "");
    [
      first,
      last,
      first && last ? `${first}${last}` : "",
      first && last ? `${first}.${last}` : "",
      first && last ? `${first}_${last}` : "",
      first && last ? `${first}-${last}` : "",
      first && last ? `${first[0]}${last}` : "",
      first && last ? `${first}${last[0]}` : "",
      first && last ? `${last}${first}` : "",
      first && last ? `${last}.${first}` : ""
    ].forEach((value) => addValue(usernames, value));

    const stamp = new Date().toISOString();
    for (const username of [...usernames].slice(0, maxUsernamesPerDocument)) {
      const queryUrl = `https://whatsmyname.app/?q=${encodeURIComponent(username)}`;
      const queryId = `starintel:entity:whatsmyname:${username.replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-${hash(`${source._id}\0${username}`)}`;
      const actorExtension = {
        actor_id: "quasar.actor.whatsmyname-searches",
        input_ids: [source._id],
        generated: true
      };
      documents.push(
        {
          _id: queryId,
          dataset: source.dataset || "default",
          dtype: "entity",
          schema_version: "0.9.0",
          version: 1,
          date_added: stamp,
          date_updated: stamp,
          title: `WhatsMyName: ${username}`,
          summary: `Prepared WhatsMyName enumeration for @${username}`,
          sources: [],
          evidence: [],
          data: {
            name: `WhatsMyName: ${username}`,
            etype: "osint-query",
            status: "prepared",
            website: queryUrl,
            external_ids: [{
              scheme: "username",
              value: username,
              issuer: "WhatsMyName",
              url: queryUrl,
              notes: "Prepared enumeration query"
            }]
          },
          extensions: { "quasar.actor": actorExtension }
        },
        {
          _id: `starintel:relation:whatsmyname-search:${hash(`${source._id}\0${queryId}`)}`,
          dataset: source.dataset || "default",
          dtype: "relation",
          schema_version: "0.9.0",
          version: 1,
          date_added: stamp,
          date_updated: stamp,
          title: "has-username-search",
          sources: [],
          evidence: [],
          data: {
            subject: source._id,
            predicate: "has-username-search",
            object: queryId,
            directed: true
          },
          extensions: { "quasar.actor": actorExtension }
        }
      );
    }
  }

  const truncated = Array.isArray(context.selection) && context.selection.length > maxSelection;
  return {
    documents,
    message: `Prepared ${documents.length / 2} WhatsMyName search(es)${truncated ? ` from the first ${maxSelection} selected documents` : ""}. Open each query document's website field to run the live enumeration.`
  };
}

export function normalizeNamesActor(context) {
  const selection = Array.isArray(context.selection) ? context.selection.slice(0, 32) : [];
  const operations = selection.map((source) => {
    const data = { ...(source.data || {}) };
    const parts = [
      data.fname || data.first_name || data.given_name,
      data.mname || data.middle_name,
      data.lname || data.last_name || data.family_name
    ].map((value) => String(value || "").trim()).filter(Boolean);
    const name = String(data.full_name || data.name || source.title || parts.join(" ")).trim().replace(/\s+/g, " ");
    if (source.dtype === "person" && name) data.full_name = name;
    else if (name) data.name = name;
    return {
      op: "update_document",
      document: {
        ...source,
        version: Number(source.version || 0) + 1,
        date_updated: new Date().toISOString(),
        title: name || source.title,
        data,
        extensions: {
          ...(source.extensions || {}),
          "quasar.actor": { actor_id: "quasar.actor.normalize-names", input_ids: [source._id] }
        }
      }
    };
  });
  return { operations, message: `Normalized ${operations.length} name(s).` };
}

export function relationsFromRelatedIdsActor(context) {
  const selection = Array.isArray(context.selection) ? context.selection.slice(0, 32) : [];
  const operations = [];
  const hash = (value) => {
    let state = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      state ^= value.charCodeAt(index);
      state = Math.imul(state, 0x01000193);
    }
    return (state >>> 0).toString(36);
  };
  const existing = new Set((context.documents || []).map((document) => document._id));
  for (const source of selection) {
    for (const target of (source.related_ids || []).slice(0, 64)) {
      const id = `starintel:relation:related:${hash(`${source._id}\0${target}`)}`;
      if (existing.has(id)) continue;
      const stamp = new Date().toISOString();
      operations.push({
        op: "create_relation",
        document: {
          _id: id,
          dataset: source.dataset || "default",
          dtype: "relation",
          schema_version: "0.9.0",
          version: 1,
          date_added: stamp,
          date_updated: stamp,
          title: "related-to",
          sources: source.sources || [],
          evidence: source.evidence || [],
          data: { subject: source._id, predicate: "related-to", object: target, directed: false },
          extensions: {
            "quasar.actor": { actor_id: "quasar.actor.related-id-relations", input_ids: [source._id] }
          }
        }
      });
      existing.add(id);
    }
  }
  return { operations, message: `Built ${operations.length} relation(s) from related IDs.` };
}

export function markUnverifiedActor(context) {
  const selection = Array.isArray(context.selection) ? context.selection.slice(0, 32) : [];
  return {
    operations: selection.map((source) => ({
      op: "update_document",
      document: {
        ...source,
        version: Number(source.version || 0) + 1,
        date_updated: new Date().toISOString(),
        verification: {
          ...(source.verification || {}),
          verified: false,
          status: "unverified"
        },
        extensions: {
          ...(source.extensions || {}),
          "quasar.actor": { actor_id: "quasar.actor.mark-unverified", input_ids: [source._id] }
        }
      }
    })),
    message: `Marked ${selection.length} document(s) unverified.`
  };
}

export const BUILTIN_ACTORS = Object.freeze([
  {
    id: "quasar.actor.derive-node",
    label: "Create derived node",
    description: "Create one derived entity and relation from the first selected document.",
    version: 1,
    accepts: ["*"],
    minSelection: 1,
    maxSelection: 1,
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
  },
  {
    id: "quasar.actor.username-candidates",
    label: "Generate username candidates",
    description: "Generate bounded username variants from selected names and existing handles.",
    version: 1,
    accepts: ["person", "entity", "user", "org"],
    minSelection: 1,
    maxSelection: 8,
    source: generateUsernameCandidatesActor.toString()
  },
  {
    id: "quasar.actor.whatsmyname-searches",
    label: "Prepare WhatsMyName searches",
    description: "Create WhatsMyName query documents from selected usernames or person names.",
    version: 1,
    accepts: ["person", "entity", "user", "org"],
    minSelection: 1,
    maxSelection: 16,
    source: prepareWhatsMyNameSearchesActor.toString()
  },
  {
    id: "quasar.actor.normalize-names",
    label: "Normalize names",
    description: "Normalize selected person and entity names without replacing provenance.",
    version: 1,
    accepts: ["person", "org", "entity"],
    minSelection: 1,
    maxSelection: 32,
    source: normalizeNamesActor.toString()
  },
  {
    id: "quasar.actor.related-id-relations",
    label: "Build related-ID relations",
    description: "Convert related IDs into explicit related-to relation documents.",
    version: 1,
    accepts: ["*"],
    minSelection: 1,
    maxSelection: 32,
    source: relationsFromRelatedIdsActor.toString()
  },
  {
    id: "quasar.actor.mark-unverified",
    label: "Mark unverified",
    description: "Mark selected documents unverified for review.",
    version: 1,
    accepts: ["*"],
    minSelection: 1,
    maxSelection: 32,
    source: markUnverifiedActor.toString()
  }
]);

export function normalizeActorManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new TypeError("Actor manifest must be an object");
  const minSelection = manifest.minSelection === undefined ? 1 : Number(manifest.minSelection);
  const maxSelection = manifest.maxSelection === undefined ? MAX_ACTOR_SELECTION : Number(manifest.maxSelection);
  const actor = {
    id: String(manifest.id || "").trim(),
    label: String(manifest.label || manifest.id || "").trim(),
    description: String(manifest.description || "").trim(),
    version: Number(manifest.version || 1),
    accepts: Array.isArray(manifest.accepts) ? [...new Set(manifest.accepts.map(String))] : ["*"],
    minSelection,
    maxSelection,
    source: String(manifest.source || "").trim()
  };
  if (!actor.id) throw new TypeError("Actor id is required");
  if (!actor.label) throw new TypeError("Actor label is required");
  if (!Number.isInteger(actor.version) || actor.version < 1) throw new TypeError("Actor version must be a positive integer");
  if (!actor.accepts.length) throw new TypeError("Actor accepts must contain at least one dtype");
  if (!Number.isInteger(actor.minSelection) || actor.minSelection < 0 || actor.minSelection > MAX_ACTOR_SELECTION) {
    throw new TypeError(`Actor minSelection must be an integer from 0 to ${MAX_ACTOR_SELECTION}`);
  }
  if (!Number.isInteger(actor.maxSelection) || actor.maxSelection < actor.minSelection || actor.maxSelection > MAX_ACTOR_SELECTION) {
    throw new TypeError(`Actor maxSelection must be an integer from minSelection to ${MAX_ACTOR_SELECTION}`);
  }
  if (!actor.source) throw new TypeError("Actor source is required");
  return actor;
}

export function actorApplicability(manifest, selection) {
  const actor = normalizeActorManifest(manifest);
  const selected = Array.isArray(selection) ? selection : [];
  if (selected.length < actor.minSelection) {
    return {
      applicable: false,
      reason: actor.minSelection === 1
        ? "Select a graph document."
        : `Select at least ${actor.minSelection} graph documents.`
    };
  }
  if (selected.length > actor.maxSelection) {
    return { applicable: false, reason: `Select no more than ${actor.maxSelection} graph documents.` };
  }
  const accepted = new Set(actor.accepts);
  if (!accepted.has("*")) {
    const rejected = selected.find((document) => !accepted.has(document.dtype));
    if (rejected) return { applicable: false, reason: `Does not accept ${rejected.dtype} documents.` };
  }
  return { applicable: true, reason: "" };
}

export function actorApplicable(actor, selection) {
  return actorApplicability(actor, selection).applicable;
}

export function isBuiltinActor(actor) {
  return BUILTIN_ACTORS.some((candidate) => candidate.id === actor?.id && candidate.source === actor?.source);
}

export function runBrowserActor(manifest, context, { timeout = DEFAULT_ACTOR_TIMEOUT_MS } = {}) {
  const actor = normalizeActorManifest(manifest);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_ACTOR_TIMEOUT_MS) {
    throw new TypeError(`Actor timeout must be an integer from 1 to ${MAX_ACTOR_TIMEOUT_MS}`);
  }
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
    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Actor timed out after ${timeout}ms`));
    }, timeout);

    worker.onmessage = (event) => {
      clearTimeout(timer);
      cleanup();
      if (event.data?.ok) {
        const result = event.data.result || { documents: [] };
        if (!Array.isArray(result.documents)) {
          reject(new TypeError("Actor result documents must be an array"));
          return;
        }
        if (result.documents.length > MAX_ACTOR_DOCUMENTS) {
          reject(new RangeError(`Actor returned more than ${MAX_ACTOR_DOCUMENTS} documents`));
          return;
        }
        resolve(result);
      } else {
        const error = new Error(event.data?.error?.message || "Actor failed");
        error.name = event.data?.error?.name || "ActorError";
        error.stack = event.data?.error?.stack || error.stack;
        reject(error);
      }
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(event.message || "Actor worker failed"));
    };
    worker.postMessage({ ...context, actor: {
      id: actor.id,
      label: actor.label,
      version: actor.version
    } });
  });
}
