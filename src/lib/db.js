import PouchDB from "pouchdb-browser";
import { assertDocument, isStarIntelDocument } from "starintel_doc";

export const documentsDb = new PouchDB("quasar-starintel-v09", { auto_compaction: true });
export const stateDb = new PouchDB("quasar-ui-state-v1", { auto_compaction: true });

function newestFirst(left, right) {
  return String(right.date_updated || "").localeCompare(String(left.date_updated || ""));
}

export async function listDocuments() {
  const result = await documentsDb.allDocs({ include_docs: true });
  return result.rows
    .map((row) => row.doc)
    .filter((document) => document && !document._id.startsWith("_design/") && isStarIntelDocument(document))
    .sort(newestFirst);
}

export async function getDocument(id) {
  try {
    return await documentsDb.get(id);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function saveDocument(input, { replace = true } = {}) {
  const document = assertDocument(input);
  const existing = await getDocument(document._id);
  if (existing && !replace) {
    const error = new Error(`Document already exists: ${document._id}`);
    error.code = "DOCUMENT_EXISTS";
    throw error;
  }
  if (existing) document._rev = existing._rev;
  else delete document._rev;
  const result = await documentsDb.put(document);
  return { ...document, _rev: result.rev };
}

function incomingWins(incoming, existing, replace) {
  if (replace) return true;
  const incomingVersion = Number(incoming.version || 0);
  const existingVersion = Number(existing.version || 0);
  if (incomingVersion !== existingVersion) return incomingVersion > existingVersion;
  return String(incoming.date_updated || "") > String(existing.date_updated || "");
}

export async function bulkSaveDocuments(inputs, { replace = false } = {}) {
  const validated = [];
  const errors = [];
  for (let index = 0; index < inputs.length; index += 1) {
    try {
      validated.push({ index, document: assertDocument(inputs[index]) });
    } catch (error) {
      errors.push({ index, id: inputs[index]?._id || null, message: error.message, validation: error.errors || [] });
    }
  }

  const keys = validated.map(({ document }) => document._id);
  const existingRows = keys.length ? await documentsDb.allDocs({ keys, include_docs: true }) : { rows: [] };
  const existing = new Map(existingRows.rows.filter((row) => row.doc).map((row) => [row.id, row.doc]));
  const writes = [];
  const skipped = [];

  for (const item of validated) {
    const current = existing.get(item.document._id);
    if (current && !incomingWins(item.document, current, replace)) {
      skipped.push({ index: item.index, id: item.document._id, reason: "existing document is newer or equal" });
      continue;
    }
    if (current) item.document._rev = current._rev;
    else delete item.document._rev;
    writes.push(item);
  }

  const results = writes.length ? await documentsDb.bulkDocs(writes.map(({ document }) => document)) : [];
  const saved = [];
  results.forEach((result, position) => {
    const item = writes[position];
    if (result.ok) saved.push({ index: item.index, id: result.id, rev: result.rev });
    else errors.push({ index: item.index, id: result.id, message: result.message || result.error });
  });
  return { saved, skipped, errors };
}

export async function removeDocument(id) {
  const document = await documentsDb.get(id);
  await documentsDb.remove(document);
  return document;
}

export function watchDocuments(onChange) {
  const feed = documentsDb.changes({ since: "now", live: true, include_docs: true });
  feed.on("change", onChange);
  return () => feed.cancel();
}

export async function getState(id, fallback = null) {
  try {
    return await stateDb.get(id);
  } catch (error) {
    if (error?.status === 404) return fallback;
    throw error;
  }
}

export async function putState(id, value) {
  const current = await getState(id, null);
  const result = await stateDb.put({ ...value, _id: id, ...(current?._rev ? { _rev: current._rev } : {}) });
  return { ...value, _id: id, _rev: result.rev };
}

export async function getSettings() {
  const stored = await getState("settings", {});
  return {
    couchUrl: "",
    couchDatabase: "starintel",
    couchUsername: "",
    couchPassword: "",
    actorsEnabled: false,
    actors: [],
    ...stored,
    _id: undefined,
    _rev: undefined
  };
}

export function saveSettings(settings) {
  return putState("settings", settings);
}

export async function getWorkspace() {
  const stored = await getState("workspace:default", {});
  return {
    positions: {},
    viewport: null,
    layout: "cose",
    selectedIds: [],
    ...stored,
    _id: undefined,
    _rev: undefined
  };
}

export function saveWorkspace(workspace) {
  return putState("workspace:default", workspace);
}

function remoteUrl(config) {
  const base = String(config.couchUrl || "").replace(/\/+$/, "");
  const database = encodeURIComponent(String(config.couchDatabase || "starintel"));
  if (!base) throw new Error("CouchDB URL is required");
  return `${base}/${database}`;
}

export function createRemoteDatabase(config) {
  return new PouchDB(remoteUrl(config), {
    skip_setup: false,
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers || {});
      if (config.couchUsername) {
        headers.set("Authorization", `Basic ${btoa(`${config.couchUsername}:${config.couchPassword || ""}`)}`);
      }
      return PouchDB.fetch(url, { ...options, headers });
    }
  });
}

export function startLiveSync(config, handlers = {}) {
  const remote = createRemoteDatabase(config);
  const sync = documentsDb.sync(remote, { live: true, retry: true, batch_size: 100 });
  sync.on("change", (info) => handlers.onChange?.(info));
  sync.on("paused", (error) => handlers.onPaused?.(error));
  sync.on("active", () => handlers.onActive?.());
  sync.on("denied", (error) => handlers.onDenied?.(error));
  sync.on("error", (error) => handlers.onError?.(error));
  return sync;
}

export async function syncOnce(config, direction = "both") {
  const remote = createRemoteDatabase(config);
  if (direction === "push") return documentsDb.replicate.to(remote);
  if (direction === "pull") return documentsDb.replicate.from(remote);
  return documentsDb.sync(remote);
}

export async function exportDocuments() {
  return listDocuments();
}

export async function databaseInfo() {
  const [documents, state] = await Promise.all([documentsDb.info(), stateDb.info()]);
  return { documents, state };
}
