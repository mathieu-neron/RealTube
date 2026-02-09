// RealTube Vote Submission UI
// Injects a vote button into YouTube's action bar on watch/shorts pages.
// On click, opens an inline dropdown with 5 AI categories and a Vote button.

import "./vote-ui.css";

// ── SVG icon (parsed once via DOMParser to avoid innerHTML) ──
const ICON_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><polygon points="12,8 16,12 12,16 8,12" fill="currentColor" stroke="none"/></svg>`;

function createIconElement(): SVGElement {
  const doc = new DOMParser().parseFromString(ICON_SVG_MARKUP, "image/svg+xml");
  return doc.documentElement as unknown as SVGElement;
}

// ── Categories (mirrored from popup.tsx) ──
const CATEGORIES = [
  { id: "fully_ai", label: "Fully AI", icon: "\u2B22" },
  { id: "ai_voiceover", label: "AI Voice", icon: "\u266A" },
  { id: "ai_visuals", label: "AI Visuals", icon: "\u25C6" },
  { id: "ai_thumbnails", label: "AI Thumbnail", icon: "\u25A3" },
  { id: "ai_assisted", label: "AI Assist", icon: "\u2726" },
];

// ── State ──
let containerEl: HTMLDivElement | null = null;
let buttonEl: HTMLButtonElement | null = null;
let dropdownEl: HTMLDivElement | null = null;
let selectedCategory: string | null = null;
let isSubmitting = false;

// ── Helpers ──
function getVideoId(): string | null {
  const v = new URLSearchParams(window.location.search).get("v");
  if (v) return v;
  const shortsMatch = window.location.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  return null;
}

function isShortsPage(): boolean {
  return window.location.pathname.startsWith("/shorts/");
}

// ── Action bar finders ──
function findActionBar(): Element | null {
  return (
    document.querySelector("ytd-watch-metadata #top-level-buttons-computed") ||
    document.querySelector("#actions ytd-menu-renderer #top-level-buttons-computed") ||
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

// ── Click-outside and Escape listeners ──
function onClickOutside(e: MouseEvent): void {
  if (containerEl && !containerEl.contains(e.target as Node)) {
    closeDropdown();
  }
}

function onEscape(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    closeDropdown();
  }
}

// ── Dropdown lifecycle ──
function openDropdown(): void {
  if (dropdownEl || !containerEl || isSubmitting) return;

  const shorts = isShortsPage();
  selectedCategory = null;

  // Build dropdown DOM
  dropdownEl = document.createElement("div");
  dropdownEl.className = "realtube-dropdown" + (shorts ? " realtube-dropdown-shorts" : "");

  // Header
  const header = document.createElement("div");
  header.className = "realtube-dropdown-header";
  header.textContent = "Flag as AI";
  dropdownEl.appendChild(header);

  // Options
  const optionsContainer = document.createElement("div");
  optionsContainer.className = "realtube-dropdown-options";

  for (const cat of CATEGORIES) {
    const option = document.createElement("button");
    option.className = "realtube-dropdown-option";
    option.type = "button";
    option.dataset.categoryId = cat.id;

    const icon = document.createElement("span");
    icon.className = "realtube-dropdown-icon";
    icon.textContent = cat.icon;

    const label = document.createElement("span");
    label.className = "realtube-dropdown-label";
    label.textContent = cat.label;

    option.appendChild(icon);
    option.appendChild(label);

    option.addEventListener("click", (e) => {
      e.stopPropagation();
      selectCategory(cat.id);
    });

    optionsContainer.appendChild(option);
  }

  dropdownEl.appendChild(optionsContainer);

  // Footer with Vote button
  const footer = document.createElement("div");
  footer.className = "realtube-dropdown-footer";

  const voteBtn = document.createElement("button");
  voteBtn.className = "realtube-dropdown-vote-btn";
  voteBtn.type = "button";
  voteBtn.textContent = "Vote";
  voteBtn.disabled = true;

  voteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    submitVote();
  });

  footer.appendChild(voteBtn);
  dropdownEl.appendChild(footer);

  containerEl.appendChild(dropdownEl);

  // Register listeners (capture phase for click-outside to beat YouTube's stopPropagation)
  document.addEventListener("mousedown", onClickOutside, true);
  document.addEventListener("keydown", onEscape, true);
}

function closeDropdown(): void {
  if (dropdownEl) {
    dropdownEl.remove();
    dropdownEl = null;
  }
  selectedCategory = null;
  isSubmitting = false;
  document.removeEventListener("mousedown", onClickOutside, true);
  document.removeEventListener("keydown", onEscape, true);
}

function selectCategory(categoryId: string): void {
  if (isSubmitting || !dropdownEl) return;
  selectedCategory = categoryId;

  // Update visual selection
  const options = dropdownEl.querySelectorAll(".realtube-dropdown-option");
  for (const opt of options) {
    const btn = opt as HTMLButtonElement;
    btn.classList.toggle("selected", btn.dataset.categoryId === categoryId);
  }

  // Enable vote button
  const voteBtn = dropdownEl.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement | null;
  if (voteBtn) {
    voteBtn.disabled = false;
  }
}

function showFeedback(type: "success" | "error", message: string): void {
  if (!dropdownEl) return;

  // Replace dropdown body with feedback
  dropdownEl.replaceChildren();

  const feedback = document.createElement("div");
  feedback.className = `realtube-dropdown-feedback ${type}`;
  feedback.textContent = message;
  dropdownEl.appendChild(feedback);

  // Auto-close after 2s
  setTimeout(() => {
    closeDropdown();
  }, 2000);
}

async function submitVote(): Promise<void> {
  if (!selectedCategory || isSubmitting || !dropdownEl) return;

  const videoId = getVideoId();
  if (!videoId) {
    showFeedback("error", "Could not find video ID");
    return;
  }

  isSubmitting = true;

  // Show spinner on vote button
  const voteBtn = dropdownEl.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement | null;
  if (voteBtn) {
    voteBtn.disabled = true;
    voteBtn.textContent = "";
    const spinner = document.createElement("span");
    spinner.className = "realtube-dropdown-spinner";
    voteBtn.appendChild(spinner);
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SUBMIT_VOTE",
      payload: { videoId, category: selectedCategory },
    });

    if (response?.success) {
      const msg = response.data?.queued
        ? "\u2713 Vote saved offline"
        : "\u2713 Vote submitted";
      showFeedback("success", msg);
    } else {
      showFeedback("error", response?.error || "Vote failed");
    }
  } catch (err) {
    showFeedback("error", "Vote failed");
  }
}

// ── Button injection ──
/** Inject the RealTube vote button into YouTube's action bar. */
export function injectVoteButton(): void {
  // Don't double-inject
  if (containerEl && document.contains(containerEl)) return;

  const videoId = getVideoId();
  if (!videoId) return;

  const shorts = isShortsPage();
  const actionBar = shorts ? findShortsActionBar() : findActionBar();
  if (!actionBar) {
    setTimeout(() => injectVoteButton(), 800);
    return;
  }

  // Create container wrapper
  containerEl = document.createElement("div");
  containerEl.className = shorts
    ? "realtube-dropdown-container-shorts"
    : "realtube-dropdown-container";

  // Create button
  buttonEl = document.createElement("button");
  buttonEl.title = "Flag this video as AI-generated (RealTube)";
  buttonEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdownEl) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  if (shorts) {
    buttonEl.className = "realtube-vote-btn-shorts";
    buttonEl.appendChild(document.adoptNode(createIconElement()));
    const label = document.createElement("span");
    label.className = "realtube-vote-btn-shorts-label";
    label.textContent = "Flag AI";
    buttonEl.appendChild(label);
    containerEl.appendChild(buttonEl);
    actionBar.prepend(containerEl);
  } else {
    buttonEl.className = "realtube-vote-btn";
    buttonEl.appendChild(document.adoptNode(createIconElement()));
    const label = document.createElement("span");
    label.textContent = "Flag AI";
    buttonEl.appendChild(label);
    containerEl.appendChild(buttonEl);
    actionBar.appendChild(containerEl);
  }
}

/** Remove the RealTube vote button from the page. */
export function removeVoteButton(): void {
  closeDropdown();
  if (containerEl) {
    containerEl.remove();
    containerEl = null;
    buttonEl = null;
  }
}
