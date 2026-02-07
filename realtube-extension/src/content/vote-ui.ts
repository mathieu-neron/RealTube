// RealTube Vote Submission UI
// Injects a vote button into YouTube's action bar on watch pages.
// On click, opens the extension popup which contains the Quick Vote section.

import "./vote-ui.css";

// ── SVG icon ──
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><polygon points="12,8 16,12 12,16 8,12" fill="currentColor" stroke="none"/></svg>`;

// ── State ──
let buttonEl: HTMLButtonElement | null = null;

function getVideoId(): string | null {
  // Watch pages: /watch?v=VIDEO_ID
  const v = new URLSearchParams(window.location.search).get("v");
  if (v) return v;
  // Shorts pages: /shorts/VIDEO_ID
  const shortsMatch = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  return null;
}

function isShortsPage(): boolean {
  return window.location.pathname.startsWith("/shorts/");
}

// ── Button injection ──
function findActionBar(): Element | null {
  return (
    document.querySelector(
      "ytd-watch-metadata #top-level-buttons-computed"
    ) ||
    document.querySelector(
      "#actions ytd-menu-renderer #top-level-buttons-computed"
    ) ||
    document.querySelector("#top-level-buttons-computed")
  );
}

function findShortsActionBar(): Element | null {
  return (
    document.querySelector("ytd-reel-player-overlay-renderer #actions") ||
    document.querySelector("ytd-shorts #actions") ||
    document.querySelector("#shorts-player #actions")
  );
}

/** Inject the RealTube vote button into YouTube's action bar. */
export function injectVoteButton(): void {
  // Don't double-inject
  if (buttonEl && document.contains(buttonEl)) return;

  const videoId = getVideoId();
  if (!videoId) return;

  const shorts = isShortsPage();
  const actionBar = shorts ? findShortsActionBar() : findActionBar();
  if (!actionBar) {
    // Action bar not yet rendered; retry shortly
    setTimeout(() => injectVoteButton(), 800);
    return;
  }

  buttonEl = document.createElement("button");
  buttonEl.title = "Flag this video as AI-generated (RealTube)";
  buttonEl.addEventListener("click", (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
  });

  if (shorts) {
    buttonEl.className = "realtube-vote-btn-shorts";
    buttonEl.innerHTML = `${ICON_EYE}<span class="realtube-vote-btn-shorts-label">Flag AI</span>`;
    actionBar.prepend(buttonEl);
  } else {
    buttonEl.className = "realtube-vote-btn";
    buttonEl.innerHTML = `${ICON_EYE}<span>Flag AI</span>`;
    actionBar.appendChild(buttonEl);
  }
}

/** Remove the RealTube vote button from the page. */
export function removeVoteButton(): void {
  if (buttonEl) {
    buttonEl.remove();
    buttonEl = null;
  }
}
