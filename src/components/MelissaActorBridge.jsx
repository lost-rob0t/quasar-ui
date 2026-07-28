import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, RefreshCw, Save, Settings2, Trash2, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  clearMelissaConfig,
  DEFAULT_MELISSA_CONFIG,
  installMelissaFetchInterceptor,
  loadMelissaConfig,
  saveMelissaConfig
} from "../lib/melissa-browser-config";
import {
  MELISSA_ACTOR_IDS,
  MELISSA_ACTOR_PACK_VERSION,
  mergeMelissaActors,
  removeMelissaActors
} from "../lib/melissa-actor-pack";
import { useQuasar } from "../store";

function maskSecret(value) {
  const secret = String(value || "");
  if (!secret) return "Not configured";
  return `••••••••${secret.length > 4 ? secret.slice(-4) : ""}`;
}

function numberValue(event) {
  return event.target.value === "" ? "" : Number(event.target.value);
}

export default function MelissaActorBridge() {
  const location = useLocation();
  const { settings, persistSettings, setNotice } = useQuasar();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => loadMelissaConfig());
  const installingRef = useRef(false);

  const installedCount = useMemo(() => {
    const ids = new Set((settings?.actors || []).map((actor) => actor.id));
    return MELISSA_ACTOR_IDS.filter((id) => ids.has(id)).length;
  }, [settings?.actors]);
  const packInstalled = installedCount === MELISSA_ACTOR_IDS.length;

  useEffect(() => {
    installMelissaFetchInterceptor();
  }, []);

  useEffect(() => {
    if (!settings || installingRef.current || settings.melissaActorPackInstalled === false) return;
    if (packInstalled && settings.melissaActorPackVersion === MELISSA_ACTOR_PACK_VERSION) return;
    installingRef.current = true;
    persistSettings({
      actors: mergeMelissaActors(settings.actors || []),
      actorsEnabled: true,
      melissaActorPackInstalled: true,
      melissaActorPackVersion: MELISSA_ACTOR_PACK_VERSION
    })
      .catch((error) => setNotice({ kind: "error", message: error.message }))
      .finally(() => { installingRef.current = false; });
  }, [packInstalled, persistSettings, setNotice, settings]);

  useEffect(() => {
    if (open) setForm(loadMelissaConfig());
  }, [open]);

  const update = (key) => (event) => setForm((current) => ({
    ...current,
    [key]: event.target.type === "number" ? numberValue(event) : event.target.value
  }));

  async function installPack() {
    try {
      await persistSettings({
        actors: mergeMelissaActors(settings?.actors || []),
        actorsEnabled: true,
        melissaActorPackInstalled: true,
        melissaActorPackVersion: MELISSA_ACTOR_PACK_VERSION
      });
      setNotice({ kind: "success", message: `Installed ${MELISSA_ACTOR_IDS.length} Melissa actors` });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  async function uninstallPack() {
    try {
      await persistSettings({
        actors: removeMelissaActors(settings?.actors || []),
        melissaActorPackInstalled: false,
        melissaActorPackVersion: 0
      });
      setNotice({ kind: "success", message: "Removed Melissa actors; browser credentials were kept" });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function saveConfiguration() {
    try {
      const saved = saveMelissaConfig(form);
      setForm(saved);
      setNotice({
        kind: saved.licenseKey ? "success" : "warning",
        message: saved.licenseKey
          ? "Melissa configuration saved in this browser"
          : "Melissa options saved, but a license key is still required"
      });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function clearConfiguration() {
    clearMelissaConfig();
    setForm({ ...DEFAULT_MELISSA_CONFIG });
    setNotice({ kind: "success", message: "Cleared Melissa credentials and configuration from this browser" });
  }

  if (location.pathname !== "/settings") return null;

  return (
    <>
      <button className="melissa-config-launcher" type="button" onClick={() => setOpen(true)}>
        <Settings2 size={17} /> Melissa actors
        <span>{installedCount}/{MELISSA_ACTOR_IDS.length}</span>
      </button>

      {open && (
        <div className="melissa-config-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="melissa-config-dialog" role="dialog" aria-modal="true" aria-labelledby="melissa-config-title">
            <div className="melissa-config-heading">
              <div>
                <span className="eyebrow">Browser actor pack</span>
                <h2 id="melissa-config-title">Melissa configuration</h2>
                <p>Credentials stay in local browser storage. Actor manifests stay in Quasar settings and survive reloads.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close Melissa configuration" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="melissa-pack-status">
              <div>
                <strong>{packInstalled ? "Actor pack installed" : "Actor pack incomplete"}</strong>
                <span>{installedCount} of {MELISSA_ACTOR_IDS.length} actors · key {maskSecret(form.licenseKey)}</span>
              </div>
              <button className="button" type="button" onClick={installPack}>
                <RefreshCw size={15} /> {packInstalled ? "Refresh pack" : "Install pack"}
              </button>
            </div>

            <div className="melissa-config-grid">
              <label className="field full">
                <span>Melissa license key</span>
                <div className="melissa-secret-field">
                  <KeyRound size={16} />
                  <input type="password" value={form.licenseKey || ""} onChange={update("licenseKey")} autoComplete="off" placeholder="License or customer ID" />
                </div>
              </label>
              <label className="field">
                <span>Transmission reference</span>
                <input value={form.transmissionReference || ""} onChange={update("transmissionReference")} placeholder="Quasar" />
              </label>
              <label className="field">
                <span>Default country</span>
                <input value={form.defaultCountry || "US"} onChange={update("defaultCountry")} maxLength={3} placeholder="US" />
              </label>
              <label className="field">
                <span>Consumer action</span>
                <select value={form.consumerAction || "Check"} onChange={update("consumerAction")}>
                  {['Check', 'Verify', 'Append', 'Move'].map((action) => <option key={action}>{action}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Identity action</span>
                <select value={form.identityAction || "Check"} onChange={update("identityAction")}>
                  {['Check', 'Screen'].map((action) => <option key={action}>{action}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Search record limit</span>
                <input type="number" min="1" max="100" value={form.maxRecords ?? 10} onChange={update("maxRecords")} />
              </label>
              <label className="field">
                <span>Search match level</span>
                <input type="number" min="1" max="10" value={form.matchLevel ?? 10} onChange={update("matchLevel")} />
              </label>
              <label className="field">
                <span>Reverse distance</span>
                <input type="number" min="1" max="100" value={form.reverseDistance ?? 10} onChange={update("reverseDistance")} />
              </label>
              <label className="field">
                <span>Reverse record limit</span>
                <input type="number" min="1" max="100" value={form.reverseRecords ?? 10} onChange={update("reverseRecords")} />
              </label>
            </div>

            <details className="melissa-advanced">
              <summary>Advanced service options</summary>
              <div className="melissa-config-grid">
                <label className="field full"><span>Personator Consumer options</span><input value={form.consumerOptions || ""} onChange={update("consumerOptions")} /></label>
                <label className="field full"><span>Personator Consumer columns</span><input value={form.consumerColumns || ""} onChange={update("consumerColumns")} /></label>
                <label className="field full"><span>Personator Search columns</span><input value={form.personatorColumns || ""} onChange={update("personatorColumns")} /></label>
                <label className="field full"><span>Global Address options</span><input value={form.addressOptions || ""} onChange={update("addressOptions")} /></label>
                <label className="field full"><span>Global Name options</span><input value={form.nameOptions || ""} onChange={update("nameOptions")} /></label>
                <label className="field full"><span>Global Phone options</span><input value={form.phoneOptions || ""} onChange={update("phoneOptions")} /></label>
                <label className="field full"><span>Global Email options</span><input value={form.emailOptions || ""} onChange={update("emailOptions")} /></label>
                <label className="field full"><span>Global IP columns</span><input value={form.ipColumns || ""} onChange={update("ipColumns")} /></label>
                <label className="field full">
                  <span>CORS proxy template</span>
                  <input value={form.proxyTemplate || ""} onChange={update("proxyTemplate")} placeholder="https://proxy.example/fetch?url={url}" />
                  <small>Optional. Must contain <code>{'{url}'}</code>. The encoded Melissa request is substituted at runtime.</small>
                </label>
              </div>
            </details>

            <div className="melissa-config-actions">
              <div className="button-row">
                <button className="button primary" type="button" onClick={saveConfiguration}><Save size={15} /> Save locally</button>
                <button className="button" type="button" onClick={clearConfiguration}><Trash2 size={15} /> Clear browser key</button>
              </div>
              <button className="button danger" type="button" onClick={uninstallPack}><Trash2 size={15} /> Remove actor pack</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
