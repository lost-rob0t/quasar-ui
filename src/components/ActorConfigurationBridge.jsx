import { useEffect, useMemo, useState } from "react";
import { Save, Settings2, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  clearActorConfiguration,
  loadActorConfiguration,
  saveActorConfiguration
} from "../lib/actor-configuration";
import { useQuasar } from "../store";

function actorSettingsPanel() {
  return (
    [...document.querySelectorAll("section.panel")].find((section) =>
      section
        .querySelector(":scope > .section-heading > h2")
        ?.textContent?.trim()
        .startsWith("Browser actors")
    ) || null
  );
}

function createHost(panel) {
  if (!panel) return null;
  const existing = panel.querySelector(":scope > .actor-configuration-host");
  if (existing) return existing;
  const host = document.createElement("div");
  host.className = "actor-configuration-host";
  const actorList = panel.querySelector(":scope > .actor-list");
  panel.insertBefore(host, actorList || null);
  return host;
}

export default function ActorConfigurationBridge() {
  const location = useLocation();
  const { actors = [], setNotice } = useQuasar();
  const [host, setHost] = useState(null);
  const [selectedActorId, setSelectedActorId] = useState("");
  const [jsonText, setJsonText] = useState("{}");

  const selectedActor = useMemo(
    () => actors.find((actor) => actor.id === selectedActorId) || actors[0] || null,
    [actors, selectedActorId]
  );

  useEffect(() => {
    if (location.pathname !== "/settings") {
      setHost(null);
      return undefined;
    }
    const sync = () => setHost(createHost(actorSettingsPanel()));
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, [location.pathname]);

  useEffect(
    () => () => {
      if (host?.isConnected) host.remove();
    },
    [host]
  );

  useEffect(() => {
    if (!selectedActor) {
      setSelectedActorId("");
      setJsonText("{}");
      return;
    }
    if (selectedActor.id !== selectedActorId) {
      setSelectedActorId(selectedActor.id);
    }
    setJsonText(JSON.stringify(loadActorConfiguration(selectedActor), null, 2));
  }, [selectedActor, selectedActorId]);

  function chooseActor(event) {
    setSelectedActorId(event.target.value);
  }

  function saveJson() {
    if (!selectedActor) return;
    try {
      const parsed = JSON.parse(jsonText || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError("Actor configuration must be a JSON object");
      }
      const saved = saveActorConfiguration(selectedActor, parsed);
      setJsonText(JSON.stringify(saved, null, 2));
      setNotice({
        kind: "success",
        message: `Configuration saved for ${selectedActor.label || selectedActor.id}`
      });
    } catch (error) {
      setNotice({ kind: "error", message: error.message });
    }
  }

  function clearJson() {
    if (!selectedActor) return;
    clearActorConfiguration(selectedActor);
    setJsonText("{}");
    setNotice({
      kind: "success",
      message: `Configuration cleared for ${selectedActor.label || selectedActor.id}`
    });
  }

  if (location.pathname !== "/settings" || !host) return null;

  return createPortal(
    <div className="actor-configuration-panel">
      <div className="section-heading">
        <div>
          <h2>
            <Settings2 size={18} /> Actor configuration
          </h2>
          <p className="muted">
            Browser actor configuration stays local and is passed to browser actor code as{" "}
            <code>context.configuration</code>. Server-side actor credentials are configured on the
            Quasar backend.
          </p>
        </div>
      </div>

      <div className="actor-config-group">
        <div className="section-heading">
          <div>
            <h3>Browser actor configuration</h3>
            <p className="muted">Store arbitrary JSON for bundled or custom browser actors.</p>
          </div>
        </div>
        <label className="field">
          <span>Actor</span>
          <select value={selectedActor?.id || ""} onChange={chooseActor} disabled={!actors.length}>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.label || actor.id} — {actor.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Configuration JSON</span>
          <textarea
            className="code-editor"
            rows={8}
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            disabled={!selectedActor}
          />
        </label>
        <div className="button-row">
          <button
            className="button primary"
            type="button"
            onClick={saveJson}
            disabled={!selectedActor}
          >
            <Save size={15} /> Save actor configuration
          </button>
          <button
            className="button danger"
            type="button"
            onClick={clearJson}
            disabled={!selectedActor}
          >
            <Trash2 size={15} /> Clear
          </button>
        </div>
      </div>
    </div>,
    host
  );
}
