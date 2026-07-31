export function normalizeDatasetScope(value) {
  const dataset = String(value || "").trim();
  if (!dataset || dataset === "complete-corpus") return null;
  return dataset;
}

function datasetFromSearch(search = "") {
  return normalizeDatasetScope(new URLSearchParams(search).get("dataset"));
}

export function datasetScopeFromUrls({ search = "", referrer = "", origin = "" } = {}) {
  const direct = datasetFromSearch(search);
  if (direct) return direct;
  if (!referrer) return null;

  try {
    const referrerUrl = new URL(referrer, origin || undefined);
    if (origin && referrerUrl.origin !== origin) return null;
    return datasetFromSearch(referrerUrl.search);
  } catch {
    return null;
  }
}

export function currentDatasetScope() {
  return datasetScopeFromUrls({
    search: globalThis.location?.search || "",
    referrer: globalThis.document?.referrer || "",
    origin: globalThis.location?.origin || ""
  });
}

export function resolveDatasetScope(requestedDataset, urlDataset = currentDatasetScope()) {
  return normalizeDatasetScope(urlDataset) || normalizeDatasetScope(requestedDataset);
}
