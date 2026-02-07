// RealTube Content Script
// Injects into YouTube pages to detect and hide flagged AI-generated videos
// Design: extension-design.md sections 4.1, 20

import {
  detectPageType,
  extractAllVideoIds,
  extractVideoIdsFromMutations,
  PageType,
} from "./dom-utils";
import { checkAndHideVideos } from "./hide";
import {
  checkAndSkipCurrentShort,
  createShortsObserver,
  extractShortsVideoIds,
  isShortsPage,
  watchShortsNavigation,
} from "./shorts";
import { injectVoteButton, removeVoteButton } from "./vote-ui";

const DEBOUNCE_MS = 100;
const INITIAL_SCAN_DELAY_MS = 500;

let currentPageType: PageType = "unknown";
let observer: MutationObserver | null = null;
let shortsObserver: MutationObserver | null = null;
let stopShortsNavWatch: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let enabled = true;
let shortsFilterEnabled = true;

/** Check extension enabled state from storage. */
async function isEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get("enabled", (result) => {
      resolve(result.enabled !== false); // default to enabled
    });
  });
}

/** Check Shorts filtering enabled state from storage. */
async function isShortsFilteringEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get("shortsFilterEnabled", (result) => {
      resolve(result.shortsFilterEnabled !== false); // default to enabled
    });
  });
}

/** Scan all currently visible videos and hide flagged ones. */
async function scanVisibleVideos(): Promise<void> {
  if (!enabled) return;

  const videoMap = extractAllVideoIds(currentPageType);
  if (videoMap.size > 0) {
    await checkAndHideVideos(videoMap);
  }
}

/** Debounced handler for MutationObserver. */
function onMutation(mutations: MutationRecord[]): void {
  if (!enabled) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const newVideos = extractVideoIdsFromMutations(mutations, currentPageType);
    if (newVideos.size > 0) {
      checkAndHideVideos(newVideos);
    }
  }, DEBOUNCE_MS);
}

/** Start observing DOM for new video elements (infinite scroll). */
function startObserver(): void {
  stopObserver();

  // Observe the main content area for new children
  const target =
    document.querySelector("ytd-app") ||
    document.querySelector("#content") ||
    document.body;

  observer = new MutationObserver(onMutation);
  observer.observe(target, {
    childList: true,
    subtree: true,
  });
}

/** Stop the MutationObserver. */
function stopObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

/** Start Shorts-specific observers and navigation watcher. */
function startShortsMode(): void {
  stopShortsMode();

  // Check the current short immediately
  checkAndSkipCurrentShort();

  // Also scan for preloaded shorts renderers and hide flagged ones
  const shortsMap = extractShortsVideoIds();
  if (shortsMap.size > 0) {
    checkAndHideVideos(shortsMap);
  }

  // Observe for new shorts renderers being loaded
  const container =
    document.querySelector("ytd-shorts") ||
    document.querySelector("ytd-app") ||
    document.body;

  shortsObserver = createShortsObserver((newShorts) => {
    checkAndHideVideos(newShorts);
  });
  shortsObserver.observe(container, {
    childList: true,
    subtree: true,
  });

  // Watch for intra-shorts URL changes (scrolling between shorts)
  stopShortsNavWatch = watchShortsNavigation(() => {
    checkAndSkipCurrentShort();
  });
}

/** Stop Shorts-specific observers. */
function stopShortsMode(): void {
  if (shortsObserver) {
    shortsObserver.disconnect();
    shortsObserver = null;
  }
  if (stopShortsNavWatch) {
    stopShortsNavWatch();
    stopShortsNavWatch = null;
  }
}

/** Handle YouTube SPA navigation (URL changes without page reload). */
function onNavigate(): void {
  currentPageType = detectPageType();

  // Manage vote button: inject on watch and shorts pages, remove elsewhere
  removeVoteButton();
  if (currentPageType === "watch" || currentPageType === "shorts") {
    setTimeout(() => injectVoteButton(), INITIAL_SCAN_DELAY_MS);
  }

  // Manage Shorts mode
  if (currentPageType === "shorts" && shortsFilterEnabled) {
    setTimeout(() => startShortsMode(), INITIAL_SCAN_DELAY_MS);
  } else {
    stopShortsMode();
  }

  // Re-scan after navigation with a small delay for DOM to settle
  setTimeout(() => scanVisibleVideos(), INITIAL_SCAN_DELAY_MS);
}

/** Set up navigation detection for YouTube's SPA. */
function setupNavigationListener(): void {
  // YouTube uses yt-navigate-finish for SPA navigation
  document.addEventListener("yt-navigate-finish", () => onNavigate());

  // Also listen to popstate for back/forward navigation
  window.addEventListener("popstate", () => onNavigate());
}

/** Listen for settings changes. */
function setupSettingsListener(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.enabled !== undefined) {
      enabled = changes.enabled.newValue !== false;
      if (enabled) {
        scanVisibleVideos();
        startObserver();
        if (currentPageType === "shorts" && shortsFilterEnabled) {
          startShortsMode();
        }
      } else {
        stopObserver();
        stopShortsMode();
      }
    }

    if (changes.shortsFilterEnabled !== undefined) {
      shortsFilterEnabled = changes.shortsFilterEnabled.newValue !== false;
      if (enabled && currentPageType === "shorts") {
        if (shortsFilterEnabled) {
          startShortsMode();
        } else {
          stopShortsMode();
        }
      }
    }
  });
}

/** Initialize the content script. */
async function init(): Promise<void> {
  enabled = await isEnabled();
  if (!enabled) {
    console.log("RealTube content script loaded (disabled)");
    return;
  }

  shortsFilterEnabled = await isShortsFilteringEnabled();
  currentPageType = detectPageType();
  console.log(`RealTube content script loaded (page: ${currentPageType})`);

  setupNavigationListener();
  setupSettingsListener();

  // Initial scan after a short delay for DOM to be ready
  setTimeout(() => scanVisibleVideos(), INITIAL_SCAN_DELAY_MS);

  // Inject vote button on watch and shorts pages
  if (currentPageType === "watch" || currentPageType === "shorts") {
    setTimeout(() => injectVoteButton(), INITIAL_SCAN_DELAY_MS);
  }

  // Start Shorts mode if on a Shorts page
  if (currentPageType === "shorts" && shortsFilterEnabled) {
    setTimeout(() => startShortsMode(), INITIAL_SCAN_DELAY_MS);
  }

  // Start observing for dynamically loaded content
  startObserver();
}

init();
