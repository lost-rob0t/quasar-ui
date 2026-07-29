import { useEffect, useRef } from "react";
import {
  installMelissaActorPack,
  MELISSA_ACTOR_PACK_VERSION
} from "../lib/melissa-actor-installation";
import { installMelissaFetchInterceptor } from "../lib/melissa-browser-config";
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
    const installation = installMelissaActorPack(settings);
    const complete = installation.actors.every(
      (actor) =>
        !String(actor.id || "").startsWith("quasar.actor.melissa-") || installedIds.has(actor.id)
    );
    if (complete && settings.melissaActorPackVersion === MELISSA_ACTOR_PACK_VERSION) return;

    installingRef.current = true;
    persistSettings(installation)
      .catch((error) => setNotice({ kind: "error", message: error.message }))
      .finally(() => {
        installingRef.current = false;
      });
  }, [persistSettings, setNotice, settings]);

  return null;
}
