import { ExternalLink, Layers3, MapPinned, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export const DEFAULT_MAP_SERVICE_URL = "/maps/";
export const GOTHAM_MAP_PROFILE = "gotham";
export const MAP_SEMANTICS_VERSION = "starintel.geo/1";
export const MAP_PRESENTATION_MODES = Object.freeze([
  Object.freeze({ id: "sparse", label: "Sparse" }),
  Object.freeze({ id: "investigation", label: "Investigation" }),
  Object.freeze({ id: "detective", label: "Detective" })
]);
export const GEO_PARTICIPATION_KINDS = Object.freeze([
  Object.freeze({ id: "direct", label: "Direct geometry" }),
  Object.freeze({ id: "anchored", label: "Anchored projection" }),
  Object.freeze({ id: "derived", label: "Derived projection" })
]);

const MAP_PRESENTATION_MODE_IDS = new Set(MAP_PRESENTATION_MODES.map(({ id }) => id));

export function normalizeMapMode(value) {
  const normalized = String(value || "").trim();
  return MAP_PRESENTATION_MODE_IDS.has(normalized) ? normalized : "sparse";
}

export function normalizeTemporalCursor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function withQueryParams(value, entries) {
  const hashIndex = value.indexOf("#");
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = beforeHash.indexOf("?");
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);

  for (const [name, entryValue] of entries) params.set(name, String(entryValue));

  const serialized = params.toString();
  return `${path}${serialized ? `?${serialized}` : ""}${hash}`;
}

export function mapEmbedUrl(serviceUrl = DEFAULT_MAP_SERVICE_URL) {
  const value = String(serviceUrl || DEFAULT_MAP_SERVICE_URL).trim() || DEFAULT_MAP_SERVICE_URL;
  return withQueryParams(value, [
    ["embed", 1],
    ["profile", GOTHAM_MAP_PROFILE]
  ]);
}

export function buildMapControlMessage({ mode, temporalCursor, playing } = {}) {
  return {
    type: "STARINTEL_MAP_CONTROL",
    version: 1,
    profile: GOTHAM_MAP_PROFILE,
    semanticsVersion: MAP_SEMANTICS_VERSION,
    mode: normalizeMapMode(mode),
    temporalCursor: normalizeTemporalCursor(temporalCursor),
    playing: Boolean(playing)
  };
}

function rendererOrigin(embedUrl) {
  if (typeof window === "undefined") return null;
  try {
    return new URL(embedUrl, window.location.href).origin;
  } catch {
    return null;
  }
}

export default function MapPage({
  serviceUrl = import.meta.env.VITE_STARINTEL_MAP_URL || DEFAULT_MAP_SERVICE_URL
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState("sparse");
  const [temporalCursor, setTemporalCursor] = useState(100);
  const [playing, setPlaying] = useState(false);
  const rendererRef = useRef(null);
  const embedUrl = useMemo(() => mapEmbedUrl(serviceUrl), [serviceUrl]);
  const controlMessage = useMemo(
    () => buildMapControlMessage({ mode, temporalCursor, playing }),
    [mode, temporalCursor, playing]
  );

  useEffect(() => {
    if (!playing || typeof window === "undefined") return undefined;

    const timer = window.setInterval(() => {
      setTemporalCursor((current) => {
        if (current >= 100) {
          setPlaying(false);
          return 100;
        }
        return Math.min(100, current + 2);
      });
    }, 750);

    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (!loaded || !rendererRef.current?.contentWindow) return;
    const targetOrigin = rendererOrigin(embedUrl);
    if (!targetOrigin) return;
    rendererRef.current.contentWindow.postMessage(controlMessage, targetOrigin);
  }, [controlMessage, embedUrl, loaded]);

  const togglePlayback = () => {
    if (!playing && temporalCursor >= 100) setTemporalCursor(0);
    setPlaying((current) => !current);
  };

  return (
    <section
      className="map-workspace"
      data-map-service={serviceUrl}
      data-map-profile={GOTHAM_MAP_PROFILE}
      data-map-semantics-version={MAP_SEMANTICS_VERSION}
      data-map-mode={mode}
      data-map-temporal-cursor={temporalCursor}
    >
      <iframe
        ref={rendererRef}
        className="map-renderer"
        src={embedUrl}
        title="StarIntel map"
        referrerPolicy="same-origin"
        onLoad={() => {
          setLoaded(true);
          setFailed(false);
        }}
        onError={() => setFailed(true)}
      />

      {!loaded && !failed && (
        <div className="map-loading" role="status">
          Opening StarIntel map…
        </div>
      )}

      {failed && (
        <div className="map-error" role="alert">
          <strong>Map service unavailable</strong>
          <span>Quasar could not open the configured StarIntel map renderer.</span>
        </div>
      )}

      <header className="map-overlay map-overlay-primary" aria-label="Map workspace status">
        <div className="map-title">
          <MapPinned size={17} aria-hidden="true" />
          <span>
            <strong>StarIntel Map</strong>
            <small>Gotham profile · computable geo knowledge</small>
          </span>
        </div>
        <div className="map-badges" aria-label="Map data state">
          <span>
            <Layers3 size={13} aria-hidden="true" />
            promoted layers
          </span>
          <span>
            <ShieldCheck size={13} aria-hidden="true" />
            provenance retained
          </span>
        </div>
      </header>

      <aside className="map-overlay map-overlay-controls" aria-label="Gotham map controls">
        <div className="map-control-section">
          <div className="map-control-heading">
            <strong>Presentation</strong>
            <small>Semantics stay explicit</small>
          </div>
          <div className="map-mode-group" role="group" aria-label="Map presentation mode">
            {MAP_PRESENTATION_MODES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={mode === id ? "active" : ""}
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="map-control-section map-timeline-control">
          <label htmlFor="map-temporal-cursor">
            <span>Timeline</span>
            <output htmlFor="map-temporal-cursor">{temporalCursor}%</output>
          </label>
          <div className="map-timeline-row">
            <input
              id="map-temporal-cursor"
              aria-label="Temporal cursor"
              type="range"
              min="0"
              max="100"
              step="1"
              value={temporalCursor}
              onChange={(event) => {
                setPlaying(false);
                setTemporalCursor(normalizeTemporalCursor(event.target.value));
              }}
            />
            <button type="button" className="map-playback-button" onClick={togglePlayback}>
              {playing ? "Pause" : "Play"}
            </button>
          </div>
          <small>Normalized history → present cursor sent to the renderer.</small>
        </div>
      </aside>

      <aside className="map-overlay map-overlay-legend" aria-label="Map semantic grammar">
        <div className="map-control-heading">
          <strong>Geo evidence</strong>
          <small>Presentation never upgrades evidence</small>
        </div>
        <ul className="map-participation-legend" aria-label="Geo participation semantics">
          {GEO_PARTICIPATION_KINDS.map(({ id, label }) => (
            <li key={id}>
              <span
                className={`map-participation-sample map-participation-${id}`}
                aria-hidden="true"
              />
              {label}
            </li>
          ))}
        </ul>
        <ul className="map-edge-legend" aria-label="Relation evidence semantics">
          <li>
            <span className="map-edge-sample map-edge-asserted" aria-hidden="true" />
            Asserted relation
          </li>
          <li>
            <span className="map-edge-sample map-edge-inferred" aria-hidden="true" />
            Inferred relation
          </li>
          <li>
            <span className="map-edge-sample map-edge-candidate" aria-hidden="true" />
            Candidate relation
          </li>
        </ul>
        <div className="map-signal-legend">
          <span>
            <i className="map-signal map-signal-uncertain" aria-hidden="true" />
            Uncertainty halo
          </span>
          <span>
            <i className="map-signal map-signal-recent" aria-hidden="true" />
            Recent-event pulse
          </span>
          <span>
            <i className="map-signal map-signal-movement" aria-hidden="true" />
            Movement trail
          </span>
          <span className="map-state-chip map-state-chip-approximate">
            Approximate geometry
          </span>
          <span className="map-state-chip">Stale</span>
          <span className="map-state-chip map-state-chip-contested">Contested</span>
        </div>
      </aside>

      <aside className="map-overlay map-overlay-source" aria-label="Map service">
        <span className="map-source-label">Renderer</span>
        <code>{serviceUrl}</code>
        <a href={serviceUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={13} aria-hidden="true" />
          Open renderer
        </a>
      </aside>
    </section>
  );
}
