import { useEffect, useRef, useState } from "react";
import { useQuasar } from "../store";
import { operation } from "../lib/operations";
import { subscribeDocumentCapabilities } from "../lib/agent-document-capabilities";

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function mergePatch(target, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return clone(patch);
  const next = target && typeof target === "object" && !Array.isArray(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else if (value && typeof value === "object" && !Array.isArray(value)) next[key] = mergePatch(next[key], value);
    else next[key] = clone(value);
  }
  return next;
}

function boundedLimit(value, fallback = 25) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) ? Math.max(1, Math.min(100, number)) : fallback;
}

export default function AgentDocumentCapabilityBridge() {
  const quasar = useQuasar();
  const [ready, setReady] = useState(false);
  const quasarRef = useRef(quasar);
  const documentsRef = useRef(quasar.documents);
  quasarRef.current = quasar;
  documentsRef.current = quasar.documents;

  useEffect(() => {
    const unsubscribe = subscribeDocumentCapabilities(async ({ name, args, context, resolve, reject }) => {
      try {
        const runtime = quasarRef.current;
        if (name === "document_read") {
          const ids = new Set(args.ids || []);
          const needle = String(args.text || "").trim().toLowerCase();
          const documents = documentsRef.current
            .filter((document) => !ids.size || ids.has(document._id))
            .filter((document) => !args.dataset || document.dataset === args.dataset)
            .filter((document) => !args.objectType || document.dtype === args.objectType)
            .filter((document) => !needle || JSON.stringify(document).toLowerCase().includes(needle))
            .slice(0, boundedLimit(args.limit))
            .map(clone);
          resolve({
            count: documents.length,
            truncated: documents.length === boundedLimit(args.limit),
            documents
          });
          return;
        }

        if (name === "document_create") {
          const document = clone(args.document);
          if (!document?._id) throw new TypeError("document_create requires document._id");
          if (documentsRef.current.some((candidate) => candidate._id === document._id)) throw new Error(`Document already exists: ${document._id}`);
          const report = await runtime.executeBatch([document], `Agent create document ${document._id}`, {
            replace: false,
            atomic: true,
            origins: [{ kind: "agent", agentId: context.agent?.id, runId: context.run?.id }]
          });
          documentsRef.current = [
            document,
            ...documentsRef.current.filter((candidate) => candidate._id !== document._id)
          ];
          if (args.addToGraph) runtime.addDocumentsToActiveGraph([document._id]);
          resolve({
            created: true,
            id: document._id,
            report,
            affected: [{ id: document._id, action: "create-document" }]
          });
          return;
        }

        if (name === "document_patch") {
          const previous = documentsRef.current.find((document) => document._id === args.id);
          if (!previous) throw new Error(`Document not found: ${args.id}`);
          const patched = mergePatch(previous, args.patch);
          patched._id = previous._id;
          patched._rev = previous._rev;
          patched.date_updated = new Date().toISOString();
          const report = await runtime.executeBatch([patched], `Agent patch document ${args.id}`, {
            replace: true,
            atomic: true,
            origins: [{ kind: "agent", agentId: context.agent?.id, runId: context.run?.id }]
          });
          documentsRef.current = documentsRef.current.map((document) => document._id === args.id ? patched : document);
          if (args.addToGraph) runtime.addDocumentsToActiveGraph([args.id]);
          resolve({
            patched: true,
            id: args.id,
            before: clone(previous),
            after: clone(patched),
            report,
            affected: [{ id: args.id, action: "patch-document" }]
          });
          return;
        }

        if (name === "document_delete") {
          const previous = documentsRef.current.find((document) => document._id === args.id);
          if (!previous) throw new Error(`Document not found: ${args.id}`);
          await runtime.execute(operation.remove(args.id), `Agent delete document ${args.id}`);
          documentsRef.current = documentsRef.current.filter((document) => document._id !== args.id);
          resolve({
            deleted: true,
            id: args.id,
            previous: clone(previous),
            affected: [{ id: args.id, action: "delete-document" }]
          });
          return;
        }

        throw new Error(`Unknown document capability: ${name}`);
      } catch (error) {
        reject(error);
      }
    });
    setReady(true);
    return unsubscribe;
  }, []);

  return ready ? <span hidden data-agent-capability-ready="document" /> : null;
}
