import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock chrome.storage.sync.get to return as a Promise (api-client uses it)
// The module registers an onChanged listener at import time, so we import fresh.

let apiClient: typeof import("../api-client");

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Reset the module to clear cachedBaseUrl
  vi.resetModules();
  apiClient = await import("../api-client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getConfig (via API calls)", () => {
  it("uses default base URL when storage is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ userId: "u1", trustScore: 50, totalVotes: 10, accuracyRate: 0.9, accountAge: 30, isVip: false }), { status: 200 })
    );

    await apiClient.getUserInfo("user1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8080/api/users/user1",
      expect.anything()
    );
  });

  it("uses custom URL from storage", async () => {
    chrome.storage.sync.set({ serverUrl: "https://api.realtube.io" });

    vi.resetModules();
    apiClient = await import("../api-client");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await apiClient.lookupVideosByPrefix("abcd");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.realtube.io/api/videos/abcd",
      expect.anything()
    );
  });

  it("rejects non-https non-localhost URLs and falls back to default", async () => {
    chrome.storage.sync.set({ serverUrl: "http://evil.com/api" });

    vi.resetModules();
    apiClient = await import("../api-client");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await apiClient.lookupVideosByPrefix("abcd");

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8080/api/videos/abcd",
      expect.anything()
    );
  });
});

describe("fetchWithRetry (via API calls)", () => {
  it("retries on network error and eventually succeeds", async () => {
    let attempt = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempt++;
      if (attempt < 3) throw new Error("Network error");
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const result = await apiClient.lookupVideosByPrefix("abcd");
    expect(result).toEqual([]);
    expect(attempt).toBe(3);
  });

  it("retries on 429 with exponential backoff", async () => {
    let attempt = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempt++;
      if (attempt < 3) {
        return new Response("", { status: 429, headers: {} });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const result = await apiClient.lookupVideosByPrefix("abcd");
    expect(result).toEqual([]);
    expect(attempt).toBe(3);
  });

  it("retries on 429 using Retry-After header", async () => {
    let attempt = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        return new Response("", {
          status: 429,
          headers: { "Retry-After": "2" },
        });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const result = await apiClient.lookupVideosByPrefix("abcd");
    expect(result).toEqual([]);
    expect(attempt).toBe(2);
  });

  it("does not retry on 4xx errors (except 429)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 })
    );

    const result = await apiClient.lookupVideosByPrefix("abcd");
    expect(result).toEqual([]); // lookupVideosByPrefix returns [] on 404
  });

  it("throws after exhausting retries on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

    await expect(apiClient.lookupVideosByPrefix("abcd")).rejects.toThrow("Offline");
  }, 15_000);
});

describe("API methods", () => {
  it("submitVote sends correct request body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, newScore: 75, userTrust: 50 }), { status: 200 })
    );

    const result = await apiClient.submitVote({
      videoId: "vid1",
      category: "fully_ai",
      userId: "user1",
      userAgent: "RealTube/0.1.0",
    });

    expect(result).toEqual({ success: true, newScore: 75, userTrust: 50 });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/votes"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: "vid1",
          category: "fully_ai",
          userId: "user1",
          userAgent: "RealTube/0.1.0",
        }),
      })
    );
  });

  it("submitVote throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Bad request" } }), { status: 400 })
    );

    await expect(
      apiClient.submitVote({
        videoId: "vid1",
        category: "fully_ai",
        userId: "user1",
        userAgent: "RealTube/0.1.0",
      })
    ).rejects.toThrow("Bad request");
  });

  it("deleteVote sends correct request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 })
    );

    await apiClient.deleteVote("vid1", "user1");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/votes"),
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ videoId: "vid1", userId: "user1" }),
      })
    );
  });

  it("syncDelta sends since parameter", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ videos: [], channels: [], syncTimestamp: "2025-01-01T00:00:00Z" }),
        { status: 200 }
      )
    );

    await apiClient.syncDelta("2025-01-01T00:00:00Z");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/sync/delta?since=2025-01-01T00%3A00%3A00Z"),
      expect.anything()
    );
  });

  it("syncFull returns full data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ videos: [], channels: [], generatedAt: "2025-01-01T00:00:00Z" }),
        { status: 200 }
      )
    );

    const result = await apiClient.syncFull();
    expect(result.generatedAt).toBe("2025-01-01T00:00:00Z");
  });

  it("lookupVideosByPrefix returns empty array on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404 })
    );

    const result = await apiClient.lookupVideosByPrefix("abcd");
    expect(result).toEqual([]);
  });
});
