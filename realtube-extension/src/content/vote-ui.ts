// RealTube Vote Submission UI
// Injects a vote button into YouTube's action bar on watch pages.
// On click, shows a category selector overlay. Submit sends SUBMIT_VOTE to background.

import "./vote-ui.css";

// ── Category definitions ──
const CATEGORIES = [
  {
    id: "fully_ai",
    name: "Fully AI-Generated",
    desc: "Entire video is AI: visuals, audio, script",
  },
  {
    id: "ai_voiceover",
    name: "AI Voiceover",
    desc: "Real footage with AI-generated narration",
  },
  {
    id: "ai_visuals",
    name: "AI Visuals",
    desc: "AI-generated images/video with human voice",
  },
  {
    id: "ai_thumbnails",
    name: "AI Thumbnails Only",
    desc: "Only thumbnail is AI-generated",
  },
  {
    id: "ai_assisted",
    name: "AI-Assisted",
    desc: "Significant AI editing/enhancement",
  },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

// ── SVG icons (inline to avoid external deps) ──
const ICON_SCAN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7V2h5"/><path d="M22 7V2h-5"/><path d="M2 17v5h5"/><path d="M22 17v5h-5"/><circle cx="12" cy="12" r="4"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
const ICON_ERROR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

// ── State ──
let buttonEl: HTMLButtonElement | null = null;
let overlayEl: HTMLDivElement | null = null;
let backdropEl: HTMLDivElement | null = null;
let selectedCategory: CategoryId | null = null;
let isSubmitting = false;

function getVideoId(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

// ── Overlay construction ──
function buildOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "realtube-overlay";

  // Header
  const header = document.createElement("div");
  header.className = "realtube-overlay-header";
  header.innerHTML = `${ICON_SCAN}<span class="realtube-overlay-title">Flag as AI Content</span>`;
  overlay.appendChild(header);

  // Categories
  const catContainer = document.createElement("div");
  catContainer.className = "realtube-categories";

  for (const cat of CATEGORIES) {
    const row = document.createElement("div");
    row.className = "realtube-category";
    row.dataset.category = cat.id;
    row.innerHTML = `
      <div class="realtube-radio"></div>
      <div class="realtube-category-info">
        <div class="realtube-category-name">${cat.name}</div>
        <div class="realtube-category-desc">${cat.desc}</div>
      </div>`;
    row.addEventListener("click", () => selectCategory(cat.id));
    catContainer.appendChild(row);
  }
  overlay.appendChild(catContainer);

  // Footer
  const footer = document.createElement("div");
  footer.className = "realtube-overlay-footer";
  footer.innerHTML = `
    <button class="realtube-btn realtube-btn-cancel">Cancel</button>
    <button class="realtube-btn realtube-btn-submit" disabled>Submit</button>`;

  footer
    .querySelector(".realtube-btn-cancel")!
    .addEventListener("click", closeOverlay);
  footer
    .querySelector(".realtube-btn-submit")!
    .addEventListener("click", submitVote);

  overlay.appendChild(footer);
  return overlay;
}

function selectCategory(id: CategoryId): void {
  selectedCategory = id;
  if (!overlayEl) return;

  overlayEl.querySelectorAll(".realtube-category").forEach((el) => {
    el.classList.toggle("selected", (el as HTMLElement).dataset.category === id);
  });

  const submitBtn = overlayEl.querySelector(
    ".realtube-btn-submit"
  ) as HTMLButtonElement | null;
  if (submitBtn) submitBtn.disabled = false;
}

// ── Show / hide overlay ──
function openOverlay(): void {
  if (!buttonEl) return;

  selectedCategory = null;
  isSubmitting = false;

  // Build fresh overlay each time (clean state)
  if (overlayEl) overlayEl.remove();
  if (backdropEl) backdropEl.remove();

  overlayEl = buildOverlay();
  backdropEl = document.createElement("div");
  backdropEl.className = "realtube-overlay-backdrop";
  backdropEl.addEventListener("click", closeOverlay);

  // Position relative to button
  buttonEl.style.position = "relative";
  buttonEl.appendChild(overlayEl);
  document.body.appendChild(backdropEl);

  // Trigger animation
  requestAnimationFrame(() => {
    overlayEl?.classList.add("visible");
  });

  buttonEl.classList.add("active");
}

function closeOverlay(): void {
  if (overlayEl) {
    overlayEl.classList.remove("visible");
    setTimeout(() => {
      overlayEl?.remove();
      overlayEl = null;
    }, 200);
  }
  if (backdropEl) {
    backdropEl.remove();
    backdropEl = null;
  }
  buttonEl?.classList.remove("active");
}

// ── Submit vote ──
async function submitVote(): Promise<void> {
  const videoId = getVideoId();
  if (!videoId || !selectedCategory || isSubmitting) return;

  isSubmitting = true;

  // Show loading state
  const submitBtn = overlayEl?.querySelector(
    ".realtube-btn-submit"
  ) as HTMLButtonElement | null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="realtube-spinner"></span>`;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SUBMIT_VOTE",
      payload: { videoId, category: selectedCategory },
    });

    if (response?.success) {
      showFeedback("success", "Vote submitted");
    } else {
      showFeedback("error", response?.error || "Vote failed");
    }
  } catch (err) {
    showFeedback(
      "error",
      err instanceof Error ? err.message : "Connection error"
    );
  }
}

function showFeedback(
  type: "success" | "error",
  message: string
): void {
  if (!overlayEl) return;

  const icon = type === "success" ? ICON_CHECK : ICON_ERROR;

  // Replace overlay content with feedback
  const cats = overlayEl.querySelector(".realtube-categories");
  const footer = overlayEl.querySelector(".realtube-overlay-footer");
  if (cats) cats.remove();
  if (footer) footer.remove();

  const feedback = document.createElement("div");
  feedback.className = `realtube-feedback ${type}`;
  feedback.innerHTML = `${icon}<span>${message}</span>`;
  overlayEl.appendChild(feedback);

  // Auto-close after delay
  setTimeout(() => closeOverlay(), type === "success" ? 1200 : 2500);
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
    if (overlayEl?.classList.contains("visible")) {
      closeOverlay();
    } else {
      openOverlay();
    }
  });

  actionBar.appendChild(buttonEl);
}

/** Remove the RealTube vote button from the page. */
export function removeVoteButton(): void {
  closeOverlay();
  if (buttonEl) {
    buttonEl.remove();
    buttonEl = null;
  }
}
