import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all dependencies BEFORE importing background
vi.mock("../identity", () => ({
  getLocalId: vi.fn().mockResolvedValue("local-uuid-123"),
  getPublicUserId: vi.fn().mockResolvedValue("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"),
  hashVideoId: vi.fn().mockResolvedValue("ab12"),
}));

vi.mock("../api-client", () => ({
  getUserInfo: vi.fn(),
  lookupVideosByPrefix: vi.fn(),
  submitVote: vi.fn(),
  deleteVote: vi.fn(),
  syncDelta: vi.fn(),
  syncFull: vi.fn(),
}));

vi.mock("../cache", () => ({
  getVideos: vi.fn().mockResolvedValue([]),
  putVideo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../sync", () => ({
  startSyncSchedule: vi.fn(),
  performDeltaSync: vi.fn().mockResolvedValue({ videosUpdated: 0, videosRemoved: 0, channelsUpdated: 0, channelsRemoved: 0 }),
  performFullSync: vi.fn().mockResolvedValue({ videoCount: 0, channelCount: 0 }),
  getSyncStatus: vi.fn().mockResolvedValue({
    lastDeltaSync: "2025-01-01T00:00:00Z",
    lastFullSync: "2025-01-01T00:00:00Z",
    videoCount: 10,
    channelCount: 5,
  }),
}));

vi.mock("../offline-queue", () => ({
  enqueueVote: vi.fn().mockResolvedValue(undefined),
  flushPendingVotes: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
  startOfflineQueueListener: vi.fn(),
  getPendingVoteCount: vi.fn().mockResolvedValue(0),
}));

type MessageHandler = (
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) => boolean | undefined;

let messageHandler: MessageHandler;

beforeEach(async () => {
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock("../identity", () => ({
    getLocalId: vi.fn().mockResolvedValue("local-uuid-123"),
    getPublicUserId: vi.fn().mockResolvedValue("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"),
    hashVideoId: vi.fn().mockResolvedValue("ab12"),
  }));
  vi.doMock("../api-client", () => ({
    getUserInfo: vi.fn(),
    lookupVideosByPrefix: vi.fn().mockResolvedValue([]),
    submitVote: vi.fn(),
    deleteVote: vi.fn(),
    syncDelta: vi.fn(),
    syncFull: vi.fn(),
  }));
  vi.doMock("../cache", () => ({
    getVideos: vi.fn().mockResolvedValue([]),
    putVideo: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock("../sync", () => ({
    startSyncSchedule: vi.fn(),
    performDeltaSync: vi.fn().mockResolvedValue({ videosUpdated: 0, videosRemoved: 0, channelsUpdated: 0, channelsRemoved: 0 }),
    performFullSync: vi.fn().mockResolvedValue({ videoCount: 0, channelCount: 0 }),
    getSyncStatus: vi.fn().mockResolvedValue({
      lastDeltaSync: "2025-01-01T00:00:00Z",
      lastFullSync: "2025-01-01T00:00:00Z",
      videoCount: 10,
      channelCount: 5,
    }),
  }));
  vi.doMock("../offline-queue", () => ({
    enqueueVote: vi.fn().mockResolvedValue(undefined),
    flushPendingVotes: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
    startOfflineQueueListener: vi.fn(),
    getPendingVoteCount: vi.fn().mockResolvedValue(0),
  }));

  // Import background (triggers IIFE + registers listener)
  await import("../background");

  // Capture the message listener that was registered
  const listeners = chrome.runtime.onMessage._listeners;
  expect(listeners.length).toBeGreaterThan(0);
  messageHandler = listeners[listeners.length - 1] as MessageHandler;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sendMsg(
  message: any,
  sender: Partial<chrome.runtime.MessageSender> = {}
): Promise<any> {
  return new Promise((resolve) => {
    const fullSender: chrome.runtime.MessageSender = {
      id: chrome.runtime.id,
      ...sender,
    };
    messageHandler(message, fullSender, resolve);
  });
}

describe("message router - sender validation", () => {
  it("rejects messages from external senders", async () => {
    const response = await new Promise((resolve) => {
      messageHandler(
        { type: "GET_STATUS" },
        { id: "other-extension-id" } as chrome.runtime.MessageSender,
        resolve
      );
    });

    expect(response).toEqual({
      success: false,
      error: "Unauthorized sender",
    });
  });

  it("blocks GET_USER_ID from content scripts (sender.tab is set)", async () => {
    const response = await sendMsg(
      { type: "GET_USER_ID" },
      { tab: { id: 1 } as chrome.tabs.Tab }
    );

    expect(response).toEqual({
      success: false,
      error: "Not available from content scripts",
    });
  });

  it("blocks GET_USER_INFO from content scripts", async () => {
    const response = await sendMsg(
      { type: "GET_USER_INFO" },
      { tab: { id: 1 } as chrome.tabs.Tab }
    );

    expect(response).toEqual({
      success: false,
      error: "Not available from content scripts",
    });
  });

  it("allows GET_USER_ID from extension pages (no sender.tab)", async () => {
    const response = await sendMsg({ type: "GET_USER_ID" });
    expect(response.success).toBe(true);
    expect(response.data.userId).toBe(
      "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    );
  });
});

describe("message router - SUBMIT_VOTE", () => {
  it("delegates to api.submitVote on success", async () => {
    const apiMod = await import("../api-client");
    (apiMod.submitVote as any).mockResolvedValue({
      success: true,
      newScore: 75,
      userTrust: 50,
    });

    const response = await sendMsg({
      type: "SUBMIT_VOTE",
      payload: { videoId: "v1", category: "fully_ai" },
    });

    expect(response.success).toBe(true);
    expect(response.data).toEqual({
      success: true,
      newScore: 75,
      userTrust: 50,
    });
  });

  it("queues vote offline on network failure", async () => {
    const apiMod = await import("../api-client");
    const offlineMod = await import("../offline-queue");
    (apiMod.submitVote as any).mockRejectedValue(new Error("Network failure"));

    const response = await sendMsg({
      type: "SUBMIT_VOTE",
      payload: { videoId: "v1", category: "fully_ai" },
    });

    expect(response.success).toBe(true);
    expect(response.data.queued).toBe(true);
    expect(offlineMod.enqueueVote).toHaveBeenCalledWith("v1", "fully_ai");
  });
});

describe("message router - other types", () => {
  it("GET_SYNC_STATUS returns sync info", async () => {
    const response = await sendMsg({ type: "GET_SYNC_STATUS" });
    expect(response.success).toBe(true);
    expect(response.data.videoCount).toBe(10);
  });

  it("GET_STATUS returns version and status info", async () => {
    const response = await sendMsg({ type: "GET_STATUS" });
    expect(response.success).toBe(true);
    expect(response.data.version).toBe("0.1.0");
    expect(response.data.hasLocalId).toBe(true);
  });

  it("unknown message type returns error", async () => {
    const response = await sendMsg({ type: "UNKNOWN_TYPE" });
    expect(response.success).toBe(false);
    expect(response.error).toContain("Unknown message type");
  });

  it("SYNC_DELTA delegates to performDeltaSync", async () => {
    const syncMod = await import("../sync");
    const response = await sendMsg({ type: "SYNC_DELTA" });
    expect(response.success).toBe(true);
    expect(syncMod.performDeltaSync).toHaveBeenCalled();
  });

  it("FLUSH_PENDING_VOTES delegates to flushPendingVotes", async () => {
    const offlineMod = await import("../offline-queue");
    const response = await sendMsg({ type: "FLUSH_PENDING_VOTES" });
    expect(response.success).toBe(true);
    expect(offlineMod.flushPendingVotes).toHaveBeenCalled();
  });
});
