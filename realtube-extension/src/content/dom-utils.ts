// DOM utilities: page type detection, video ID extraction from YouTube DOM
// Design: extension-design.md section 4.1

export type PageType =
  | "home"
  | "search"
  | "watch"
  | "shorts"
  | "channel"
  | "unknown";

// Video renderer selectors per page type
const VIDEO_SELECTORS = {
  feed: "ytd-rich-item-renderer",
  search: "ytd-video-renderer",
  sidebar: "ytd-compact-video-renderer",
  shorts: "ytd-reel-video-renderer",
  channel: "ytd-grid-video-renderer",
} as const;

/** Detect the current YouTube page type from the URL. */
export function detectPageType(): PageType {
  const path = window.location.pathname;
  if (path === "/" || path === "/feed/trending" || path.startsWith("/feed/")) {
    return "home";
  }
  if (path === "/results") {
    return "search";
  }
  if (path === "/watch") {
    return "watch";
  }
  if (path.startsWith("/shorts/")) {
    return "shorts";
  }
  if (path.startsWith("/@") || path.startsWith("/channel/") || path.startsWith("/c/")) {
    return "channel";
  }
  return "unknown";
}

/** Extract video ID from a URL string. */
export function extractVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    // /watch?v=VIDEO_ID
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v");
    }
    // /shorts/VIDEO_ID
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) {
      return shortsMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract video ID from a thumbnail <a> element's href. */
function extractVideoIdFromLink(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href");
  if (!href) return null;
  return extractVideoIdFromUrl(href);
}

/** Extract video ID from a video renderer element. */
export function extractVideoIdFromRenderer(
  element: Element
): string | null {
  // Try thumbnail link first (most reliable)
  const thumbLink = element.querySelector(
    "a#thumbnail, a.ytd-thumbnail, a[href*='/watch?v='], a[href*='/shorts/']"
  ) as HTMLAnchorElement | null;
  if (thumbLink) {
    const id = extractVideoIdFromLink(thumbLink);
    if (id) return id;
  }

  // Try title link
  const titleLink = element.querySelector(
    "a#video-title, a#video-title-link"
  ) as HTMLAnchorElement | null;
  if (titleLink) {
    const id = extractVideoIdFromLink(titleLink);
    if (id) return id;
  }

  return null;
}

/** Get the CSS selector for video renderers on the current page type. */
export function getVideoRendererSelector(pageType: PageType): string {
  switch (pageType) {
    case "home":
      return `${VIDEO_SELECTORS.feed}, ${VIDEO_SELECTORS.sidebar}`;
    case "search":
      return VIDEO_SELECTORS.search;
    case "watch":
      return VIDEO_SELECTORS.sidebar;
    case "shorts":
      return VIDEO_SELECTORS.shorts;
    case "channel":
      return `${VIDEO_SELECTORS.channel}, ${VIDEO_SELECTORS.feed}`;
    default:
      return Object.values(VIDEO_SELECTORS).join(", ");
  }
}

/** Extract all visible video IDs from the current page. */
export function extractAllVideoIds(pageType: PageType): Map<string, Element> {
  const selector = getVideoRendererSelector(pageType);
  const elements = document.querySelectorAll(selector);
  const videoMap = new Map<string, Element>();

  elements.forEach((el) => {
    const videoId = extractVideoIdFromRenderer(el);
    if (videoId) {
      videoMap.set(videoId, el);
    }
  });

  return videoMap;
}

/** Extract video IDs from newly added DOM nodes (for MutationObserver). */
export function extractVideoIdsFromMutations(
  mutations: MutationRecord[],
  pageType: PageType
): Map<string, Element> {
  const selector = getVideoRendererSelector(pageType);
  const videoMap = new Map<string, Element>();

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;

      // Check if the node itself is a video renderer
      if (node.matches?.(selector)) {
        const videoId = extractVideoIdFromRenderer(node);
        if (videoId) videoMap.set(videoId, node);
      }

      // Check descendants
      const descendants = node.querySelectorAll?.(selector);
      if (descendants) {
        descendants.forEach((el) => {
          const videoId = extractVideoIdFromRenderer(el);
          if (videoId) videoMap.set(videoId, el);
        });
      }
    }
  }

  return videoMap;
}

/** Get the current video ID if on a watch page. */
export function getCurrentWatchVideoId(): string | null {
  return extractVideoIdFromUrl(window.location.href);
}
