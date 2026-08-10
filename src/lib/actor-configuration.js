export const ACTOR_CONFIGURATION_STORAGE_KEY = "quasar:actor-configuration:v1";

function storage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function objectConfiguration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function readRegistry() {
  try {
    const raw = storage()?.getItem(ACTOR_CONFIGURATION_STORAGE_KEY);
    return objectConfiguration(raw ? JSON.parse(raw) : {});
  } catch {
    return {};
  }
}

function writeRegistry(registry) {
  storage()?.setItem(ACTOR_CONFIGURATION_STORAGE_KEY, JSON.stringify(registry));
}

export function actorConfigurationId(actor) {
  return String(actor?.id || "").trim();
}

export function loadActorConfiguration(actor) {
  const id = actorConfigurationId(actor);
  return objectConfiguration(readRegistry()[id]);
}

export function saveActorConfiguration(actor, value) {
  const normalized = objectConfiguration(value);
  const id = actorConfigurationId(actor);
  if (!id) throw new TypeError("Actor id is required for configuration");
  const registry = readRegistry();
  registry[id] = normalized;
  writeRegistry(registry);
  return normalized;
}

export function clearActorConfiguration(actor) {
  const id = actorConfigurationId(actor);
  if (!id) return;
  const registry = readRegistry();
  delete registry[id];
  writeRegistry(registry);
}

export function actorConfigurationDefinition(actor) {
  return {
    id: actorConfigurationId(actor),
    label: actor?.label || actor?.id || "Actor",
    description:
      actor?.description ||
      "JSON configuration passed to the browser actor as context.configuration.",
    fields: [],
    defaults: {}
  };
}

export function actorConfigurationStatus(actor) {
  return {
    configured: true,
    missing: [],
    configuration: loadActorConfiguration(actor)
  };
}
