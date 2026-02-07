// RealTube Background Service Worker
// Message hub: routes messages from content script, popup, and options page

import { getLocalId, getPublicUserId, hashVideoId } from "./identity";
import * as api from "./api-client";
import * as cache from "./cache";
import { startSyncSchedule, performDeltaSync, performFullSync, getSyncStatus } from "./sync";

// Message types for inter-component communication
export type MessageType =
  | "GET_USER_ID"
  | "GET_USER_INFO"
  | "LOOKUP_VIDEOS"
  | "SUBMIT_VOTE"
  | "DELETE_VOTE"
  | "GET_STATUS"
  | "CHECK_VIDEOS"
  | "SYNC_DELTA"
  | "SYNC_FULL"
  | "GET_SYNC_STATUS";

export interface Message {
  type: MessageType;
  payload?: unknown;
}

export interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Cached public user ID (expensive to compute, so cache it)
let cachedPublicUserId: string | null = null;

async function ensurePublicUserId(): Promise<string> {
  if (!cachedPublicUserId) {
    cachedPublicUserId = await getPublicUserId();
  }
  return cachedPublicUserId;
}

// Message handler
async function handleMessage(
  message: Message
): Promise<MessageResponse> {
  switch (message.type) {
    case "GET_USER_ID": {
      const userId = await ensurePublicUserId();
      return { success: true, data: { userId } };
    }

    case "GET_USER_INFO": {
      const userId = await ensurePublicUserId();
      const info = await api.getUserInfo(userId);
      return { success: true, data: info };
    }

    case "CHECK_VIDEOS": {
      // Cache-first lookup: check IndexedDB first, API for misses
      const { videoIds } = message.payload as { videoIds: string[] };
      const cached = await cache.getVideos(videoIds);
      const cachedIds = new Set(cached.map((v) => v.videoId));
      const misses = videoIds.filter((id) => !cachedIds.has(id));

      // For cache misses, batch lookup via API using hash prefixes
      const apiResults: api.VideoResult[] = [];
      if (misses.length > 0) {
        const prefixMap = new Map<string, string[]>();
        for (const videoId of misses) {
          const prefix = await hashVideoId(videoId, 4);
          if (!prefixMap.has(prefix)) {
            prefixMap.set(prefix, []);
          }
          prefixMap.get(prefix)!.push(videoId);
        }

        const lookups = Array.from(prefixMap.keys()).map(async (prefix) => {
          try {
            const videos = await api.lookupVideosByPrefix(prefix);
            const requestedIds = new Set(prefixMap.get(prefix)!);
            for (const video of videos) {
              if (requestedIds.has(video.videoId)) {
                apiResults.push(video);
                // Cache the result
                await cache.putVideo({
                  videoId: video.videoId,
                  score: video.score,
                  categories: video.categories,
                  channelId: video.channelId,
                  lastUpdated: video.lastUpdated,
                });
              }
            }
          } catch (err) {
            console.error(`RealTube: prefix lookup failed for ${prefix}`, err);
          }
        });
        await Promise.all(lookups);
      }

      // Merge cached and API results
      const allVideos = [
        ...cached,
        ...apiResults.map((v) => ({
          videoId: v.videoId,
          score: v.score,
          categories: v.categories,
          channelId: v.channelId,
          lastUpdated: v.lastUpdated,
        })),
      ];

      return { success: true, data: { videos: allVideos } };
    }

    case "LOOKUP_VIDEOS": {
      const { videoIds } = message.payload as { videoIds: string[] };
      const prefixMap = new Map<string, string[]>();
      for (const videoId of videoIds) {
        const prefix = await hashVideoId(videoId, 4);
        if (!prefixMap.has(prefix)) {
          prefixMap.set(prefix, []);
        }
        prefixMap.get(prefix)!.push(videoId);
      }

      const results: api.VideoResult[] = [];
      const lookups = Array.from(prefixMap.keys()).map(async (prefix) => {
        const videos = await api.lookupVideosByPrefix(prefix);
        const requestedIds = new Set(prefixMap.get(prefix)!);
        for (const video of videos) {
          if (requestedIds.has(video.videoId)) {
            results.push(video);
          }
        }
      });
      await Promise.all(lookups);

      return { success: true, data: { videos: results } };
    }

    case "SUBMIT_VOTE": {
      const { videoId, category } = message.payload as {
        videoId: string;
        category: string;
      };
      const userId = await ensurePublicUserId();
      const result = await api.submitVote({
        videoId,
        category,
        userId,
        userAgent: `RealTube/0.1.0 ${navigator.userAgent}`,
      });
      return { success: true, data: result };
    }

    case "DELETE_VOTE": {
      const { videoId } = message.payload as { videoId: string };
      const userId = await ensurePublicUserId();
      await api.deleteVote(videoId, userId);
      return { success: true };
    }

    case "SYNC_DELTA": {
      const result = await performDeltaSync();
      return { success: true, data: result };
    }

    case "SYNC_FULL": {
      const result = await performFullSync();
      return { success: true, data: result };
    }

    case "GET_SYNC_STATUS": {
      const status = await getSyncStatus();
      return { success: true, data: status };
    }

    case "GET_STATUS": {
      const localId = await getLocalId();
      const syncStatus = await getSyncStatus();
      return {
        success: true,
        data: {
          version: "0.1.0",
          hasLocalId: !!localId,
          ...syncStatus,
        },
      };
    }

    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// Listen for messages from content script, popup, and options page
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        console.error("RealTube background error:", err);
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    // Return true to indicate async response
    return true;
  }
);

// Initialization
(async () => {
  console.log("RealTube background worker started");
  // Pre-generate and cache the public user ID on startup
  const userId = await ensurePublicUserId();
  console.log(`RealTube: public user ID ready (${userId.substring(0, 8)}...)`);
  // Start periodic sync schedule
  startSyncSchedule();
})();
