import { describe, it, expect, beforeEach } from "vitest";
import {
  detectPageType,
  extractVideoIdFromUrl,
  extractVideoIdFromRenderer,
  getVideoRendererSelector,
  extractAllVideoIds,
} from "../dom-utils";

function setUrl(path: string, search = ""): void {
  const url = new URL(`https://www.youtube.com${path}${search}`);
  Object.defineProperty(window, "location", {
    value: url,
    writable: true,
    configurable: true,
  });
}

describe("detectPageType", () => {
  it('returns "home" for /', () => {
    setUrl("/");
    expect(detectPageType()).toBe("home");
  });

  it('returns "home" for /feed/trending', () => {
    setUrl("/feed/trending");
    expect(detectPageType()).toBe("home");
  });

  it('returns "home" for /feed/subscriptions', () => {
    setUrl("/feed/subscriptions");
    expect(detectPageType()).toBe("home");
  });

  it('returns "search" for /results', () => {
    setUrl("/results", "?search_query=test");
    expect(detectPageType()).toBe("search");
  });

  it('returns "watch" for /watch', () => {
    setUrl("/watch", "?v=dQw4w9WgXcQ");
    expect(detectPageType()).toBe("watch");
  });

  it('returns "shorts" for /shorts/VIDEO_ID', () => {
    setUrl("/shorts/dQw4w9WgXcQ");
    expect(detectPageType()).toBe("shorts");
  });

  it('returns "channel" for /@username', () => {
    setUrl("/@username");
    expect(detectPageType()).toBe("channel");
  });

  it('returns "channel" for /channel/UC...', () => {
    setUrl("/channel/UCxxxxxxxx");
    expect(detectPageType()).toBe("channel");
  });

  it('returns "channel" for /c/name', () => {
    setUrl("/c/channelname");
    expect(detectPageType()).toBe("channel");
  });

  it('returns "unknown" for unrecognized paths', () => {
    setUrl("/about");
    expect(detectPageType()).toBe("unknown");
  });
});

describe("extractVideoIdFromUrl", () => {
  beforeEach(() => {
    setUrl("/");
  });

  it("extracts video ID from /watch?v=...", () => {
    expect(extractVideoIdFromUrl("/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts video ID from full URL", () => {
    expect(
      extractVideoIdFromUrl("https://www.youtube.com/watch?v=abc12345678")
    ).toBe("abc12345678");
  });

  it("extracts video ID from /shorts/VIDEO_ID", () => {
    expect(extractVideoIdFromUrl("/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for URLs without video ID", () => {
    expect(extractVideoIdFromUrl("/results?search_query=test")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(extractVideoIdFromUrl("not-a-url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractVideoIdFromUrl("")).toBeNull();
  });
});

describe("extractVideoIdFromRenderer", () => {
  it("extracts ID from thumbnail link", () => {
    const el = document.createElement("div");
    const link = document.createElement("a");
    link.id = "thumbnail";
    link.setAttribute("href", "/watch?v=abc12345678");
    el.appendChild(link);

    expect(extractVideoIdFromRenderer(el)).toBe("abc12345678");
  });

  it("extracts ID from title link", () => {
    const el = document.createElement("div");
    const link = document.createElement("a");
    link.id = "video-title";
    link.setAttribute("href", "/watch?v=xyz12345678");
    el.appendChild(link);

    expect(extractVideoIdFromRenderer(el)).toBe("xyz12345678");
  });

  it("extracts ID from shorts link", () => {
    const el = document.createElement("div");
    const link = document.createElement("a");
    link.id = "thumbnail";
    link.setAttribute("href", "/shorts/dQw4w9WgXcQ");
    el.appendChild(link);

    expect(extractVideoIdFromRenderer(el)).toBe("dQw4w9WgXcQ");
  });

  it("returns null when no links found", () => {
    const el = document.createElement("div");
    expect(extractVideoIdFromRenderer(el)).toBeNull();
  });
});

describe("getVideoRendererSelector", () => {
  it("returns feed + sidebar selectors for home", () => {
    const selector = getVideoRendererSelector("home");
    expect(selector).toContain("ytd-rich-item-renderer");
    expect(selector).toContain("ytd-compact-video-renderer");
  });

  it("returns search selector for search", () => {
    expect(getVideoRendererSelector("search")).toBe("ytd-video-renderer");
  });

  it("returns sidebar selector for watch", () => {
    expect(getVideoRendererSelector("watch")).toBe("ytd-compact-video-renderer");
  });

  it("returns shorts selector for shorts", () => {
    expect(getVideoRendererSelector("shorts")).toBe("ytd-reel-video-renderer");
  });

  it("returns grid + feed selectors for channel", () => {
    const selector = getVideoRendererSelector("channel");
    expect(selector).toContain("ytd-grid-video-renderer");
    expect(selector).toContain("ytd-rich-item-renderer");
  });

  it("returns all selectors for unknown", () => {
    const selector = getVideoRendererSelector("unknown");
    expect(selector).toContain("ytd-rich-item-renderer");
    expect(selector).toContain("ytd-video-renderer");
    expect(selector).toContain("ytd-compact-video-renderer");
    expect(selector).toContain("ytd-reel-video-renderer");
    expect(selector).toContain("ytd-grid-video-renderer");
  });
});

describe("extractAllVideoIds", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setUrl("/");
  });

  it("returns empty map when no renderers exist", () => {
    const result = extractAllVideoIds("home");
    expect(result.size).toBe(0);
  });

  it("extracts IDs from matching renderers", () => {
    // jsdom doesn't support custom elements, so we simulate with data attributes
    // We can still test the selector matching by creating elements that match
    // the querySelector. Since jsdom supports querySelectorAll with tag names,
    // we need to use a workaround.

    // For this test we create a div that acts as a renderer and insert a link
    const container = document.createElement("div");

    // Create a "ytd-video-renderer" element (jsdom won't recognize custom elements
    // but document.createElement works for any tag name)
    const renderer = document.createElement("ytd-video-renderer");
    const link = document.createElement("a");
    link.id = "thumbnail";
    link.setAttribute("href", "/watch?v=abc12345678");
    renderer.appendChild(link);
    container.appendChild(renderer);

    document.body.appendChild(container);

    const result = extractAllVideoIds("search");
    expect(result.size).toBe(1);
    expect(result.has("abc12345678")).toBe(true);
  });
});
