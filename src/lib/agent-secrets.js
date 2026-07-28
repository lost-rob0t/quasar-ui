const SECRET_PREFIX = "quasar:provider-secret:";
const memory = new Map();

function sessionStorageBackend() {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function legacyPersistentStorage() {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function key(providerId) {
  return `${SECRET_PREFIX}${providerId}`;
}

function purgeLegacy(providerId) {
  legacyPersistentStorage()?.removeItem(key(providerId));
}

export function setProviderSecret(providerId, secret) {
  const value = String(secret || "");
  if (!value) throw new TypeError("Provider key is required");

  const name = key(providerId);
  purgeLegacy(providerId);
  memory.set(name, value);
  sessionStorageBackend()?.setItem(name, value);
}

export function getProviderSecret(providerId) {
  const name = key(providerId);
  purgeLegacy(providerId);
  return sessionStorageBackend()?.getItem(name) || memory.get(name) || "";
}

export function deleteProviderSecret(providerId) {
  const name = key(providerId);
  memory.delete(name);
  sessionStorageBackend()?.removeItem(name);
  purgeLegacy(providerId);
}

export function hasProviderSecret(providerId) {
  return Boolean(getProviderSecret(providerId));
}

export function maskSecret(secret) {
  const value = String(secret || "");
  if (!value) return "";
  return `••••••••${value.length > 4 ? value.slice(-4) : ""}`;
}
