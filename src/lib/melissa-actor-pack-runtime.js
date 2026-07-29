import { MELISSA_ACTORS as NORMALIZED_MELISSA_ACTORS } from "./melissa-actor-pack-normalized";
import { MELISSA_PERSONATOR_SEARCH_SOURCE } from "./melissa-personator-search";

export const MELISSA_ACTOR_PACK_VERSION = 5;

export const MELISSA_ACTORS = Object.freeze(
  NORMALIZED_MELISSA_ACTORS.map((actor) =>
    Object.freeze({
      ...actor,
      version: MELISSA_ACTOR_PACK_VERSION,
      source:
        actor.service === "personator-search" ? MELISSA_PERSONATOR_SEARCH_SOURCE : actor.source
    })
  )
);

export const MELISSA_ACTOR_IDS = Object.freeze(MELISSA_ACTORS.map((actor) => actor.id));

export function mergeMelissaActors(actors = []) {
  const ids = new Set(MELISSA_ACTOR_IDS);
  return [...actors.filter((actor) => !ids.has(actor?.id)), ...MELISSA_ACTORS];
}

export function removeMelissaActors(actors = []) {
  const ids = new Set(MELISSA_ACTOR_IDS);
  return actors.filter((actor) => !ids.has(actor?.id));
}
