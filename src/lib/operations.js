import { bulkSaveDocuments, getDocument, removeDocument, saveDocument } from "./db";

export const operation = Object.freeze({
  save(document) {
    return { type: "save-document", document };
  },
  remove(id) {
    return { type: "remove-document", id };
  },
  batch(operations, label = "Batch") {
    return { type: "batch", label, operations };
  }
});

async function applySave(command) {
  const previous = await getDocument(command.document._id);
  const saved = await saveDocument(command.document, { replace: true });
  return {
    result: saved,
    inverse: previous ? operation.save(previous) : operation.remove(saved._id)
  };
}

async function applyRemove(command) {
  const previous = await getDocument(command.id);
  if (!previous) return { result: null, inverse: null };
  await removeDocument(command.id);
  return { result: previous, inverse: operation.save(previous) };
}

async function applyBatch(command) {
  const inverses = [];
  const results = [];
  for (const child of command.operations || []) {
    const applied = await applyOperation(child);
    results.push(applied.result);
    if (applied.inverse) inverses.unshift(applied.inverse);
  }
  return {
    result: results,
    inverse: inverses.length ? operation.batch(inverses, `Undo ${command.label || "batch"}`) : null
  };
}

export async function applyOperation(command) {
  if (!command || typeof command !== "object") throw new TypeError("Operation must be an object");
  if (command.type === "save-document") return applySave(command);
  if (command.type === "remove-document") return applyRemove(command);
  if (command.type === "batch") return applyBatch(command);
  throw new TypeError(`Unknown operation type: ${command.type}`);
}

export async function saveDocumentBatch(documents, label = "Save documents", { replace = true } = {}) {
  const previous = new Map();
  for (const document of documents) previous.set(document._id, await getDocument(document._id));
  const report = await bulkSaveDocuments(documents, { replace });
  if (report.errors.length) {
    const error = new Error(`Batch rejected ${report.errors.length} document(s)`);
    error.report = report;
    throw error;
  }
  const savedIds = new Set(report.saved.map((item) => item.id));
  const savedDocuments = documents.filter((document) => savedIds.has(document._id));
  const inverse = savedDocuments.map((document) => {
    const old = previous.get(document._id);
    return old ? operation.save(old) : operation.remove(document._id);
  }).reverse();
  return {
    result: report,
    savedDocuments,
    inverse: inverse.length ? operation.batch(inverse, `Undo ${label}`) : null
  };
}
