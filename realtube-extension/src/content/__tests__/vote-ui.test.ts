import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vote-ui.ts imports ./vote-ui.css which vitest won't handle (css: false skips it)
// but we need to mock the CSS module import since it's a side-effect import
let voteUI: typeof import("../vote-ui");

function setUrl(path: string, search = ""): void {
  const url = new URL(`https://www.youtube.com${path}${search}`);
  Object.defineProperty(window, "location", {
    value: url,
    writable: true,
    configurable: true,
  });
}

function createActionBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = "top-level-buttons-computed";
  const wrapper = document.createElement("div");
  wrapper.id = "actions";
  const ytdMenu = document.createElement("ytd-menu-renderer");
  ytdMenu.appendChild(bar);
  wrapper.appendChild(ytdMenu);
  document.body.appendChild(wrapper);
  return bar;
}

function createShortsActionBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = "actions";
  const wrapper = document.createElement("ytd-reel-player-overlay-renderer");
  wrapper.appendChild(bar);
  document.body.appendChild(wrapper);
  return bar;
}

beforeEach(async () => {
  document.body.innerHTML = "";
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetModules();
  voteUI = await import("../vote-ui");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("injectVoteButton", () => {
  it("injects button into action bar on watch page", () => {
    setUrl("/watch", "?v=abc12345678");
    createActionBar();

    voteUI.injectVoteButton();

    const btn = document.querySelector(".realtube-vote-btn");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("title")).toContain("Flag this video");
  });

  it("does not double-inject", () => {
    setUrl("/watch", "?v=abc12345678");
    createActionBar();

    voteUI.injectVoteButton();
    voteUI.injectVoteButton();

    const buttons = document.querySelectorAll(".realtube-vote-btn");
    expect(buttons).toHaveLength(1);
  });

  it("injects shorts-style button on shorts page", () => {
    setUrl("/shorts/dQw4w9WgXcQ");
    createShortsActionBar();

    voteUI.injectVoteButton();

    const btn = document.querySelector(".realtube-vote-btn-shorts");
    expect(btn).not.toBeNull();
  });

  it("retries injection when action bar is not found", () => {
    setUrl("/watch", "?v=abc12345678");
    // No action bar in DOM

    voteUI.injectVoteButton();

    // No button yet
    expect(document.querySelector(".realtube-vote-btn")).toBeNull();

    // Add action bar and advance timer
    createActionBar();
    vi.advanceTimersByTime(1000);

    expect(document.querySelector(".realtube-vote-btn")).not.toBeNull();
  });
});

describe("dropdown flow", () => {
  function injectAndOpenDropdown() {
    setUrl("/watch", "?v=abc12345678");
    createActionBar();
    voteUI.injectVoteButton();

    const btn = document.querySelector(".realtube-vote-btn") as HTMLButtonElement;
    btn.click();

    return btn;
  }

  it("opens dropdown on button click", () => {
    injectAndOpenDropdown();

    const dropdown = document.querySelector(".realtube-dropdown");
    expect(dropdown).not.toBeNull();
    expect(dropdown?.querySelector(".realtube-dropdown-header")?.textContent).toBe("Flag as AI");
  });

  it("renders 5 category options", () => {
    injectAndOpenDropdown();

    const options = document.querySelectorAll(".realtube-dropdown-option");
    expect(options).toHaveLength(5);
  });

  it("Vote button starts disabled", () => {
    injectAndOpenDropdown();

    const voteBtn = document.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement;
    expect(voteBtn.disabled).toBe(true);
  });

  it("selecting a category enables the Vote button", () => {
    injectAndOpenDropdown();

    const firstOption = document.querySelector(".realtube-dropdown-option") as HTMLButtonElement;
    firstOption.click();

    const voteBtn = document.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement;
    expect(voteBtn.disabled).toBe(false);
    expect(firstOption.classList.contains("selected")).toBe(true);
  });

  it("changing category switches selection", () => {
    injectAndOpenDropdown();

    const options = document.querySelectorAll(".realtube-dropdown-option");
    const first = options[0] as HTMLButtonElement;
    const second = options[1] as HTMLButtonElement;

    first.click();
    expect(first.classList.contains("selected")).toBe(true);

    second.click();
    expect(first.classList.contains("selected")).toBe(false);
    expect(second.classList.contains("selected")).toBe(true);
  });

  it("selecting a category does NOT auto-submit", () => {
    injectAndOpenDropdown();

    const firstOption = document.querySelector(".realtube-dropdown-option") as HTMLButtonElement;
    firstOption.click();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("clicking Vote sends SUBMIT_VOTE message", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: { queued: false },
    });

    injectAndOpenDropdown();

    // Select a category
    const option = document.querySelector('[data-category-id="fully_ai"]') as HTMLButtonElement;
    option.click();

    // Click Vote
    const voteBtn = document.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement;
    voteBtn.click();

    // Wait for async
    await vi.advanceTimersByTimeAsync(100);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "SUBMIT_VOTE",
      payload: { videoId: "abc12345678", category: "fully_ai" },
    });
  });

  it("shows success feedback after vote", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: { queued: false },
    });

    injectAndOpenDropdown();

    const option = document.querySelector('[data-category-id="fully_ai"]') as HTMLButtonElement;
    option.click();

    const voteBtn = document.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement;
    voteBtn.click();

    await vi.advanceTimersByTimeAsync(100);

    const feedback = document.querySelector(".realtube-dropdown-feedback.success");
    expect(feedback).not.toBeNull();
    expect(feedback?.textContent).toContain("Vote submitted");
  });

  it("shows offline feedback when vote is queued", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: { queued: true },
    });

    injectAndOpenDropdown();

    const option = document.querySelector('[data-category-id="ai_visuals"]') as HTMLButtonElement;
    option.click();

    const voteBtn = document.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement;
    voteBtn.click();

    await vi.advanceTimersByTimeAsync(100);

    const feedback = document.querySelector(".realtube-dropdown-feedback.success");
    expect(feedback?.textContent).toContain("offline");
  });

  it("shows error feedback on failure", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: false,
      error: "Vote failed",
    });

    injectAndOpenDropdown();

    const option = document.querySelector('[data-category-id="fully_ai"]') as HTMLButtonElement;
    option.click();

    const voteBtn = document.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement;
    voteBtn.click();

    await vi.advanceTimersByTimeAsync(100);

    const feedback = document.querySelector(".realtube-dropdown-feedback.error");
    expect(feedback).not.toBeNull();
  });

  it("Escape closes the dropdown", () => {
    injectAndOpenDropdown();

    expect(document.querySelector(".realtube-dropdown")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.querySelector(".realtube-dropdown")).toBeNull();
  });

  it("clicking outside closes the dropdown", () => {
    injectAndOpenDropdown();

    expect(document.querySelector(".realtube-dropdown")).not.toBeNull();

    // Simulate click outside
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(document.querySelector(".realtube-dropdown")).toBeNull();
  });

  it("auto-closes after success feedback", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: { queued: false },
    });

    injectAndOpenDropdown();

    const option = document.querySelector('[data-category-id="fully_ai"]') as HTMLButtonElement;
    option.click();

    const voteBtn = document.querySelector(".realtube-dropdown-vote-btn") as HTMLButtonElement;
    voteBtn.click();

    await vi.advanceTimersByTimeAsync(100);

    // Feedback is showing
    expect(document.querySelector(".realtube-dropdown-feedback")).not.toBeNull();

    // After 2 seconds the dropdown should auto-close
    await vi.advanceTimersByTimeAsync(2100);

    expect(document.querySelector(".realtube-dropdown")).toBeNull();
  });
});

describe("removeVoteButton", () => {
  it("removes button and dropdown from DOM", () => {
    setUrl("/watch", "?v=abc12345678");
    createActionBar();
    voteUI.injectVoteButton();

    expect(document.querySelector(".realtube-vote-btn")).not.toBeNull();

    voteUI.removeVoteButton();

    expect(document.querySelector(".realtube-vote-btn")).toBeNull();
    expect(document.querySelector(".realtube-dropdown-container")).toBeNull();
  });

  it("is safe to call when no button exists", () => {
    // Should not throw
    voteUI.removeVoteButton();
  });
});
