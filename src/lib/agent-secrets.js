const SECRET_PREFIX = "quasar:provider-secret:";

function storage() {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

export function setProviderSecret(providerId, secret) {
  const value = String(secret || "");
  if (!value) throw new TypeError("Provider key is required");
  storage()?.setItem(`${SECRET_PREFIX}${providerId}`, value);
}

export function getProviderSecret(providerId) {
  return storage()?.getItem(`${SECRET_PREFIX}${providerId}`) || "";
}

export function deleteProviderSecret(providerId) {
  storage()?.removeItem(`${SECRET_PREFIX}${providerId}`);
}

export function hasProviderSecret(providerId) {
  return Boolean(getProviderSecret(providerId));
}

export function maskSecret(secret) {
  const value = String(secret || "");
  if (!value) return "";
  return `••••••••${value.length > 4 ? value.slice(-4) : ""}`;
}
