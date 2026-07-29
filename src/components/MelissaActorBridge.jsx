import { useEffect, useRef } from "react";
import { installMelissaFetchInterceptor } from "../lib/melissa-browser-config";
import { MELISSA_ACTOR_PACK_VERSION, mergeMelissaActors } from "../lib/melissa-actor-pack-runtime";
import { useQuasar } from "../store";

export default function MelissaActorBridge() {
  const { settings, persistSettings, setNotice } = useQuasar();
  const installingRef = useRef(false);

  useEffect(() => {
    installMelissaFetchInterceptor();
  }, []);

  useEffect(() => {
    if (!settings || installingRef.current || settings.melissaActorPackInstalled === false) return;
    const installedIds = new Set((settings.actors || []).map((actor) => actor.id));
    const merged = mergeMelissaActors(settings.actors || []);
    const complete = merged.every(
      (actor) =>
        !String(actor.id || "").startsWith("quasar.actor.melissa-") || installedIds.has(actor.id)
    );
    if (complete && settings.melissaActorPackVersion === MELISSA_ACTOR_PACK_VERSION) return;

    installingRef.current = true;
    persistSettings({
      actors: merged,
      actorsEnabled: true,
      melissaActorPackInstalled: true,
      melissaActorPackVersion: MELISSA_ACTOR_PACK_VERSION
    })
      .catch((error) => setNotice({ kind: "error", message: error.message }))
      .finally(() => {
        installingRef.current = false;
      });
  }, [persistSettings, setNotice, settings]);

  return null;
}
