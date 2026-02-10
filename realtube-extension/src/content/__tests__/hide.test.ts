import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkAndHideVideos, unhideElement, getHiddenCount } from "../hide";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function createVideoElement(id: string): HTMLElement {
  const el = document.createElement("div");
  el.dataset.videoId = id;
  document.body.appendChild(el);
  return el;
}

describe("checkAndHideVideos", () => {
  it("hides elements whose score is at or above threshold", async () => {
    // Mock chrome.runtime.sendMessage to return flagged video data
    chrome.runtime.sendMessage.mockImplementation(async (msg: any) => {
      if (msg.type === "CHECK_VIDEOS") {
        return {
          success: true,
          data: {
            videos: [
              { videoId: "v1", score: 80, categories: {}, channelId: "ch1", lastUpdated: "" },
              { videoId: "v2", score: 30, categories: {}, channelId: "ch2", lastUpdated: "" },
            ],
          },
        };
      }
      return { success: false };
    });

    // Default threshold is 50
    chrome.storage.sync.set({ hideThreshold: 50 });

    const el1 = createVideoElement("v1");
    const el2 = createVideoElement("v2");
    const videoMap = new Map<string, Element>([
      ["v1", el1],
      ["v2", el2],
    ]);

    await checkAndHideVideos(videoMap);

    // v1 (score 80 >= 50) should be hidden
    expect(el1.style.display).toBe("none");
    expect(el1.getAttribute("data-realtube-hidden")).toBe("true");

    // v2 (score 30 < 50) should NOT be hidden
    expect(el2.style.display).not.toBe("none");
    expect(el2.getAttribute("data-realtube-hidden")).toBeNull();
  });

  it("respects custom threshold from storage", async () => {
    chrome.storage.sync.set({ hideThreshold: 90 });

    chrome.runtime.sendMessage.mockImplementation(async () => ({
      success: true,
      data: {
        videos: [
          { videoId: "v1", score: 80, categories: {}, channelId: "ch1", lastUpdated: "" },
        ],
      },
    }));

    const el = createVideoElement("v1");
    const videoMap = new Map<string, Element>([["v1", el]]);

    await checkAndHideVideos(videoMap);

    // score 80 < threshold 90, should NOT be hidden
    expect(el.style.display).not.toBe("none");
  });

  it("does nothing when map is empty", async () => {
    await checkAndHideVideos(new Map());
    // No error, no sendMessage call
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("handles API failure gracefully", async () => {
    chrome.runtime.sendMessage.mockRejectedValue(new Error("Network error"));

    const el = createVideoElement("v1");
    const videoMap = new Map<string, Element>([["v1", el]]);

    // Should not throw
    await checkAndHideVideos(videoMap);
    expect(el.style.display).not.toBe("none");
  });

  it("does not double-hide already hidden elements", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: {
        videos: [
          { videoId: "v1", score: 80, categories: {}, channelId: "ch1", lastUpdated: "" },
        ],
      },
    });

    const el = createVideoElement("v1");
    el.setAttribute("data-realtube-hidden", "true");
    el.style.display = "none";

    const videoMap = new Map<string, Element>([["v1", el]]);
    await checkAndHideVideos(videoMap);

    // Should still be hidden but not double-processed
    expect(el.style.display).toBe("none");
  });
});

describe("unhideElement", () => {
  it("reverses a hidden element", () => {
    const el = createVideoElement("v1");
    el.style.display = "none";
    el.setAttribute("data-realtube-hidden", "true");

    unhideElement(el);

    expect(el.style.display).toBe("");
    expect(el.getAttribute("data-realtube-hidden")).toBeNull();
  });

  it("does nothing if element is not hidden", () => {
    const el = createVideoElement("v1");
    unhideElement(el);
    expect(el.style.display).toBe("");
  });
});

describe("getHiddenCount", () => {
  it("returns correct count of hidden elements", () => {
    const el1 = createVideoElement("v1");
    const el2 = createVideoElement("v2");
    createVideoElement("v3");

    el1.setAttribute("data-realtube-hidden", "true");
    el2.setAttribute("data-realtube-hidden", "true");

    expect(getHiddenCount()).toBe(2);
  });

  it("returns 0 when no elements are hidden", () => {
    createVideoElement("v1");
    expect(getHiddenCount()).toBe(0);
  });
});
