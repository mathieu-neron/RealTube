// Offline vote queue: stores votes in IndexedDB when offline, flushes on reconnect
// Design: extension-design.md section 4.2, infrastructure-design.md section 12

import * as cache from "./cache";
import * as api from "./api-client";
import type { VoteRequest } from "./api-client";
import { getPublicUserId } from "./identity";

const FLUSH_RETRY_DELAY_MS = 30_000; // 30 seconds between flush retries
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

/** Check if the browser appears to be online. */
function isOnline(): boolean {
  return navigator.onLine;
}

/** Queue a vote for later submission. */
export async function enqueueVote(videoId: string, category: string): Promise<void> {
  await cache.addPendingVote({
    videoId,
    category,
    timestamp: Date.now(),
  });
  console.log(`RealTube: vote queued offline for ${videoId}`);
  // Try flushing soon in case we're actually online
  scheduleFlush(5_000);
}

/** Attempt to flush all pending votes to the server. */
export async function flushPendingVotes(): Promise<{ sent: number; failed: number }> {
  if (isFlushing) return { sent: 0, failed: 0 };
  isFlushing = true;

  let sent = 0;
  let failed = 0;

  try {
    const pending = await cache.getPendingVotes();
    if (pending.length === 0) return { sent: 0, failed: 0 };

    console.log(`RealTube: flushing ${pending.length} pending vote(s)`);

    const userId = await getPublicUserId();
    const now = Date.now();

    for (const vote of pending) {
      // Drop votes older than MAX_PENDING_AGE_MS
      if (now - vote.timestamp > MAX_PENDING_AGE_MS) {
        await cache.removePendingVote(vote.videoId);
        console.log(`RealTube: dropped expired pending vote for ${vote.videoId}`);
        continue;
      }

      try {
        const request: VoteRequest = {
          videoId: vote.videoId,
          category: vote.category,
          userId,
          userAgent: `RealTube/0.1.0 ${navigator.userAgent}`,
        };
        await api.submitVote(request);
        await cache.removePendingVote(vote.videoId);
        sent++;
        console.log(`RealTube: flushed pending vote for ${vote.videoId}`);
      } catch (err) {
        failed++;
        console.error(`RealTube: failed to flush vote for ${vote.videoId}`, err);
        // Stop flushing on first failure (likely still offline)
        break;
      }
    }

    // If there are still failures, schedule another retry
    if (failed > 0) {
      scheduleFlush(FLUSH_RETRY_DELAY_MS);
    }
  } finally {
    isFlushing = false;
  }

  return { sent, failed };
}

/** Schedule a flush attempt after a delay. */
function scheduleFlush(delayMs: number): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (isOnline()) {
      await flushPendingVotes();
    } else {
      // Still offline, retry later
      scheduleFlush(FLUSH_RETRY_DELAY_MS);
    }
  }, delayMs);
}

/** Start listening for online events to flush pending votes. */
export function startOfflineQueueListener(): void {
  // Flush when browser comes back online
  self.addEventListener("online", () => {
    console.log("RealTube: back online, flushing pending votes");
    flushPendingVotes();
  });

  // Try an initial flush on startup (might have pending votes from before)
  if (isOnline()) {
    scheduleFlush(5_000);
  }
}

/** Get count of pending votes. */
export async function getPendingVoteCount(): Promise<number> {
  const pending = await cache.getPendingVotes();
  return pending.length;
}
