import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CachedVideo, CachedChannel, PendingVote } from "../cache";

// Use vi.resetModules + dynamic import to get a fresh dbInstance each test
let cache: typeof import("../cache");

beforeEach(async () => {
  vi.resetModules();
  cache = await import("../cache");
  // Clear all stores to ensure clean state
  await cache.clearVideos();
  await cache.clearChannels();
  await cache.clearPendingVotes();
});

const sampleVideo: CachedVideo = {
  videoId: "abc123",
  score: 75,
  categories: {
    fully_ai: { votes: 10, weightedScore: 80 },
    ai_voiceover: { votes: 3, weightedScore: 20 },
  },
  channelId: "ch001",
  lastUpdated: "2025-01-01T00:00:00Z",
};

const sampleChannel: CachedChannel = {
  channelId: "ch001",
  score: 60,
  autoFlag: false,
  lastUpdated: "2025-01-01T00:00:00Z",
};

describe("cache - videos", () => {
  it("putVideo and getVideo round-trip", async () => {
    await cache.putVideo(sampleVideo);
    const result = await cache.getVideo("abc123");
    expect(result).toEqual(sampleVideo);
  });

  it("getVideo returns undefined for missing key", async () => {
    const result = await cache.getVideo("nonexistent");
    expect(result).toBeUndefined();
  });

  it("putVideos and getVideos batch operations", async () => {
    const videos: CachedVideo[] = [
      { ...sampleVideo, videoId: "v1" },
      { ...sampleVideo, videoId: "v2" },
      { ...sampleVideo, videoId: "v3" },
    ];
    await cache.putVideos(videos);
    const results = await cache.getVideos(["v1", "v3"]);
    expect(results).toHaveLength(2);
    expect(results.map((v) => v.videoId).sort()).toEqual(["v1", "v3"]);
  });

  it("getVideos skips missing IDs", async () => {
    await cache.putVideo(sampleVideo);
    const results = await cache.getVideos(["abc123", "missing"]);
    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe("abc123");
  });

  it("putVideos with empty array is a no-op", async () => {
    await cache.putVideos([]);
    const count = await cache.getVideoCount();
    expect(count).toBe(0);
  });

  it("putVideo overwrites existing", async () => {
    await cache.putVideo(sampleVideo);
    const updated = { ...sampleVideo, score: 99 };
    await cache.putVideo(updated);
    const result = await cache.getVideo("abc123");
    expect(result?.score).toBe(99);
  });

  it("deleteVideo removes a video", async () => {
    await cache.putVideo(sampleVideo);
    await cache.deleteVideo("abc123");
    const result = await cache.getVideo("abc123");
    expect(result).toBeUndefined();
  });

  it("clearVideos removes all videos", async () => {
    await cache.putVideos([
      { ...sampleVideo, videoId: "v1" },
      { ...sampleVideo, videoId: "v2" },
    ]);
    await cache.clearVideos();
    const count = await cache.getVideoCount();
    expect(count).toBe(0);
  });

  it("getVideoCount returns correct count", async () => {
    expect(await cache.getVideoCount()).toBe(0);
    await cache.putVideos([
      { ...sampleVideo, videoId: "v1" },
      { ...sampleVideo, videoId: "v2" },
    ]);
    expect(await cache.getVideoCount()).toBe(2);
  });
});

describe("cache - channels", () => {
  it("putChannel and getChannel round-trip", async () => {
    await cache.putChannel(sampleChannel);
    const result = await cache.getChannel("ch001");
    expect(result).toEqual(sampleChannel);
  });

  it("getChannel returns undefined for missing key", async () => {
    const result = await cache.getChannel("missing");
    expect(result).toBeUndefined();
  });

  it("putChannels batch operation", async () => {
    await cache.putChannels([
      { ...sampleChannel, channelId: "c1" },
      { ...sampleChannel, channelId: "c2" },
    ]);
    expect(await cache.getChannelCount()).toBe(2);
  });

  it("deleteChannel removes a channel", async () => {
    await cache.putChannel(sampleChannel);
    await cache.deleteChannel("ch001");
    expect(await cache.getChannel("ch001")).toBeUndefined();
  });

  it("clearChannels removes all", async () => {
    await cache.putChannels([
      { ...sampleChannel, channelId: "c1" },
      { ...sampleChannel, channelId: "c2" },
    ]);
    await cache.clearChannels();
    expect(await cache.getChannelCount()).toBe(0);
  });
});

describe("cache - pendingVotes", () => {
  it("addPendingVote and getPendingVotes round-trip", async () => {
    const vote: PendingVote = {
      videoId: "v1",
      category: "fully_ai",
      timestamp: Date.now(),
    };
    await cache.addPendingVote(vote);
    const pending = await cache.getPendingVotes();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual(vote);
  });

  it("addPendingVote overwrites same videoId", async () => {
    await cache.addPendingVote({ videoId: "v1", category: "fully_ai", timestamp: 1000 });
    await cache.addPendingVote({ videoId: "v1", category: "ai_visuals", timestamp: 2000 });
    const pending = await cache.getPendingVotes();
    expect(pending).toHaveLength(1);
    expect(pending[0].category).toBe("ai_visuals");
  });

  it("removePendingVote removes by videoId", async () => {
    await cache.addPendingVote({ videoId: "v1", category: "fully_ai", timestamp: 1000 });
    await cache.addPendingVote({ videoId: "v2", category: "ai_visuals", timestamp: 2000 });
    await cache.removePendingVote("v1");
    const pending = await cache.getPendingVotes();
    expect(pending).toHaveLength(1);
    expect(pending[0].videoId).toBe("v2");
  });

  it("clearPendingVotes removes all", async () => {
    await cache.addPendingVote({ videoId: "v1", category: "fully_ai", timestamp: 1000 });
    await cache.addPendingVote({ videoId: "v2", category: "ai_visuals", timestamp: 2000 });
    await cache.clearPendingVotes();
    const pending = await cache.getPendingVotes();
    expect(pending).toHaveLength(0);
  });
});

describe("cache - meta", () => {
  it("setMeta and getMeta round-trip", async () => {
    await cache.setMeta("lastSync", "2025-01-01T00:00:00Z");
    const value = await cache.getMeta("lastSync");
    expect(value).toBe("2025-01-01T00:00:00Z");
  });

  it("getMeta returns undefined for missing key", async () => {
    const value = await cache.getMeta("nonexistent");
    expect(value).toBeUndefined();
  });

  it("setMeta overwrites existing key", async () => {
    await cache.setMeta("key1", "val1");
    await cache.setMeta("key1", "val2");
    expect(await cache.getMeta("key1")).toBe("val2");
  });
});
