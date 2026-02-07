// YouTube Shorts detection, hiding, and skip-to-next logic
// Design: extension-design.md section 4.1 — "On Shorts: intercept short and skip to next"
//
// YouTube Shorts use a vertical scroll player at /shorts/VIDEO_ID.
// The DOM structure:
//   ytd-shorts → ytd-reel-video-renderer (one per short, stacked vertically)
// Each renderer contains an embedded player and navigation buttons.
// The currently playing short is determined by scroll position / visibility.

import { extractVideoIdFromUrl } from "./dom-utils";

const SHORTS_RENDERER = "ytd-reel-video-renderer";
const SHORTS_CONTAINER = "ytd-shorts";
const HIDDEN_ATTR = "data-realtube-hidden";
const SKIP_ATTR = "data-realtube-skipped";

/** Check if we're currently on a Shorts page. */
export function isShortsPage(): boolean {
  return window.location.pathname.startsWith("/shorts/");
}

/** Get the video ID of the currently active short from the URL. */
export function getCurrentShortVideoId(): string | null {
  return extractVideoIdFromUrl(window.location.href);
}

/**
 * Extract video IDs from all ytd-reel-video-renderer elements on the page.
 * Returns a map of videoId → renderer element.
 */
export function extractShortsVideoIds(): Map<string, Element> {
  const videoMap = new Map<string, Element>();
  const renderers = document.querySelectorAll(SHORTS_RENDERER);

  for (const renderer of renderers) {
    const videoId = extractVideoIdFromShort(renderer);
    if (videoId) {
      videoMap.set(videoId, renderer);
    }
  }

  return videoMap;
}

/**
 * Extract video ID from a single Shorts renderer element.
 * Tries multiple strategies: links, player attributes, URL matching.
 */
function extractVideoIdFromShort(renderer: Element): string | null {
  // Strategy 1: Find an anchor with /shorts/ href
  const shortsLink = renderer.querySelector(
    'a[href*="/shorts/"]'
  ) as HTMLAnchorElement | null;
  if (shortsLink) {
    const id = extractVideoIdFromUrl(shortsLink.href);
    if (id) return id;
  }

  // Strategy 2: Find the share button or other link with the video ID
  const shareLink = renderer.querySelector(
    'a[href*="/watch?v="]'
  ) as HTMLAnchorElement | null;
  if (shareLink) {
    const id = extractVideoIdFromUrl(shareLink.href);
    if (id) return id;
  }

  // Strategy 3: Check if the renderer has a video-id or similar data attribute
  const videoIdAttr =
    renderer.getAttribute("video-id") ||
    renderer.getAttribute("data-video-id");
  if (videoIdAttr) return videoIdAttr;

  // Strategy 4: For the currently visible short, try the URL
  // (only applies if this renderer is the active one)
  return null;
}

/**
 * Hide a flagged Shorts renderer using display:none.
 * This effectively removes it from the vertical scroll.
 */
export function hideShort(element: Element): void {
  if (element.getAttribute(HIDDEN_ATTR)) return;
  (element as HTMLElement).style.display = "none";
  element.setAttribute(HIDDEN_ATTR, "true");
}

/**
 * Skip to the next short by clicking the "next" navigation button
 * or programmatically scrolling to the next renderer.
 */
export function skipToNextShort(): void {
  // Strategy 1: Click the built-in "next" button
  const nextButton = document.querySelector(
    '#navigation-button-down button, [aria-label="Next video"]'
  ) as HTMLElement | null;
  if (nextButton) {
    nextButton.click();
    return;
  }

  // Strategy 2: Scroll to the next renderer in the container
  const container = document.querySelector(SHORTS_CONTAINER);
  if (container) {
    container.scrollBy({ top: window.innerHeight, behavior: "smooth" });
  }
}

/**
 * Check the currently active short and skip it if flagged.
 * Called on navigation and when the active short changes.
 */
export async function checkAndSkipCurrentShort(): Promise<void> {
  const videoId = getCurrentShortVideoId();
  if (!videoId) return;

  // Don't re-check a short we already skipped
  const currentRenderer = findRendererForCurrentShort();
  if (currentRenderer?.getAttribute(SKIP_ATTR)) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CHECK_VIDEOS",
      payload: { videoIds: [videoId] },
    });

    if (!response?.success || !response.data?.videos) return;

    const threshold = await getThreshold();
    const flaggedVideos = response.data.videos;

    for (const video of flaggedVideos) {
      if (video.videoId === videoId && video.score >= threshold) {
        // Mark as skipped so we don't loop
        if (currentRenderer) {
          currentRenderer.setAttribute(SKIP_ATTR, "true");
        }
        console.log(
          `RealTube: skipping flagged short ${videoId} (score: ${video.score})`
        );
        skipToNextShort();
        return;
      }
    }
  } catch (err) {
    console.error("RealTube: failed to check current short", err);
  }
}

/** Find the renderer element corresponding to the currently playing short. */
function findRendererForCurrentShort(): Element | null {
  const videoId = getCurrentShortVideoId();
  if (!videoId) return null;

  const renderers = document.querySelectorAll(SHORTS_RENDERER);
  for (const renderer of renderers) {
    const id = extractVideoIdFromShort(renderer);
    if (id === videoId) return renderer;
  }

  return null;
}

/** Get the user's hiding threshold from storage. */
async function getThreshold(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.sync.get("hideThreshold", (result) => {
      resolve(result.hideThreshold ?? 50);
    });
  });
}

/**
 * Set up a MutationObserver specific to the Shorts player.
 * Watches for new renderers being added (preloaded shorts)
 * and for the active short changing.
 */
export function createShortsObserver(
  onNewShorts: (videoMap: Map<string, Element>) => void
): MutationObserver {
  return new MutationObserver((mutations) => {
    const newShorts = new Map<string, Element>();

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Check if the node itself is a shorts renderer
        if (node.matches?.(SHORTS_RENDERER)) {
          const videoId = extractVideoIdFromShort(node);
          if (videoId) newShorts.set(videoId, node);
        }

        // Check descendants
        const descendants = node.querySelectorAll?.(SHORTS_RENDERER);
        if (descendants) {
          descendants.forEach((el) => {
            const videoId = extractVideoIdFromShort(el);
            if (videoId) newShorts.set(videoId, el);
          });
        }
      }
    }

    if (newShorts.size > 0) {
      onNewShorts(newShorts);
    }
  });
}

/**
 * Listen for URL changes that indicate the active short has changed.
 * YouTube Shorts updates the URL as the user scrolls between shorts.
 * We use a polling approach since yt-navigate-finish doesn't always
 * fire for intra-shorts navigation.
 */
export function watchShortsNavigation(
  callback: () => void
): () => void {
  let lastUrl = window.location.href;
  const interval = setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (isShortsPage()) {
        callback();
      }
    }
  }, 300);

  return () => clearInterval(interval);
}
