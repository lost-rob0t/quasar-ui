import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Play,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import {
  ACTOR_CONFIGURATION_SCHEMA,
  createActorKey,
  getActorConfiguration,
  listActorKeys,
  listActorQuotas,
  listServerActors,
  revokeActorKey,
  saveActorConfiguration,
  startServerActor
} from "../lib/actor-control-plane";
import { useQuasar } from "../store";

const DEFAULT_KEY_DRAFT = Object.freeze({
  name: "",
  mode: "one_run",
  limit: "1",
  window: "lifetime"
});

function blankConfiguration(actor) {
  return {
    id: `actor-config:${actor.id}`,
    actorId: actor.id,
    tenantId: actor.tenantId,
    enabled: true,
    schemaVersion: ACTOR_CONFIGURATION_SCHEMA,
    configuration: {}
  };
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function quotaLabel(quota) {
  if (quota.monthly?.unlimited) return "Unlimited monthly allowance";
  if (quota.monthly?.limit != null) {
    return `${quota.monthly.remaining} of ${quota.monthly.limit} monthly remaining`;
  }
  if (quota.monthly) return "Custom monthly allowance";
  if (!quota.limit) return `Unmetered · ${quota.window}`;
  return `${quota.remaining} of ${quota.limit} remaining · ${quota.window}`;
}

function quotaScope(quota) {
  if (quota.keyId) return `key ${quota.keyId}`;
  if (quota.actorId) return `actor ${quota.actorId}`;
  if (quota.tenantId) return `tenant ${quota.tenantId}`;
  return "effective quota";
}

export default function ServerActorRegistry() {
  const { settings = {}, setNotice } = useQuasar();
  const [actors, setActors] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [configuration, setConfiguration] = useState(null);
  const [configurationText, setConfigurationText] = useState("{}");
  const [keys, setKeys] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [keyDraft, setKeyDraft] = useState(DEFAULT_KEY_DRAFT);
  const [issuedSecret, setIssuedSecret] = useState(null);
  const [status, setStatus] = useState({ kind: "idle", message: "" });
  const [loading, setLoading] = useState(false);

  const selectedActor = useMemo(
    () => actors.find((actor) => actor.id === selectedId) || null,
    [actors, selectedId]
  );

  const refreshCatalog = useCallback(async () => {
    if (!settings.serverUrl) return;
    setLoading(true);
    setStatus({ kind: "loading", message: "Loading tenant-visible actors…" });
    try {
      const nextActors = await listServerActors(settings);
      setActors(nextActors);
      setSelectedId((current) =>
        nextActors.some((actor) => actor.id === current) ? current : nextActors[0]?.id || ""
      );
      setStatus({
        kind: "success",
        message: `${nextActors.length} tenant-visible actor${nextActors.length === 1 ? "" : "s"} loaded.`
      });
    } catch (error) {
      setActors([]);
      setSelectedId("");
      setStatus({ kind: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    if (!selectedActor) {
      setConfiguration(null);
      setKeys([]);
      setQuotas([]);
      setIssuedSecret(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setIssuedSecret(null);
    Promise.allSettled([
      getActorConfiguration(settings, selectedActor, { signal: controller.signal }),
      listActorKeys(settings, selectedActor.id, { signal: controller.signal }),
      listActorQuotas(settings, selectedActor.id, { signal: controller.signal })
    ])
      .then(([configResult, keyResult, quotaResult]) => {
        const nextConfiguration =
          configResult.status === "fulfilled"
            ? configResult.value
            : blankConfiguration(selectedActor);
        setConfiguration(nextConfiguration);
        setConfigurationText(JSON.stringify(nextConfiguration.configuration, null, 2));
        setKeys(keyResult.status === "fulfilled" ? keyResult.value : []);
        setQuotas(quotaResult.status === "fulfilled" ? quotaResult.value : []);
        const failures = [configResult, keyResult, quotaResult].filter(
          (result) => result.status === "rejected"
        );
        if (failures.length) {
          setStatus({
            kind: "warning",
            message: `${failures.length} actor detail endpoint${failures.length === 1 ? "" : "s"} unavailable; editable defaults are shown.`
          });
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedActor, settings]);

  async function persistConfiguration() {
    if (!selectedActor || !configuration) return;
    try {
      const values = JSON.parse(configurationText);
      if (!values || Array.isArray(values) || typeof values !== "object") {
        throw new TypeError("Actor configuration must be a JSON object");
      }
      setLoading(true);
      const saved = await saveActorConfiguration(settings, selectedActor, {
        ...configuration,
        configuration: values
      });
      setConfiguration(saved);
      setConfigurationText(JSON.stringify(saved.configuration, null, 2));
      setStatus({ kind: "success", message: `Saved ${selectedActor.label} configuration.` });
      setNotice?.({
        kind: "success",
        message: `Actor configuration saved: ${selectedActor.label}`
      });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function runSelected() {
    if (!selectedActor || !configuration) return;
    try {
      setLoading(true);
      setStatus({ kind: "loading", message: `Starting ${selectedActor.label}…` });
      const run = await startServerActor(settings, selectedActor, {
        configuration_id: configuration.id,
        input: {}
      });
      const runId = run?.run_id || run?.runId || run?.id || "queued";
      setStatus({ kind: "success", message: `${selectedActor.label} started · ${runId}` });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function issueKey(event) {
    event.preventDefault();
    if (!selectedActor) return;
    try {
      const limit = Number(keyDraft.limit);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError("Quota limit must be a positive integer");
      }
      setLoading(true);
      const result = await createActorKey(settings, {
        actorId: selectedActor.id,
        name: keyDraft.name.trim() || `${selectedActor.label} key`,
        mode: keyDraft.mode,
        quota: { limit, window: keyDraft.window }
      });
      setKeys((current) => [result.key, ...current.filter((key) => key.id !== result.key.id)]);
      setIssuedSecret({ keyId: result.key.id, secret: result.secret });
      setKeyDraft(DEFAULT_KEY_DRAFT);
      setStatus({
        kind: "success",
        message: "Actor key issued. Copy it now; it will not be shown again."
      });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function removeKey(key) {
    if (!window.confirm(`Revoke ${key.name}? This cannot be undone.`)) return;
    try {
      setLoading(true);
      await revokeActorKey(settings, key.id);
      setKeys((current) => current.filter((candidate) => candidate.id !== key.id));
      if (issuedSecret?.keyId === key.id) setIssuedSecret(null);
      setStatus({ kind: "success", message: `Revoked ${key.name}.` });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  }

  async function copySecret() {
    if (!issuedSecret?.secret) return;
    await navigator.clipboard.writeText(issuedSecret.secret);
    setStatus({ kind: "success", message: "Actor key copied." });
  }

  if (!settings.serverUrl) {
    return (
      <section className="panel server-actor-empty">
        <Server size={22} />
        <div>
          <h2>Server actor registry</h2>
          <p>Configure a StarIntel server in Settings to list tenant-scoped actors.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="server-actor-registry">
      <header className="section-heading server-actor-heading">
        <div>
          <h2>Server actor registry</h2>
          <p>Only actors visible to the authenticated tenant are returned by StarIntel.</p>
        </div>
        <button className="button small" type="button" disabled={loading} onClick={refreshCatalog}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <div className="server-actor-layout">
        <aside className="panel server-actor-list" aria-label="Tenant-visible actors">
          <div className="actor-browser-summary">
            <span>{actors.length} server actors</span>
            <span>tenant scoped</span>
          </div>
          {actors.map((actor) => (
            <button
              type="button"
              key={actor.id}
              className={actor.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(actor.id)}
            >
              <Server size={15} />
              <span>
                <strong>{actor.label}</strong>
                <small>{actor.id}</small>
              </span>
              <em>{actor.scope}</em>
            </button>
          ))}
          {!actors.length && <p className="muted">No actors are visible to this tenant.</p>}
        </aside>

        {selectedActor && configuration && (
          <div className="panel server-actor-detail">
            <div className="section-heading actor-editor-heading">
              <div>
                <h3>{selectedActor.label}</h3>
                <span>{selectedActor.id}</span>
              </div>
              <div className="button-row">
                <button className="button" type="button" disabled={loading} onClick={runSelected}>
                  <Play size={14} /> Start actor
                </button>
                <button
                  className="button primary"
                  type="button"
                  disabled={loading}
                  onClick={persistConfiguration}
                >
                  <Save size={14} /> Save configuration
                </button>
              </div>
            </div>

            <div className="server-actor-meta">
              <span>
                <ShieldCheck size={14} /> tenant {selectedActor.tenantId}
              </span>
              <span>{selectedActor.status}</span>
              <span>actor-config {configuration.schemaVersion}</span>
            </div>

            <label className="actor-runtime-toggle">
              <input
                type="checkbox"
                checked={configuration.enabled}
                onChange={(event) =>
                  setConfiguration((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
              <span>
                <strong>Enabled for this tenant</strong>
                <small>The configuration is persisted in StarIntel, not browser storage.</small>
              </span>
            </label>

            <label className="actor-code-field">
              <span>Persistent actor configuration (JSON)</span>
              <textarea
                className="actor-code-editor server-actor-config-editor"
                value={configurationText}
                spellCheck="false"
                onChange={(event) => setConfigurationText(event.target.value)}
              />
            </label>

            <section className="actor-access-section">
              <div className="section-heading">
                <div>
                  <h3>Actor keys and quotas</h3>
                  <p>
                    Keys authorize this actor only. One-run keys are consumed after one accepted
                    run.
                  </p>
                </div>
              </div>

              <div className="actor-quota-grid" aria-label="Effective actor quotas">
                {quotas.map((quota) => (
                  <article key={`${quotaScope(quota)}:${quota.id}`}>
                    <span>
                      {quota.plan} · {quotaScope(quota)}
                    </span>
                    <strong>{quotaLabel(quota)}</strong>
                    <small>
                      {quota.perSecond?.unlimited
                        ? "Unlimited request rate"
                        : quota.perSecond?.limit == null
                          ? "Custom request rate"
                          : `${quota.perSecond.remaining} of ${quota.perSecond.limit} requests available this second`}
                    </small>
                    {quota.monthly?.resetAt && (
                      <small>Monthly reset {formatDate(quota.monthly.resetAt)}</small>
                    )}
                    <small>{quota.policySchema}</small>
                  </article>
                ))}
                {!quotas.length && <p className="muted">Effective quota data is unavailable.</p>}
              </div>

              {issuedSecret && (
                <div className="actor-secret" role="status">
                  <KeyRound size={18} />
                  <div>
                    <strong>Copy this key now</strong>
                    <code>{issuedSecret.secret || "Secret missing from server response"}</code>
                    <small>
                      The secret is held only in this page session and cannot be retrieved later.
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={copySecret}
                    aria-label="Copy actor key"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setIssuedSecret(null)}
                    aria-label="Dismiss actor key"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              <form className="actor-key-form" onSubmit={issueKey}>
                <label>
                  <span>Name</span>
                  <input
                    value={keyDraft.name}
                    onChange={(event) =>
                      setKeyDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder={`${selectedActor.label} key`}
                  />
                </label>
                <label>
                  <span>Access</span>
                  <select
                    value={keyDraft.mode}
                    onChange={(event) =>
                      setKeyDraft((current) => ({ ...current, mode: event.target.value }))
                    }
                  >
                    <option value="one_run">One run</option>
                    <option value="persistent">Persistent</option>
                  </select>
                </label>
                <label>
                  <span>Run limit</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={keyDraft.limit}
                    onChange={(event) =>
                      setKeyDraft((current) => ({ ...current, limit: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Window</span>
                  <select
                    value={keyDraft.window}
                    onChange={(event) =>
                      setKeyDraft((current) => ({ ...current, window: event.target.value }))
                    }
                  >
                    <option value="lifetime">Lifetime</option>
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                    <option value="month">Month</option>
                  </select>
                </label>
                <button className="button" type="submit" disabled={loading}>
                  <KeyRound size={14} /> Issue key
                </button>
              </form>

              <div className="actor-key-list">
                {keys.map((key) => {
                  const quota = quotas.find((candidate) => candidate.keyId === key.id);
                  return (
                    <div key={key.id}>
                      <KeyRound size={15} />
                      <span>
                        <strong>{key.name}</strong>
                        <small>
                          {key.mode === "one_run" ? "one run" : "persistent"} · created{" "}
                          {formatDate(key.createdAt)}
                        </small>
                      </span>
                      <span className="actor-key-quota">
                        {quota ? quotaLabel(quota) : "Quota unavailable"}
                      </span>
                      <span className={`actor-key-state state-${key.status}`}>
                        {key.status === "active" ? <Check size={13} /> : null}
                        {key.status}
                      </span>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => removeKey(key)}
                        aria-label={`Revoke ${key.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                {!keys.length && <p className="muted">No actor keys have been issued.</p>}
              </div>
            </section>
          </div>
        )}
      </div>

      {status.message && (
        <div className={`actor-editor-status ${status.kind}`} role="status">
          {status.message}
        </div>
      )}
    </section>
  );
}
