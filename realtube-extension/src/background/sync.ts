// Sync logic: delta sync (every 30 min), full refresh (every 24 hours)
// Design: infrastructure-design.md section 12 (Sync Schedule)

import * as cache from "./cache";
import * as api from "./api-client";

const DELTA_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const META_LAST_DELTA_SYNC = "lastDeltaSync";
const META_LAST_FULL_SYNC = "lastFullSync";

let syncTimer: ReturnType<typeof setInterval> | null = null;
let startupSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** Perform a delta sync: fetch changes since last sync timestamp. */
export async function performDeltaSync(): Promise<{
  videosUpdated: number;
  videosRemoved: number;
  channelsUpdated: number;
  channelsRemoved: number;
}> {
  const lastSync = await cache.getMeta(META_LAST_DELTA_SYNC);
  const since = lastSync || new Date(0).toISOString();

  console.log(`RealTube sync: delta since ${since}`);

  let data: api.SyncDeltaResponse;
  try {
    data = await api.syncDelta(since);
  } catch (err) {
    if (err instanceof Error && err.message.includes("429")) {
      console.warn("RealTube sync: delta rate-limited, will retry next cycle");
      return { videosUpdated: 0, videosRemoved: 0, channelsUpdated: 0, channelsRemoved: 0 };
    }
    throw err;
  }

  let videosUpdated = 0;
  let videosRemoved = 0;
  let channelsUpdated = 0;
  let channelsRemoved = 0;

  // Apply video changes
  const videosToUpsert: cache.CachedVideo[] = [];
  for (const video of data.videos) {
    if (video.action === "remove") {
      await cache.deleteVideo(video.videoId);
      videosRemoved++;
    } else if (video.action === "update" && video.score !== undefined && video.categories) {
      videosToUpsert.push({
        videoId: video.videoId,
        score: video.score,
        categories: video.categories,
        channelId: "",
        lastUpdated: data.syncTimestamp,
      });
      videosUpdated++;
    }
  }
  await cache.putVideos(videosToUpsert);

  // Apply channel changes
  const channelsToUpsert: cache.CachedChannel[] = [];
  for (const channel of data.channels) {
    if (channel.action === "remove") {
      await cache.deleteChannel(channel.channelId);
      channelsRemoved++;
    } else if (channel.action === "update" && channel.score !== undefined) {
      channelsToUpsert.push({
        channelId: channel.channelId,
        score: channel.score,
        autoFlag: false,
        lastUpdated: data.syncTimestamp,
      });
      channelsUpdated++;
    }
  }
  await cache.putChannels(channelsToUpsert);

  // Update last sync timestamp
  await cache.setMeta(META_LAST_DELTA_SYNC, data.syncTimestamp);

  console.log(
    `RealTube sync: delta complete — ${videosUpdated} videos updated, ${videosRemoved} removed, ${channelsUpdated} channels updated, ${channelsRemoved} removed`
  );

  return { videosUpdated, videosRemoved, channelsUpdated, channelsRemoved };
}

/** Perform a full cache rebuild from the server. */
export async function performFullSync(): Promise<{
  videoCount: number;
  channelCount: number;
}> {
  console.log("RealTube sync: full refresh starting");

  let data: api.SyncFullResponse;
  try {
    data = await api.syncFull();
  } catch (err) {
    if (err instanceof Error && err.message.includes("429")) {
      console.warn("RealTube sync: full sync rate-limited, will retry next cycle");
      return { videoCount: 0, channelCount: 0 };
    }
    throw err;
  }

  // Clear existing cache
  await cache.clearVideos();
  await cache.clearChannels();

  // Populate videos
  const videos: cache.CachedVideo[] = data.videos.map((v) => ({
    videoId: v.videoId,
    score: v.score,
    categories: v.categories,
    channelId: v.channelId,
    lastUpdated: v.lastUpdated,
  }));
  await cache.putVideos(videos);

  // Populate channels
  const channels: cache.CachedChannel[] = data.channels.map((c) => ({
    channelId: c.channelId,
    score: c.score,
    autoFlag: false,
    lastUpdated: c.lastUpdated,
  }));
  await cache.putChannels(channels);

  // Update timestamps
  const now = data.generatedAt || new Date().toISOString();
  await cache.setMeta(META_LAST_FULL_SYNC, now);
  await cache.setMeta(META_LAST_DELTA_SYNC, now);

  console.log(
    `RealTube sync: full refresh complete — ${videos.length} videos, ${channels.length} channels`
  );

  return { videoCount: videos.length, channelCount: channels.length };
}

/** Determine whether we need a full sync or delta sync and execute. */
async function autoSync(): Promise<void> {
  try {
    const lastFull = await cache.getMeta(META_LAST_FULL_SYNC);
    const needsFullSync =
      !lastFull ||
      Date.now() - new Date(lastFull).getTime() > FULL_SYNC_INTERVAL_MS;

    if (needsFullSync) {
      await performFullSync();
    } else {
      await performDeltaSync();
    }
  } catch (err) {
    console.error("RealTube sync: error during auto-sync", err);
  }
}

/** Start the periodic sync schedule. */
export function startSyncSchedule(): void {
  if (syncTimer) return;

  // Debounce the initial sync — cancel any pending startup sync from a previous call
  if (startupSyncTimer) clearTimeout(startupSyncTimer);
  startupSyncTimer = setTimeout(() => {
    startupSyncTimer = null;
    autoSync();
  }, 5000);

  // Schedule periodic delta syncs
  syncTimer = setInterval(() => autoSync(), DELTA_SYNC_INTERVAL_MS);

  console.log("RealTube sync: schedule started (delta every 30min, full every 24h)");
}

/** Stop the periodic sync schedule. */
export function stopSyncSchedule(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("RealTube sync: schedule stopped");
  }
}

/** Get sync status info for the popup. */
export async function getSyncStatus(): Promise<{
  lastDeltaSync: string | undefined;
  lastFullSync: string | undefined;
  videoCount: number;
  channelCount: number;
}> {
  const lastDeltaSync = await cache.getMeta(META_LAST_DELTA_SYNC);
  const lastFullSync = await cache.getMeta(META_LAST_FULL_SYNC);
  const videoCount = await cache.getVideoCount();
  const channelCount = await cache.getChannelCount();
  return { lastDeltaSync, lastFullSync, videoCount, channelCount };
}
