import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  bulkSaveDocuments,
  databaseInfo,
  exportDocuments,
  getSettings,
  getWorkspace,
  listDocuments,
  saveSettings,
  saveWorkspace,
  startLiveSync,
  syncOnce,
  watchDocuments
} from "./lib/db";
import { importFiles } from "./lib/importer";
import { applyOperation, operation, saveDocumentBatch } from "./lib/operations";
import { BUILTIN_ACTORS, actorApplicable, runBrowserActor } from "./lib/actors";

const QuasarContext = createContext(null);

export function QuasarProvider({ children }) {
  const [documents, setDocuments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ state: "offline", message: "Local only" });
  const [history, setHistory] = useState({ undo: [], redo: [] });
  const syncRef = useRef(null);
  const workspaceTimer = useRef(null);

  const refresh = useCallback(async () => setDocuments(await listDocuments()), []);

  useEffect(() => {
    let active = true;
    Promise.all([listDocuments(), getSettings(), getWorkspace()])
      .then(([nextDocuments, nextSettings, nextWorkspace]) => {
        if (!active) return;
        setDocuments(nextDocuments);
        setSettings(nextSettings);
        setWorkspace(nextWorkspace);
        setSelectedIds(nextWorkspace.selectedIds || []);
      })
      .catch((error) => setNotice({ kind: "error", message: error.message }))
      .finally(() => active && setLoading(false));
    const stop = watchDocuments(() => refresh().catch(() => {}));
    return () => {
      active = false;
      stop();
      syncRef.current?.cancel?.();
      clearTimeout(workspaceTimer.current);
    };
  }, [refresh]);

  const record = useCallback((entry) => {
    if (!entry?.inverse) return;
    setHistory((current) => ({ undo: [...current.undo.slice(-99), entry], redo: [] }));
  }, []);

  const execute = useCallback(async (command, label = command.type) => {
    const applied = await applyOperation(command);
    record({ label, inverse: applied.inverse, redo: command });
    await refresh();
    return applied.result;
  }, [record, refresh]);

  const executeBatch = useCallback(async (nextDocuments, label = "Save documents") => {
    const applied = await saveDocumentBatch(nextDocuments, label);
    record({
      label,
      inverse: applied.inverse,
      redo: operation.batch(applied.savedDocuments.map(operation.save), label)
    });
    await refresh();
    return applied.result;
  }, [record, refresh]);

  const undo = useCallback(async () => {
    const entry = history.undo.at(-1);
    if (!entry) return;
    const applied = await applyOperation(entry.inverse);
    setHistory((current) => ({
      undo: current.undo.slice(0, -1),
      redo: [...current.redo, { label: entry.label, inverse: applied.inverse }]
    }));
    await refresh();
  }, [history.undo, refresh]);

  const redo = useCallback(async () => {
    const entry = history.redo.at(-1);
    if (!entry) return;
    const applied = await applyOperation(entry.inverse);
    setHistory((current) => ({
      undo: [...current.undo, { label: entry.label, inverse: applied.inverse }],
      redo: current.redo.slice(0, -1)
    }));
    await refresh();
  }, [history.redo, refresh]);

  const importFileSet = useCallback(async (files, options = {}) => {
    const report = await importFiles(files, async (candidates, importOptions) => {
      const label = `Import ${candidates.length} documents`;
      const applied = await saveDocumentBatch(candidates, label, { replace: Boolean(importOptions.replace) });
      record({
        label,
        inverse: applied.inverse,
        redo: operation.batch(applied.savedDocuments.map(operation.save), "Redo import")
      });
      return applied.result;
    }, options);
    await refresh();
    return report;
  }, [record, refresh]);

  const persistSettings = useCallback(async (next) => {
    const normalized = { ...(settings || {}), ...next };
    setSettings(normalized);
    await saveSettings(normalized);
    return normalized;
  }, [settings]);

  const persistWorkspace = useCallback((next) => {
    const normalized = { ...(workspace || {}), ...next };
    setWorkspace(normalized);
    if (next.selectedIds) setSelectedIds(next.selectedIds);
    clearTimeout(workspaceTimer.current);
    workspaceTimer.current = setTimeout(() => saveWorkspace(normalized).catch((error) => {
      setNotice({ kind: "error", message: error.message });
    }), 120);
    return normalized;
  }, [workspace]);

  const select = useCallback((ids) => {
    const normalized = [...new Set(ids)];
    if (normalized.length === selectedIds.length && normalized.every((id, index) => id === selectedIds[index])) return workspace;
    return persistWorkspace({ selectedIds: normalized });
  }, [persistWorkspace, selectedIds, workspace]);

  const startSync = useCallback((configuration = settings) => {
    syncRef.current?.cancel?.();
    setSyncStatus({ state: "connecting", message: "Connecting to CouchDB" });
    syncRef.current = startLiveSync(configuration, {
      onActive: () => setSyncStatus({ state: "active", message: "Replicating" }),
      onPaused: (error) => setSyncStatus({ state: error ? "retrying" : "synced", message: error ? error.message : "Up to date" }),
      onDenied: (error) => setSyncStatus({ state: "denied", message: error.message }),
      onError: (error) => setSyncStatus({ state: "error", message: error.message }),
      onChange: () => refresh().catch(() => {})
    });
  }, [refresh, settings]);

  const stopSync = useCallback(() => {
    syncRef.current?.cancel?.();
    syncRef.current = null;
    setSyncStatus({ state: "offline", message: "Local only" });
  }, []);

  const synchronize = useCallback(async (direction = "both", configuration = settings) => {
    setSyncStatus({ state: "active", message: `${direction} synchronization` });
    try {
      const result = await syncOnce(configuration, direction);
      setSyncStatus({ state: "synced", message: "Synchronization complete" });
      await refresh();
      return result;
    } catch (error) {
      setSyncStatus({ state: "error", message: error.message });
      throw error;
    }
  }, [refresh, settings]);

  const actors = useMemo(() => [
    ...BUILTIN_ACTORS,
    ...(settings?.actors || [])
  ], [settings?.actors]);

  const runActor = useCallback(async (actor) => {
    if (!settings?.actorsEnabled) throw new Error("Browser actors are disabled in settings");
    const selection = documents.filter((document) => selectedIds.includes(document._id));
    if (!actorApplicable(actor, selection)) throw new Error("Actor does not accept the current selection");
    const result = await runBrowserActor(actor, {
      selection,
      documents: documents.map((document) => ({ ...document })),
      workspace: { layout: workspace?.layout || "cose" }
    });
    const produced = Array.isArray(result?.documents) ? result.documents : [];
    if (produced.length) await executeBatch(produced, `Actor: ${actor.label}`);
    setNotice({ kind: "success", message: result?.message || `Actor produced ${produced.length} document(s)` });
    return result;
  }, [documents, executeBatch, selectedIds, settings?.actorsEnabled, workspace?.layout]);

  const value = useMemo(() => ({
    documents,
    settings,
    workspace,
    selectedIds,
    selectedDocuments: documents.filter((document) => selectedIds.includes(document._id)),
    loading,
    notice,
    setNotice,
    syncStatus,
    history,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    execute,
    executeBatch,
    undo,
    redo,
    importFileSet,
    persistSettings,
    persistWorkspace,
    select,
    startSync,
    stopSync,
    synchronize,
    actors,
    runActor,
    exportDocuments,
    databaseInfo,
    bulkSaveDocuments
  }), [
    documents, settings, workspace, selectedIds, loading, notice, syncStatus, history,
    execute, executeBatch, undo, redo, importFileSet, persistSettings, persistWorkspace,
    select, startSync, stopSync, synchronize, actors, runActor
  ]);

  return <QuasarContext.Provider value={value}>{children}</QuasarContext.Provider>;
}

export function useQuasar() {
  const value = useContext(QuasarContext);
  if (!value) throw new Error("useQuasar must be used inside QuasarProvider");
  return value;
}
