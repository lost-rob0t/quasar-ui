import { ExternalLink, Layers3, MapPinned, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export const DEFAULT_MAP_SERVICE_URL = "/maps/";

export function mapEmbedUrl(serviceUrl = DEFAULT_MAP_SERVICE_URL) {
  const value = String(serviceUrl || DEFAULT_MAP_SERVICE_URL).trim() || DEFAULT_MAP_SERVICE_URL;
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}embed=1`;
}

export default function MapPage({
  serviceUrl = import.meta.env.VITE_STARINTEL_MAP_URL || DEFAULT_MAP_SERVICE_URL
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const embedUrl = useMemo(() => mapEmbedUrl(serviceUrl), [serviceUrl]);

  return (
    <section className="map-workspace" data-map-service={serviceUrl}>
      <iframe
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
            <small>Computable geo knowledge</small>
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
