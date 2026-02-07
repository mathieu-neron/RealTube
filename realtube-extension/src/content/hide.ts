// Hide flagged videos from the YouTube DOM
// Design: extension-design.md section 4.1 (Hiding Logic)
// Performance: <4ms for hiding 20 cards (display:none per element)

const HIDDEN_ATTR = "data-realtube-hidden";
const DEFAULT_THRESHOLD = 50; // Default score threshold for hiding

interface CachedVideo {
  videoId: string;
  score: number;
  categories: Record<string, { votes: number; weightedScore: number }>;
  channelId: string;
  lastUpdated: string;
}

/** Get the user's hiding threshold from storage, or use default. */
async function getThreshold(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.sync.get("hideThreshold", (result) => {
      resolve(result.hideThreshold ?? DEFAULT_THRESHOLD);
    });
  });
}

/** Hide a single video element. */
function hideElement(element: Element): void {
  if (element.getAttribute(HIDDEN_ATTR)) return;
  (element as HTMLElement).style.display = "none";
  element.setAttribute(HIDDEN_ATTR, "true");
}

/** Unhide a previously hidden video element. */
export function unhideElement(element: Element): void {
  if (!element.getAttribute(HIDDEN_ATTR)) return;
  (element as HTMLElement).style.display = "";
  element.removeAttribute(HIDDEN_ATTR);
}

/**
 * Check a batch of video elements against flagged data and hide them.
 * Sends CHECK_VIDEOS message to background worker for cache-first lookup.
 */
export async function checkAndHideVideos(
  videoElementMap: Map<string, Element>
): Promise<void> {
  if (videoElementMap.size === 0) return;

  const videoIds = Array.from(videoElementMap.keys());

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CHECK_VIDEOS",
      payload: { videoIds },
    });

    if (!response?.success || !response.data?.videos) return;

    const threshold = await getThreshold();
    const flaggedVideos: CachedVideo[] = response.data.videos;

    for (const video of flaggedVideos) {
      if (video.score >= threshold) {
        const element = videoElementMap.get(video.videoId);
        if (element) {
          hideElement(element);
        }
      }
    }
  } catch (err) {
    console.error("RealTube: failed to check videos", err);
  }
}

/** Get the count of currently hidden elements on the page. */
export function getHiddenCount(): number {
  return document.querySelectorAll(`[${HIDDEN_ATTR}]`).length;
}
