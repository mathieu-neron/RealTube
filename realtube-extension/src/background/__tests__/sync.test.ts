import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let sync: typeof import("../sync");
let cacheMod: typeof import("../cache");
let apiMod: { syncDelta: ReturnType<typeof vi.fn>; syncFull: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  vi.resetModules();

  // Mock api-client before importing sync (which imports it)
  const mockSyncDelta = vi.fn();
  const mockSyncFull = vi.fn();
  vi.doMock("../api-client", () => ({
    syncDelta: mockSyncDelta,
    syncFull: mockSyncFull,
  }));
  apiMod = { syncDelta: mockSyncDelta, syncFull: mockSyncFull };

  cacheMod = await import("../cache");
  // Clear all stores including meta
  await cacheMod.clearVideos();
  await cacheMod.clearChannels();
  await cacheMod.clearPendingVotes();
  // No clearMeta export — clear via IDB directly
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("realtube", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").clear();
  await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  db.close();

  sync = await import("../sync");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("performDeltaSync", () => {
  it("applies video updates and removals", async () => {
    // Pre-populate a video that will be removed
    await cacheMod.putVideo({
      videoId: "remove-me",
      score: 50,
      categories: {},
      channelId: "ch1",
      lastUpdated: "2025-01-01T00:00:00Z",
    });

    apiMod.syncDelta.mockResolvedValue({
      videos: [
        {
          videoId: "new-vid",
          score: 80,
          categories: { fully_ai: { votes: 5, weightedScore: 80 } },
          action: "update",
        },
        { videoId: "remove-me", action: "remove" },
      ],
      channels: [],
      syncTimestamp: "2025-06-01T00:00:00Z",
    });

    const result = await sync.performDeltaSync();
    expect(result.videosUpdated).toBe(1);
    expect(result.videosRemoved).toBe(1);

    const newVid = await cacheMod.getVideo("new-vid");
    expect(newVid?.score).toBe(80);

    const removed = await cacheMod.getVideo("remove-me");
    expect(removed).toBeUndefined();
  });

  it("applies channel updates and removals", async () => {
    await cacheMod.putChannel({
      channelId: "remove-ch",
      score: 40,
      autoFlag: false,
      lastUpdated: "2025-01-01T00:00:00Z",
    });

    apiMod.syncDelta.mockResolvedValue({
      videos: [],
      channels: [
        { channelId: "new-ch", score: 70, action: "update" },
        { channelId: "remove-ch", action: "remove" },
      ],
      syncTimestamp: "2025-06-01T00:00:00Z",
    });

    const result = await sync.performDeltaSync();
    expect(result.channelsUpdated).toBe(1);
    expect(result.channelsRemoved).toBe(1);

    expect(await cacheMod.getChannel("new-ch")).toBeDefined();
    expect(await cacheMod.getChannel("remove-ch")).toBeUndefined();
  });

  it("uses epoch timestamp for first-ever sync", async () => {
    apiMod.syncDelta.mockResolvedValue({
      videos: [],
      channels: [],
      syncTimestamp: "2025-06-01T00:00:00Z",
    });

    await sync.performDeltaSync();

    expect(apiMod.syncDelta).toHaveBeenCalledWith(new Date(0).toISOString());
  });

  it("uses stored timestamp for subsequent syncs", async () => {
    await cacheMod.setMeta("lastDeltaSync", "2025-05-01T00:00:00Z");

    apiMod.syncDelta.mockResolvedValue({
      videos: [],
      channels: [],
      syncTimestamp: "2025-06-01T00:00:00Z",
    });

    await sync.performDeltaSync();

    expect(apiMod.syncDelta).toHaveBeenCalledWith("2025-05-01T00:00:00Z");
  });

  it("updates lastDeltaSync meta after successful sync", async () => {
    apiMod.syncDelta.mockResolvedValue({
      videos: [],
      channels: [],
      syncTimestamp: "2025-06-01T12:00:00Z",
    });

    await sync.performDeltaSync();

    const meta = await cacheMod.getMeta("lastDeltaSync");
    expect(meta).toBe("2025-06-01T12:00:00Z");
  });

  it("handles 429 gracefully without throwing", async () => {
    apiMod.syncDelta.mockRejectedValue(
      new Error("Sync delta failed: 429")
    );

    const result = await sync.performDeltaSync();
    expect(result).toEqual({
      videosUpdated: 0,
      videosRemoved: 0,
      channelsUpdated: 0,
      channelsRemoved: 0,
    });
  });

  it("re-throws non-429 errors", async () => {
    apiMod.syncDelta.mockRejectedValue(
      new Error("Sync delta failed: 500")
    );

    await expect(sync.performDeltaSync()).rejects.toThrow("500");
  });
});

describe("performFullSync", () => {
  it("clears cache and repopulates with server data", async () => {
    await cacheMod.putVideo({
      videoId: "old-vid",
      score: 10,
      categories: {},
      channelId: "ch1",
      lastUpdated: "2025-01-01T00:00:00Z",
    });

    apiMod.syncFull.mockResolvedValue({
      videos: [
        {
          videoId: "fresh-vid",
          score: 90,
          categories: { fully_ai: { votes: 20, weightedScore: 90 } },
          channelId: "fresh-ch",
          lastUpdated: "2025-06-01T00:00:00Z",
        },
      ],
      channels: [
        {
          channelId: "fresh-ch",
          score: 85,
          totalVideos: 100,
          flaggedVideos: 50,
          lastUpdated: "2025-06-01T00:00:00Z",
        },
      ],
      generatedAt: "2025-06-01T00:00:00Z",
    });

    const result = await sync.performFullSync();
    expect(result.videoCount).toBe(1);
    expect(result.channelCount).toBe(1);

    expect(await cacheMod.getVideo("old-vid")).toBeUndefined();
    const freshVid = await cacheMod.getVideo("fresh-vid");
    expect(freshVid?.score).toBe(90);
  });

  it("updates both meta timestamps", async () => {
    apiMod.syncFull.mockResolvedValue({
      videos: [],
      channels: [],
      generatedAt: "2025-06-15T00:00:00Z",
    });

    await sync.performFullSync();

    expect(await cacheMod.getMeta("lastFullSync")).toBe("2025-06-15T00:00:00Z");
    expect(await cacheMod.getMeta("lastDeltaSync")).toBe("2025-06-15T00:00:00Z");
  });

  it("handles 429 gracefully", async () => {
    apiMod.syncFull.mockRejectedValue(
      new Error("Sync full failed: 429")
    );

    const result = await sync.performFullSync();
    expect(result).toEqual({ videoCount: 0, channelCount: 0 });
  });
});

describe("getSyncStatus", () => {
  it("returns sync timestamps and counts", async () => {
    await cacheMod.setMeta("lastDeltaSync", "2025-06-01T00:00:00Z");
    await cacheMod.setMeta("lastFullSync", "2025-05-01T00:00:00Z");
    await cacheMod.putVideo({
      videoId: "v1",
      score: 50,
      categories: {},
      channelId: "ch1",
      lastUpdated: "2025-06-01T00:00:00Z",
    });

    const status = await sync.getSyncStatus();
    expect(status.lastDeltaSync).toBe("2025-06-01T00:00:00Z");
    expect(status.lastFullSync).toBe("2025-05-01T00:00:00Z");
    expect(status.videoCount).toBe(1);
    expect(status.channelCount).toBe(0);
  });

  it("returns undefined timestamps when none set", async () => {
    const status = await sync.getSyncStatus();
    expect(status.lastDeltaSync).toBeUndefined();
    expect(status.lastFullSync).toBeUndefined();
  });
});
