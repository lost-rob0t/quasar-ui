from pathlib import Path


def replace(path, old, new):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"missing patch anchor in {path}: {old[:160]!r}")
    file.write_text(text.replace(old, new, 1))


def insert_before(path, marker, content):
    file = Path(path)
    text = file.read_text()
    index = text.find(marker)
    if index < 0:
        raise SystemExit(f"missing insertion anchor in {path}: {marker!r}")
    file.write_text(text[:index] + content + text[index:])


def append_before_final(path, marker, content):
    file = Path(path)
    text = file.read_text()
    index = text.rfind(marker)
    if index < 0:
        raise SystemExit(f"missing final anchor in {path}: {marker!r}")
    file.write_text(text[:index] + content + text[index:])


insert_before(
    "src/lib/actors.js",
    "export const BUILTIN_ACTORS = Object.freeze([",
    r'''export function resolveLegistarClient(input) {
  const data = input?.data && typeof input.data === "object" ? input.data : input || {};
  const candidates = [
    data.legistar_client,
    data.legistarClient,
    data.client,
    data.city,
    data.municipality,
    data.target,
    data.name,
    input?.title
  ];

  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw || raw.includes("@")) continue;
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      if (host === "webapi.legistar.com") {
        const match = url.pathname.match(/\/v1\/([^/]+)/i);
        if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
      }
      if (host.endsWith(".legistar.com")) {
        const client = host.slice(0, -".legistar.com".length);
        if (client && client !== "www" && client !== "webapi") return client;
      }
      continue;
    } catch {
      // Plain city and client names are handled below.
    }

    const clean = raw
      .replace(/^city\s*:\s*/i, "")
      .replace(/,.*$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 64);
    if (clean.length >= 2) return clean;
  }
  return "";
}

export function targetInputExpansionActor(context) {
  const selection = Array.isArray(context.selection) ? context.selection.slice(0, 16) : [];
  const corpus = new Map((context.documents || []).map((document) => [document._id, document]));
  const existing = new Set(corpus.keys());
  const documents = [];

  const hash = (value) => {
    let state = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      state ^= value.charCodeAt(index);
      state = Math.imul(state, 0x01000193);
    }
    return (state >>> 0).toString(36);
  };
  const addInput = (values, value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => addInput(values, item));
      return;
    }
    if (value && typeof value === "object") {
      addInput(values, value.target);
      addInput(values, value.value);
      addInput(values, value.url);
      addInput(values, value.domain);
      addInput(values, value.email);
      addInput(values, value.username);
      return;
    }
    const clean = String(value || "").trim();
    if (clean) values.add(clean.slice(0, 2048));
  };
  const classify = (raw) => {
    if (/^starintel:[^\s]+$/i.test(raw)) return { kind: "document-reference", value: raw };
    try {
      const url = new URL(raw);
      if (["http:", "https:"].includes(url.protocol)) {
        return { kind: "url", value: url.href, website: url.href };
      }
    } catch {
      // Non-URL input continues through typed classifiers.
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return { kind: "email", value: raw.toLowerCase() };
    }
    if (/^@[a-z0-9._-]{2,64}$/i.test(raw)) {
      return { kind: "username", value: raw.replace(/^@/, "").toLowerCase() };
    }
    if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(raw)) {
      const value = raw.toLowerCase();
      return { kind: "domain", value, website: `https://${value}` };
    }
    return { kind: "search-term", value: raw };
  };

  for (const source of selection) {
    if (source?.dtype !== "target") continue;
    const data = source.data && typeof source.data === "object" ? source.data : {};
    const inputs = new Set();
    addInput(inputs, data.target);
    addInput(inputs, data.targets);
    addInput(inputs, data.value);
    addInput(inputs, data.input);
    addInput(inputs, data.query);
    addInput(inputs, data.url);
    addInput(inputs, data.domain);
    addInput(inputs, data.email);
    addInput(inputs, data.username);
    addInput(inputs, data.options);

    for (const raw of [...inputs].slice(0, 64)) {
      const classified = classify(raw);
      let objectId = classified.value;
      if (classified.kind !== "document-reference" || !corpus.has(classified.value)) {
        const slug = classified.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 42) || classified.kind;
        objectId = `starintel:entity:target-input:${slug}-${hash(`${source._id}\0${classified.kind}\0${classified.value}`)}`;
        if (!existing.has(objectId)) {
          const stamp = new Date().toISOString();
          const actorExtension = {
            actor_id: "quasar.actor.target-input-expansion",
            input_ids: [source._id],
            generated: true
          };
          const externalId = {
            scheme: classified.kind,
            value: classified.value,
            notes: `Expanded from target ${source._id}`
          };
          if (classified.website) externalId.url = classified.website;
          documents.push({
            _id: objectId,
            dataset: source.dataset || "default",
            dtype: "entity",
            schema_version: "0.9.0",
            version: 1,
            date_added: stamp,
            date_updated: stamp,
            title: classified.kind === "username" ? `@${classified.value}` : classified.value,
            summary: `${classified.kind} expanded from ${source.title || source._id}`,
            sources: source.sources || [],
            evidence: source.evidence || [],
            data: {
              name: classified.value,
              etype: classified.kind,
              status: "target-input",
              ...(classified.website ? { website: classified.website } : {}),
              external_ids: [externalId]
            },
            extensions: { "quasar.actor": actorExtension }
          });
          existing.add(objectId);
        }
      }

      const relationId = `starintel:relation:target-input:${hash(`${source._id}\0${objectId}`)}`;
      if (existing.has(relationId)) continue;
      const stamp = new Date().toISOString();
      documents.push({
        _id: relationId,
        dataset: source.dataset || "default",
        dtype: "relation",
        schema_version: "0.9.0",
        version: 1,
        date_added: stamp,
        date_updated: stamp,
        title: "targets",
        sources: source.sources || [],
        evidence: source.evidence || [],
        data: {
          subject: source._id,
          predicate: "targets",
          object: objectId,
          directed: true
        },
        extensions: {
          "quasar.actor": {
            actor_id: "quasar.actor.target-input-expansion",
            input_ids: [source._id],
            generated: true
          }
        }
      });
      existing.add(relationId);
    }
  }

  return {
    documents,
    message: `Expanded ${documents.filter((document) => document.dtype !== "relation").length} target input(s).`
  };
}

export async function cityLegistarCalendarActor(context) {
  const source = Array.isArray(context.selection) ? context.selection[0] : null;
  if (!source) return { documents: [], message: "Select a city, location, organization, entity, or target." };

  const resolveClient = (input) => {
    const data = input?.data && typeof input.data === "object" ? input.data : input || {};
    const candidates = [
      data.legistar_client,
      data.legistarClient,
      data.client,
      data.city,
      data.municipality,
      data.target,
      data.name,
      input?.title
    ];
    for (const candidate of candidates) {
      const raw = String(candidate || "").trim();
      if (!raw || raw.includes("@")) continue;
      try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase();
        if (host === "webapi.legistar.com") {
          const match = url.pathname.match(/\/v1\/([^/]+)/i);
          if (match?.[1]) return decodeURIComponent(match[1]).toLowerCase();
        }
        if (host.endsWith(".legistar.com")) {
          const client = host.slice(0, -".legistar.com".length);
          if (client && client !== "www" && client !== "webapi") return client;
        }
        continue;
      } catch {
        // Plain city and client names are handled below.
      }
      const clean = raw
        .replace(/^city\s*:\s*/i, "")
        .replace(/,.*$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 64);
      if (clean.length >= 2) return clean;
    }
    return "";
  };
  const hash = (value) => {
    let state = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      state ^= value.charCodeAt(index);
      state = Math.imul(state, 0x01000193);
    }
    return (state >>> 0).toString(36);
  };
  const absolute = (value, site) => {
    if (!value) return "";
    try {
      return new URL(value, site).href;
    } catch {
      return "";
    }
  };

  const client = resolveClient(source);
  if (!client) return { documents: [], message: "No Legistar city/client input was found." };
  const data = source.data && typeof source.data === "object" ? source.data : {};
  const DAY = 86_400_000;
  const now = Date.now();
  const from = new Date(data.from || now - 30 * DAY);
  const to = new Date(data.to || now + 180 * DAY);
  const limit = Math.max(1, Math.min(Number(data.limit) || 100, 200));
  const api = `https://webapi.legistar.com/v1/${encodeURIComponent(client)}`;
  const site = `https://${client}.legistar.com`;
  const response = await fetch(`${api}/events?$top=${limit}`, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Legistar ${client} returned HTTP ${response.status}`);
  const payload = await response.json();
  const events = Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : [];
  const existing = new Set((context.documents || []).map((document) => document._id));
  const documents = [];

  for (const event of events.slice(0, limit)) {
    const rawDate = event.EventDate || event.EventDateTime || event.EventLastModifiedUtc;
    const eventDate = rawDate ? new Date(rawDate) : null;
    if (eventDate && Number.isFinite(eventDate.getTime())) {
      if (eventDate < from || eventDate > to) continue;
    }
    const eventIdValue = String(event.EventId || hash(JSON.stringify(event))).slice(0, 80);
    const eventId = `starintel:event:legistar-${client}-${eventIdValue}`;
    const relationId = `starintel:relation:legistar-calendar:${hash(`${source._id}\0${eventId}`)}`;
    const stamp = new Date().toISOString();
    const name = [event.EventBodyName, event.EventDate ? new Date(event.EventDate).toLocaleDateString("en-US") : ""]
      .filter(Boolean)
      .join(" · ") || `Legistar event ${eventIdValue}`;
    const website = absolute(event.EventInSiteURL || event.EventAgendaFile || event.EventMinutesFile, site);
    const actorExtension = {
      actor_id: "quasar.actor.city-legistar-calendar",
      input_ids: [source._id],
      generated: true,
      client
    };

    if (!existing.has(eventId)) {
      documents.push({
        _id: eventId,
        dataset: source.dataset || `legistar-${client}`,
        dtype: "event",
        schema_version: "0.9.0",
        version: 1,
        date_added: stamp,
        date_updated: stamp,
        title: name,
        summary: `Public meeting from the ${client} Legistar calendar`,
        sources: [],
        evidence: [],
        data: {
          name,
          event_type: "government-meeting",
          start_time: eventDate && Number.isFinite(eventDate.getTime()) ? eventDate.toISOString() : "",
          location: event.EventLocation || "",
          status: event.EventAgendaStatusName || String(event.EventAgendaStatusId || ""),
          website,
          legistar_client: client,
          legistar_event_id: event.EventId,
          body: event.EventBodyName || ""
        },
        extensions: { "quasar.actor": actorExtension }
      });
      existing.add(eventId);
    }
    if (!existing.has(relationId)) {
      documents.push({
        _id: relationId,
        dataset: source.dataset || `legistar-${client}`,
        dtype: "relation",
        schema_version: "0.9.0",
        version: 1,
        date_added: stamp,
        date_updated: stamp,
        title: "has-calendar-event",
        sources: [],
        evidence: [],
        data: {
          subject: source._id,
          predicate: "has-calendar-event",
          object: eventId,
          directed: true
        },
        extensions: { "quasar.actor": actorExtension }
      });
      existing.add(relationId);
    }
  }

  return {
    documents,
    message: `Loaded ${documents.filter((document) => document.dtype === "event").length} ${client} Legistar event(s).`
  };
}

export function actorsForTarget(actors, target, trigger = "target:create") {
  const data = target?.data && typeof target.data === "object" ? target.data : {};
  const requested = new Set();
  const add = (value) => {
    if (Array.isArray(value)) value.forEach(add);
    else String(value || "").split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => requested.add(item));
  };
  add(data.actor);
  add(data.actors);

  return (actors || []).filter((actor) => {
    const normalized = normalizeActorManifest(actor);
    return normalized.triggers.includes(trigger) || requested.has(normalized.id);
  });
}

'''
)

replace(
    "src/lib/actors.js",
    '''    addValue(candidates, data.handles);
    if (Array.isArray(data.external_ids)) {''',
    '''    addValue(candidates, data.handles);
    if (source.dtype === "target") {
      const targetType = String(data.target_type || "").toLowerCase();
      const targetValue = String(data.target || "").trim();
      if (["username", "handle", "user"].some((type) => targetType.includes(type)) || targetValue.startsWith("@")) {
        addValue(candidates, targetValue);
      }
    }
    if (Array.isArray(data.external_ids)) {'''
)
replace(
    "src/lib/actors.js",
    '''    addValue(usernames, data.handles);
    if (Array.isArray(data.external_ids)) {''',
    '''    addValue(usernames, data.handles);
    if (source.dtype === "target") {
      const targetType = String(data.target_type || "").toLowerCase();
      const targetValue = String(data.target || "").trim();
      if (["username", "handle", "user"].some((type) => targetType.includes(type)) || targetValue.startsWith("@")) {
        addValue(usernames, targetValue);
      }
    }
    if (Array.isArray(data.external_ids)) {'''
)
replace(
    "src/lib/actors.js",
    '''    accepts: ["person", "entity", "user", "org"],
    minSelection: 1,
    maxSelection: 8,''',
    '''    accepts: ["person", "entity", "user", "org", "target"],
    minSelection: 1,
    maxSelection: 8,'''
)
replace(
    "src/lib/actors.js",
    '''    accepts: ["person", "entity", "user", "org"],
    minSelection: 1,
    maxSelection: 16,''',
    '''    accepts: ["person", "entity", "user", "org", "target"],
    minSelection: 1,
    maxSelection: 16,'''
)
replace(
    "src/lib/actors.js",
    '''  {
    id: "quasar.actor.normalize-names",''',
    '''  {
    id: "quasar.actor.target-input-expansion",
    label: "Expand target inputs",
    description: "Turn target values into typed graph entities and explicit target relations.",
    version: 1,
    accepts: ["target"],
    triggers: ["target:create"],
    minSelection: 1,
    maxSelection: 16,
    source: targetInputExpansionActor.toString()
  },
  {
    id: "quasar.actor.city-legistar-calendar",
    label: "Load city Legistar calendar",
    description: "Load bounded public meeting records for a city or Legistar client supplied by the selected input.",
    version: 1,
    accepts: ["target", "location", "org", "entity"],
    triggers: [],
    minSelection: 1,
    maxSelection: 1,
    source: cityLegistarCalendarActor.toString()
  },
  {
    id: "quasar.actor.normalize-names",'''
)
replace(
    "src/lib/actors.js",
    '''    accepts: Array.isArray(manifest.accepts) ? [...new Set(manifest.accepts.map(String))] : ["*"],
    minSelection,
    maxSelection,
    source: String(manifest.source || "").trim()''',
    '''    accepts: Array.isArray(manifest.accepts) ? [...new Set(manifest.accepts.map(String))] : ["*"],
    triggers: Array.isArray(manifest.triggers)
      ? [...new Set(manifest.triggers.map((trigger) => String(trigger || "").trim()).filter(Boolean))]
      : [],
    minSelection,
    maxSelection,
    source: String(manifest.source || "").trim()'''
)

replace(
    "src/store.jsx",
    '''import { BUILTIN_ACTORS, actorApplicability, isBuiltinActor, runBrowserActor } from "./lib/actors";''',
    '''import {
  BUILTIN_ACTORS,
  actorApplicability,
  actorsForTarget,
  isBuiltinActor,
  runBrowserActor
} from "./lib/actors";'''
)
replace(
    "src/store.jsx",
    '''  const runActor = useCallback(async (actor, requestedSelectionIds = selectedIds) => {
    if (!isBuiltinActor(actor) && !settings?.actorsEnabled) throw new Error("Custom browser actors are disabled in settings");
    const selection = documents.filter((document) => requestedSelectionIds.includes(document._id));
    const availability = actorApplicability(actor, selection);
    if (!availability.applicable) throw new Error(availability.reason);
    const result = await runBrowserActor(actorWithTransformEnvelope(actor), {
      selection,
      documents: documents.map((document) => ({ ...document })),
      workspace: { layout: workspace?.layout || "cose" }
    });
    const label = `Actor: ${actor.label}`;
    const transform = buildActorTransform(result, documents, label);
    if (transform.command) await execute(transform.command, label);
    if (transform.documents.length) {
      addDocumentsToActiveGraph(transform.documents.map((document) => document._id));
    }
    setNotice({ kind: "success", message: transform.message });
    return { ...result, ...transform, documents: transform.documents };
  }, [addDocumentsToActiveGraph, documents, execute, selectedIds, settings?.actorsEnabled, workspace?.layout]);

  const activeGraph = useMemo(() => getActiveGraph(workspace || {}), [workspace]);''',
    '''  const runActor = useCallback(async (actor, requestedSelection = selectedIds) => {
    if (!isBuiltinActor(actor) && !settings?.actorsEnabled) throw new Error("Custom browser actors are disabled in settings");
    const requested = Array.isArray(requestedSelection) ? requestedSelection : [requestedSelection];
    const explicitDocuments = requested.filter((item) => item && typeof item === "object");
    const requestedIds = requested
      .map((item) => typeof item === "string" ? item : item?._id)
      .filter(Boolean);
    const corpus = new Map(documents.map((document) => [document._id, document]));
    explicitDocuments.forEach((document) => corpus.set(document._id, document));
    const selection = requestedIds.map((id) => corpus.get(id)).filter(Boolean);
    const availability = actorApplicability(actor, selection);
    if (!availability.applicable) throw new Error(availability.reason);
    const corpusDocuments = [...corpus.values()];
    const result = await runBrowserActor(actorWithTransformEnvelope(actor), {
      selection,
      documents: corpusDocuments.map((document) => ({ ...document })),
      workspace: { layout: workspace?.layout || "cose" }
    });
    const label = `Actor: ${actor.label}`;
    const transform = buildActorTransform(result, corpusDocuments, label);
    if (transform.command) await execute(transform.command, label);
    if (transform.documents.length) {
      addDocumentsToActiveGraph(transform.documents.map((document) => document._id));
    }
    setNotice({ kind: "success", message: transform.message });
    return { ...result, ...transform, documents: transform.documents };
  }, [addDocumentsToActiveGraph, documents, execute, selectedIds, settings?.actorsEnabled, workspace?.layout]);

  const runTargetActors = useCallback(async (target) => {
    const candidates = actorsForTarget(actors, target);
    const reports = [];
    for (const actor of candidates) {
      try {
        const result = await runActor(actor, [target]);
        reports.push({ actorId: actor.id, status: "completed", produced: result.documents.length });
      } catch (error) {
        reports.push({ actorId: actor.id, status: "failed", error: error.message });
      }
    }
    if (reports.length) {
      const failed = reports.filter((report) => report.status === "failed");
      setNotice({
        kind: failed.length ? "error" : "success",
        message: failed.length
          ? `Target saved; ${failed.length} actor(s) failed and ${reports.length - failed.length} completed.`
          : `Target saved; ${reports.length} actor(s) completed.`
      });
    }
    return reports;
  }, [actors, runActor]);

  const activeGraph = useMemo(() => getActiveGraph(workspace || {}), [workspace]);'''
)
replace(
    "src/store.jsx",
    '''    actors,
    runActor,
    exportDocuments,''',
    '''    actors,
    runActor,
    runTargetActors,
    exportDocuments,'''
)
replace(
    "src/store.jsx",
    '''    startQueue, stopQueue, actors, runActor
  ]);''',
    '''    startQueue, stopQueue, actors, runActor, runTargetActors
  ]);'''
)

replace(
    "src/components/DocumentEditor.jsx",
    '''  const { documents, execute, setNotice, workspace, addDocumentsToActiveGraph } = useQuasar();''',
    '''  const {
    documents,
    execute,
    setNotice,
    workspace,
    addDocumentsToActiveGraph,
    runTargetActors
  } = useQuasar();'''
)
replace(
    "src/components/DocumentEditor.jsx",
    '''      await execute(operation.save(document), `${existing ? "Update" : "Create"} ${document._id}`);
      if (!existing && params.get("returnTo") === "graph") {''',
    '''      await execute(operation.save(document), `${existing ? "Update" : "Create"} ${document._id}`);
      if (!existing && document.dtype === "target") await runTargetActors(document);
      if (!existing && params.get("returnTo") === "graph") {'''
)

replace(
    "src/components/GraphPage.jsx",
    '''function TargetSubmit({ document, onClose }) {
  const { settings, submitTarget, setNotice } = useQuasar();''',
    '''function TargetSubmit({ document, onClose }) {
  const { settings, submitTarget, runTargetActors, setNotice } = useQuasar();'''
)
replace(
    "src/components/GraphPage.jsx",
    '''      await submitTarget(targetDocument, settings);
      setNotice({ kind: "success", message: `Submitted ${documentLabel(document)} to ${actor}` });''',
    '''      await submitTarget(targetDocument, settings);
      await runTargetActors(targetDocument);
      setNotice({ kind: "success", message: `Submitted ${documentLabel(document)} to ${actor}` });'''
)

replace(
    "src/lib/actors.test.js",
    '''import { describe, expect, it } from "vitest";''',
    '''import { describe, expect, it } from "vitest";'''
)
replace(
    "src/lib/actors.test.js",
    '''  actorApplicability,
  generateUsernameCandidatesActor,''',
    '''  actorApplicability,
  actorsForTarget,
  generateUsernameCandidatesActor,'''
)
replace(
    "src/lib/actors.test.js",
    '''  markUnverifiedActor,
  normalizeActorManifest,''',
    '''  markUnverifiedActor,
  normalizeActorManifest,
  resolveLegistarClient,'''
)
replace(
    "src/lib/actors.test.js",
    '''  prepareWhatsMyNameSearchesActor,
  relationsFromRelatedIdsActor''',
    '''  prepareWhatsMyNameSearchesActor,
  relationsFromRelatedIdsActor,
  targetInputExpansionActor'''
)
append_before_final(
    "src/lib/actors.test.js",
    "});\n",
    r'''  it("normalizes target-create triggers", () => {
    const actor = normalizeActorManifest({
      id: "test.triggered",
      source: "() => ({ documents: [] })",
      triggers: ["target:create", "target:create", ""]
    });
    expect(actor.triggers).toEqual(["target:create"]);
  });

  it("selects trigger actors and explicitly requested target actors", () => {
    const target = {
      ...person,
      _id: "starintel:target:test",
      dtype: "target",
      data: { target: "Columbus", actor: "quasar.actor.city-legistar-calendar" }
    };
    const selected = actorsForTarget(BUILTIN_ACTORS, target);
    expect(selected.map((actor) => actor.id)).toEqual(expect.arrayContaining([
      "quasar.actor.target-input-expansion",
      "quasar.actor.city-legistar-calendar"
    ]));
  });

  it("expands URL target inputs into canonical entities and relations", () => {
    const target = {
      ...person,
      _id: "starintel:target:url",
      dtype: "target",
      data: { target: "https://example.com/path" }
    };
    const result = targetInputExpansionActor({ selection: [target], documents: [target] });
    const entity = result.documents.find((document) => document.dtype === "entity");
    const relation = result.documents.find((document) => document.dtype === "relation");
    expect(entity.data).toMatchObject({ etype: "url", website: "https://example.com/path" });
    expect(relation.data).toMatchObject({ subject: target._id, object: entity._id, predicate: "targets" });
    result.documents.forEach((document) => expect(() => assertDocument(document)).not.toThrow());
  });

  it("links target document references without duplicating the referenced document", () => {
    const target = {
      ...person,
      _id: "starintel:target:reference",
      dtype: "target",
      data: { target: person._id }
    };
    const result = targetInputExpansionActor({ selection: [target], documents: [target, person] });
    expect(result.documents.filter((document) => document.dtype !== "relation")).toHaveLength(0);
    expect(result.documents[0].data.object).toBe(person._id);
  });

  it("resolves generic city and Legistar URL inputs", () => {
    expect(resolveLegistarClient({ data: { target: "Columbus, Ohio" } })).toBe("columbus");
    expect(resolveLegistarClient({ data: { target: "https://webapi.legistar.com/v1/newyork/events" } })).toBe("newyork");
    expect(resolveLegistarClient({ data: { target: "https://chicago.legistar.com/Calendar.aspx" } })).toBe("chicago");
  });

'''
)

Path("e2e/target-actors.spec.ts").write_text(r'''import { expect, test } from "@playwright/test";

test("runs target-create actors from a newly created target", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/documents/new?dtype=target&returnTo=graph");
  await page.getByLabel("actor").fill("quasar.actor.target-input-expansion");
  await page.getByLabel("target").fill("https://example.com/research");
  await page.getByRole("button", { name: "Save document" }).click();

  await expect(page).toHaveURL(/\/graph\?node=/);
  await expect(page.locator(".graph-count")).toContainText("2 nodes");
  await expect(page.locator(".graph-count")).toContainText("1 edges");
});
''')
