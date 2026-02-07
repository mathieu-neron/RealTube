// RealTube Vote Submission UI
// Injects a vote button into YouTube's action bar on watch pages.
// On click, opens the extension popup which contains the Quick Vote section.

import "./vote-ui.css";

// ── SVG icon ──
const ICON_SCAN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7V2h5"/><path d="M22 7V2h-5"/><path d="M2 17v5h5"/><path d="M22 17v5h-5"/><circle cx="12" cy="12" r="4"/></svg>`;

// ── State ──
let buttonEl: HTMLButtonElement | null = null;

function getVideoId(): string | null {
  return new URLSearchParams(window.location.search).get("v");
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

/** Inject the RealTube vote button into YouTube's action bar. */
export function injectVoteButton(): void {
  // Don't double-inject
  if (buttonEl && document.contains(buttonEl)) return;
  // Only on watch pages
  if (!getVideoId()) return;

  const actionBar = findActionBar();
  if (!actionBar) {
    // Action bar not yet rendered; retry shortly
    setTimeout(() => injectVoteButton(), 800);
    return;
  }

  buttonEl = document.createElement("button");
  buttonEl.className = "realtube-vote-btn";
  buttonEl.innerHTML = `${ICON_SCAN}<span>Flag AI</span>`;
  buttonEl.title = "Flag this video as AI-generated (RealTube)";
  buttonEl.addEventListener("click", (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
  });

  actionBar.appendChild(buttonEl);
}

/** Remove the RealTube vote button from the page. */
export function removeVoteButton(): void {
  if (buttonEl) {
    buttonEl.remove();
    buttonEl = null;
  }
}
