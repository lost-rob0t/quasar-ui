const MAX_RESULTS = 20;
const MAX_CONTENT_BYTES = 1_000_000;
const MAX_TEXT_LENGTH = 100_000;

function publicHttpUrl(value) {
  const url = new URL(String(value || ""));
  if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("URL must use HTTP or HTTPS");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost"
    || host === "0.0.0.0"
    || host === "::1"
    || host.endsWith(".local")
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) throw new Error("Private network URLs are blocked");
  url.username = "";
  url.password = "";
  return url;
}

export async function braveWebSearch(query, {
  apiKey,
  count = 10,
  country = "us",
  freshness = "",
  signal
} = {}) {
  if (!apiKey) throw new Error("Brave Search key is missing");
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) throw new TypeError("Search query is required");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("count", String(Math.min(MAX_RESULTS, Math.max(1, Number(count) || 10))));
  if (country) url.searchParams.set("country", country);
  if (freshness) url.searchParams.set("freshness", freshness);
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey
    }
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Brave Search rejected the key");
    if (response.status === 429) throw new Error("Brave Search rate limit reached");
    throw new Error(`Brave Search failed (${response.status})`);
  }
  const data = await response.json();
  return {
    query: cleanQuery,
    results: (data.web?.results || []).slice(0, MAX_RESULTS).map((result) => ({
      title: result.title || "",
      url: result.url || "",
      description: result.description || "",
      age: result.age || null,
      language: result.language || null,
      profile: result.profile ? {
        name: result.profile.long_name || result.profile.name || "",
        url: result.profile.url || ""
      } : null
    }))
  };
}

function htmlText(html) {
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    document.querySelectorAll("script,style,noscript,template,svg,canvas").forEach((node) => node.remove());
    const title = document.querySelector("title")?.textContent?.trim() || "";
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const text = document.body?.textContent?.replace(/\s+/g, " ").trim() || "";
    return { title, description, text };
  }
  return {
    title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() || "",
    description: "",
    text: html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  };
}

export async function fetchUrlContent(value, { signal, maxBytes = MAX_CONTENT_BYTES } = {}) {
  const url = publicHttpUrl(value);
  const response = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.1" }
  });
  if (!response.ok) throw new Error(`URL fetch failed (${response.status})`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new RangeError(`URL content exceeds ${maxBytes} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new RangeError(`URL content exceeds ${maxBytes} bytes`);
  const contentType = response.headers.get("content-type") || "";
  const raw = new TextDecoder().decode(bytes);
  const parsed = /html|xhtml/i.test(contentType) ? htmlText(raw) : {
    title: "",
    description: "",
    text: raw
  };
  return {
    requestedUrl: url.href,
    finalUrl: response.url || url.href,
    contentType,
    bytes: bytes.byteLength,
    title: parsed.title,
    description: parsed.description,
    text: parsed.text.slice(0, MAX_TEXT_LENGTH),
    truncated: parsed.text.length > MAX_TEXT_LENGTH
  };
}

export const WEB_LIMITS = Object.freeze({
  maxResults: MAX_RESULTS,
  maxContentBytes: MAX_CONTENT_BYTES,
  maxTextLength: MAX_TEXT_LENGTH
});
