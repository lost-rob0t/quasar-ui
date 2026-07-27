export const AGENT_DOCUMENT_CAPABILITIES = Object.freeze([
  Object.freeze({
    name: "document_read",
    description: "Read bounded StarIntel documents by ID, dataset, object type, or text match.",
    permission: "documents.read",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, maxItems: 100 },
        dataset: { type: "string" },
        objectType: { type: "string" },
        text: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    name: "document_create",
    description: "Validate and create one StarIntel document through Quasar history and undo.",
    permission: "documents.create",
    parameters: {
      type: "object",
      required: ["document"],
      properties: {
        document: { type: "object" },
        addToGraph: { type: "boolean" }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    name: "document_patch",
    description: "Apply a bounded merge patch to an existing StarIntel document through Quasar history and undo.",
    permission: "documents.edit",
    parameters: {
      type: "object",
      required: ["id", "patch"],
      properties: {
        id: { type: "string" },
        patch: { type: "object" },
        addToGraph: { type: "boolean" }
      },
      additionalProperties: false
    }
  }),
  Object.freeze({
    name: "document_delete",
    description: "Delete one StarIntel document through Quasar history and undo.",
    permission: "documents.delete",
    destructive: true,
    parameters: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: false
    }
  })
]);

const DOCUMENT_EVENT = "quasar:agent-document-capability";

export function invokeDocumentCapability(name, args, context = {}) {
  if (typeof window === "undefined") return Promise.reject(new Error("Document capabilities require the Quasar browser runtime"));
  return new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent(DOCUMENT_EVENT, {
      detail: { name, args: args || {}, context, resolve, reject }
    }));
  });
}

export function subscribeDocumentCapabilities(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail);
  window.addEventListener(DOCUMENT_EVENT, listener);
  return () => window.removeEventListener(DOCUMENT_EVENT, listener);
}
