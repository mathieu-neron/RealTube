import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let offlineQueue: typeof import("../offline-queue");
let cacheMod: typeof import("../cache");
let mockSubmitVote: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetModules();

  // Set up mocks before importing offline-queue
  mockSubmitVote = vi.fn();
  vi.doMock("../api-client", () => ({
    submitVote: mockSubmitVote,
  }));
  vi.doMock("../identity", () => ({
    getPublicUserId: vi.fn().mockResolvedValue("hashed-user-id-abc"),
  }));

  cacheMod = await import("../cache");
  // Clear all stores
  await cacheMod.clearVideos();
  await cacheMod.clearChannels();
  await cacheMod.clearPendingVotes();

  offlineQueue = await import("../offline-queue");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("enqueueVote", () => {
  it("stores vote in IndexedDB with timestamp", async () => {
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
    await offlineQueue.enqueueVote("v1", "fully_ai");

    const pending = await cacheMod.getPendingVotes();
    expect(pending).toHaveLength(1);
    expect(pending[0].videoId).toBe("v1");
    expect(pending[0].category).toBe("fully_ai");
    expect(pending[0].timestamp).toBe(new Date("2025-06-01T12:00:00Z").getTime());
  });
});

describe("getPendingVoteCount", () => {
  it("returns count of pending votes", async () => {
    expect(await offlineQueue.getPendingVoteCount()).toBe(0);
    await offlineQueue.enqueueVote("v1", "fully_ai");
    await offlineQueue.enqueueVote("v2", "ai_visuals");
    expect(await offlineQueue.getPendingVoteCount()).toBe(2);
  });
});

describe("flushPendingVotes", () => {
  it("flushes pending votes and removes them from cache on success", async () => {
    mockSubmitVote.mockResolvedValue({ success: true, newScore: 50, userTrust: 40 });

    await offlineQueue.enqueueVote("v1", "fully_ai");
    await offlineQueue.enqueueVote("v2", "ai_visuals");

    const result = await offlineQueue.flushPendingVotes();
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);

    const remaining = await cacheMod.getPendingVotes();
    expect(remaining).toHaveLength(0);
  });

  it("drops votes older than 7 days", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await cacheMod.addPendingVote({ videoId: "old", category: "fully_ai", timestamp: eightDaysAgo });
    await offlineQueue.enqueueVote("new", "ai_visuals");

    mockSubmitVote.mockResolvedValue({ success: true, newScore: 50, userTrust: 40 });

    const result = await offlineQueue.flushPendingVotes();
    // "old" was dropped, "new" was sent
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    const remaining = await cacheMod.getPendingVotes();
    expect(remaining).toHaveLength(0);
  });

  it("stops on first failure", async () => {
    let callCount = 0;
    mockSubmitVote.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Network failure");
      return { success: true, newScore: 50, userTrust: 40 };
    });

    await offlineQueue.enqueueVote("v1", "fully_ai");
    await offlineQueue.enqueueVote("v2", "ai_visuals");

    const result = await offlineQueue.flushPendingVotes();
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(callCount).toBe(1);
  });

  it("concurrent flush guard prevents parallel flushes", async () => {
    let resolveVote: (() => void) | null = null;
    mockSubmitVote.mockImplementation(
      () => new Promise<void>((resolve) => { resolveVote = resolve; })
    );

    await offlineQueue.enqueueVote("v1", "fully_ai");

    // Start first flush
    const flush1 = offlineQueue.flushPendingVotes();

    // Need to let the first flush start executing (get past the isFlushing check)
    await vi.advanceTimersByTimeAsync(0);

    // Second flush should return immediately due to guard
    const result2 = await offlineQueue.flushPendingVotes();
    expect(result2).toEqual({ sent: 0, failed: 0 });

    // Resolve the first flush
    resolveVote!();
    await flush1;
  });

  it("returns zero counts when queue is empty", async () => {
    const result = await offlineQueue.flushPendingVotes();
    expect(result).toEqual({ sent: 0, failed: 0 });
  });
});
