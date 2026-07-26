import { afterEach, describe, expect, it, vi } from "vitest";
import { braveWebSearch, fetchUrlContent, scrapeWebsite } from "./agent-web";

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

  it("extracts bounded URL content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html><title>Page</title><body>Hello <b>world</b></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" }
    }));
    const result = await fetchUrlContent("https://example.org/page");
    expect(result.title).toBe("Page");
    expect(result.text).toContain("Hello world");
  });

  it("blocks private-network URLs", async () => {
    await expect(fetchUrlContent("http://127.0.0.1/admin")).rejects.toThrow("Private network");
  });

  it("crawls a bounded same-origin website", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.endsWith("/start")) {
        return new Response('<html><title>Start</title><body><a href="/next">Next</a><a href="https://elsewhere.test/nope">External</a></body></html>', {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      }
      return new Response("<html><title>Next</title><body>Done</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    });
    const result = await scrapeWebsite("https://example.org/start", { maxPages: 5, maxDepth: 1 });
    expect(result.pages.map((page) => page.title)).toEqual(["Start", "Next"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
