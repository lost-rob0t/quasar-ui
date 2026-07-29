#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def regex_once(path: str, pattern: str, replacement, label: str) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    write(path, next_text)


# Keep the streaming browser path while supporting File-like test/legacy objects.
def add_jsonl_fallback(match: re.Match[str]) -> str:
    prefix = match.group("prefix")
    indent = match.group("indent")
    return prefix + f'''{indent}if (typeof file.stream !== "function" || typeof TextDecoderStream === "undefined") {{
{indent}  const text = await file.text();
{indent}  for (const [index, rawLine] of text.split(/\\r?\\n/).entries()) {{
{indent}    const line = index + 1;
{indent}    if (rawLine.length > limits.maxRecordBytes) {{
{indent}      throw new RangeError(`Record ${{line}} exceeds the import record limit`);
{indent}    }}
{indent}    if (!rawLine.trim()) continue;
{indent}    try {{
{indent}      documents.push(JSON.parse(rawLine));
{indent}      origins.push({{ file: sourceName, line, record: documents.length }});
{indent}    }} catch (error) {{
{indent}      if (errors.length < limits.maxErrors) {{
{indent}        errors.push({{ file: sourceName, line, message: error.message }});
{indent}      }}
{indent}    }}
{indent}    if (documents.length > limits.maxDocuments) {{
{indent}      throw new RangeError("Import document limit exceeded");
{indent}    }}
{indent}  }}
{indent}  return {{ documents, origins, errors }};
{indent}}}
{indent}const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();'''


regex_once(
    "src/lib/importer.js",
    r'(?P<prefix>async function parseJsonLines\(file, sourceName, limits\) \{.*?const errors = \[\];\n)(?P<indent>\s*)const reader = file\.stream\(\)\.pipeThrough\(new TextDecoderStream\(\)\)\.getReader\(\);',
    add_jsonl_fallback,
    "JSONL stream fallback"
)


def protect_trailing_record(match: re.Match[str]) -> str:
    indent = match.group("indent")
    return f'''{indent}if (buffer.trim()) {{
{indent}  line += 1;
{indent}  try {{
{indent}    documents.push(JSON.parse(buffer));
{indent}    origins.push({{ file: sourceName, line, record: documents.length }});
{indent}  }} catch (error) {{
{indent}    if (errors.length < limits.maxErrors) {{
{indent}      errors.push({{ file: sourceName, line, message: error.message }});
{indent}    }}
{indent}  }}
{indent}}}'''


regex_once(
    "src/lib/importer.js",
    r'(?P<indent>\s*)if \(buffer\.trim\(\)\) \{\s*line \+= 1;\s*documents\.push\(JSON\.parse\(buffer\)\);\s*origins\.push\(\{ file: sourceName, line, record: documents\.length \}\);\s*\}',
    protect_trailing_record,
    "JSONL trailing record error"
)

write("src/lib/agent-secrets.test.js", r'''import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteProviderSecret,
  getProviderSecret,
  hasProviderSecret,
  setProviderSecret
} from "./agent-secrets";

function memoryStorage() {
  const values = new Map();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.has(key) ? values.get(key) : null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  };
}

describe("agent secrets", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: memoryStorage()
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: memoryStorage()
    });
    for (const id of ["openrouter", "openai", "anthropic"]) deleteProviderSecret(id);
  });

  it("stores provider keys only for the browser session", () => {
    const provider = {
      type: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1"
    };
    setProviderSecret("openrouter", "secret-value", provider);

    const stored = JSON.parse(sessionStorage.getItem("quasar:provider-secret:openrouter"));
    expect(stored.value).toBe("secret-value");
    expect(localStorage.getItem("quasar:provider-secret:openrouter")).toBeNull();
    expect(getProviderSecret("openrouter", provider)).toBe("secret-value");
    expect(hasProviderSecret("openrouter", provider)).toBe(true);
  });

  it("does not release a key to a changed endpoint", () => {
    const reviewed = { type: "openai", baseUrl: "https://api.openai.com/v1" };
    setProviderSecret("openai", "scoped-key", reviewed);

    expect(getProviderSecret("openai", reviewed)).toBe("scoped-key");
    expect(getProviderSecret("openai", {
      type: "openai",
      baseUrl: "https://attacker.example/v1"
    })).toBe("");
  });

  it("purges legacy persistent copies", () => {
    localStorage.setItem("quasar:provider-secret:openai", "legacy-key");
    expect(getProviderSecret("openai")).toBe("");
    expect(localStorage.getItem("quasar:provider-secret:openai")).toBeNull();
  });

  it("deletes keys from both stores", () => {
    localStorage.setItem("quasar:provider-secret:anthropic", "local-key");
    sessionStorage.setItem("quasar:provider-secret:anthropic", "session-key");

    deleteProviderSecret("anthropic");

    expect(hasProviderSecret("anthropic")).toBe(false);
    expect(localStorage.getItem("quasar:provider-secret:anthropic")).toBeNull();
    expect(sessionStorage.getItem("quasar:provider-secret:anthropic")).toBeNull();
  });
});
''')

write("src/lib/agent-web.test.js", r'''import { afterEach, describe, expect, it, vi } from "vitest";
import { braveWebSearch, fetchUrlContent, scrapeWebsite } from "./agent-web";

const gatewayUrl = "https://gateway.example/api/v1/web/fetch";

afterEach(() => vi.restoreAllMocks());

describe("agent web tools", () => {
  it("normalizes Brave Search results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      web: { results: [{ title: "Example", url: "https://example.org/x", description: "Result" }] }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await braveWebSearch("test", { apiKey: "secret", count: 1 });
    expect(result.results).toEqual([expect.objectContaining({ title: "Example", url: "https://example.org/x" })]);
    expect(fetch.mock.calls[0][1].headers["X-Subscription-Token"]).toBe("secret");
  });

  it("reads bounded content returned by the trusted gateway", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      finalUrl: "https://example.org/page",
      contentType: "text/html",
      bytes: 42,
      title: "Page",
      text: "Hello world",
      links: []
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await fetchUrlContent("https://example.org/page", { gatewayUrl });
    expect(result.title).toBe("Page");
    expect(result.text).toContain("Hello world");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      url: "https://example.org/page"
    });
  });

  it("blocks literal private-network URLs before contacting the gateway", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    await expect(fetchUrlContent("http://127.0.0.1/admin", { gatewayUrl })).rejects.toThrow("Private network");
    expect(request).not.toHaveBeenCalled();
  });

  it("crawls bounded same-origin gateway results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_gateway, options) => {
      const request = JSON.parse(options.body);
      if (request.url.endsWith("/start")) {
        return new Response(JSON.stringify({
          finalUrl: request.url,
          contentType: "text/html",
          bytes: 80,
          title: "Start",
          text: "Start",
          links: ["https://example.org/next", "https://elsewhere.test/nope"]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        finalUrl: request.url,
        contentType: "text/html",
        bytes: 20,
        title: "Next",
        text: "Done",
        links: []
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await scrapeWebsite("https://example.org/start", {
      maxPages: 5,
      maxDepth: 1,
      gatewayUrl
    });
    expect(result.pages.map((page) => page.title)).toEqual(["Start", "Next"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
''')

regex_once(
    "src/lib/document-batch.test.js",
    r'  it\("reports any surviving write when compensating rollback fails", async \(\) => \{.*?\n  \}\);\n\n(?=  it\("reports a thrown storage failure)',
    '''  it("throws a repair-required error when compensating rollback fails", async () => {
    const survivorId = "starintel:org:survivor";
    const failedId = "starintel:org:failed";
    const database = new FakeDatabase({
      failWrites: [failedId],
      failRollbacks: [survivorId]
    });

    await expect(commitDocumentBatch(database, [
      canonicalDocument(survivorId),
      canonicalDocument(failedId)
    ])).rejects.toMatchObject({
      code: "PARTIAL_BATCH_COMMIT",
      report: {
        saved: [{ index: 0, id: survivorId, rev: `1-${survivorId}` }],
        rollbackAttempted: true
      }
    });

    expect(database.documents.has(survivorId)).toBe(true);
  });

''',
    "partial batch test contract"
)

Path("scripts/patch-audit-tests.py").unlink(missing_ok=True)
