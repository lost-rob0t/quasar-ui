const SECRET_PREFIX = "quasar:provider-secret:";

function persistentStorage() {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function legacyStorage() {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function key(providerId) {
  return `${SECRET_PREFIX}${providerId}`;
}

function migrate(providerId) {
  const name = key(providerId);
  const persistent = persistentStorage();
  const legacy = legacyStorage();
  if (!persistent || !legacy || persistent.getItem(name)) return;
  const value = legacy.getItem(name);
  if (!value) return;
  persistent.setItem(name, value);
  legacy.removeItem(name);
}

export function setProviderSecret(providerId, secret) {
  const value = String(secret || "");
  if (!value) throw new TypeError("Provider key is required");
  persistentStorage()?.setItem(key(providerId), value);
  legacyStorage()?.removeItem(key(providerId));
}

export function getProviderSecret(providerId) {
  migrate(providerId);
  return persistentStorage()?.getItem(key(providerId)) || "";
}

export function deleteProviderSecret(providerId) {
  persistentStorage()?.removeItem(key(providerId));
  legacyStorage()?.removeItem(key(providerId));
}

export function hasProviderSecret(providerId) {
  return Boolean(getProviderSecret(providerId));
}

export function maskSecret(secret) {
  const value = String(secret || "");
  if (!value) return "";
  return `••••••••${value.length > 4 ? value.slice(-4) : ""}`;
}
