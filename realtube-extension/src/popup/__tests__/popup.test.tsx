import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock createRoot to prevent auto-mount side effect at import time
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({ render: vi.fn() })),
}));

// Must import AFTER mocking react-dom/client
let popupModule: typeof import("../popup");

beforeEach(async () => {
  vi.resetModules();
  vi.mock("react-dom/client", () => ({
    createRoot: vi.fn(() => ({ render: vi.fn() })),
  }));
  popupModule = await import("../popup");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QuickVote", () => {
  it("renders 5 category buttons", () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={null}
        submitting={null}
      />
    );

    const buttons = screen.getAllByRole("button");
    // 5 category buttons + 1 Vote button = 6
    expect(buttons).toHaveLength(6);
  });

  it("shows no category selected initially", () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={null}
        submitting={null}
      />
    );

    const selectedButtons = document.querySelectorAll(".rt-qv-btn.selected");
    expect(selectedButtons).toHaveLength(0);
  });

  it("Vote button is disabled when nothing is selected", () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={null}
        submitting={null}
      />
    );

    const voteBtn = screen.getByRole("button", { name: "Vote" });
    expect(voteBtn).toBeDisabled();
  });

  it("clicking a category selects it and enables Vote", async () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={null}
        submitting={null}
      />
    );

    const fullyAiBtn = screen.getByRole("button", { name: /Fully AI/i });
    await act(async () => {
      fireEvent.click(fullyAiBtn);
    });

    expect(fullyAiBtn.className).toContain("selected");
    expect(screen.getByRole("button", { name: "Vote" })).not.toBeDisabled();
  });

  it("clicking the same category again deselects it and disables Vote", async () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={null}
        submitting={null}
      />
    );

    const fullyAiBtn = screen.getByRole("button", { name: /Fully AI/i });

    await act(async () => { fireEvent.click(fullyAiBtn); });
    expect(fullyAiBtn.className).toContain("selected");

    await act(async () => { fireEvent.click(fullyAiBtn); });
    expect(fullyAiBtn.className).not.toContain("selected");
    expect(screen.getByRole("button", { name: "Vote" })).toBeDisabled();
  });

  it("clicking Vote calls onVote with the selected category", async () => {
    const onVote = vi.fn();
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={onVote}
        feedback={null}
        submitting={null}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /AI Voice/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Vote" }));
    });

    expect(onVote).toHaveBeenCalledWith("ai_voiceover");
  });

  it("disables all buttons during submission", () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={null}
        submitting="fully_ai"
      />
    );

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("shows success feedback instead of buttons", () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={{ type: "success", message: "Vote submitted" }}
        submitting={null}
      />
    );

    expect(screen.getByText("Vote submitted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vote" })).not.toBeInTheDocument();
  });

  it("shows error feedback", () => {
    const { QuickVote } = popupModule;
    render(
      <QuickVote
        videoId="test123"
        onVote={vi.fn()}
        feedback={{ type: "error", message: "Connection error" }}
        submitting={null}
      />
    );

    expect(screen.getByText("Connection error")).toBeInTheDocument();
  });
});

describe("Popup", () => {
  beforeEach(() => {
    // Mock tabs.query to return a YouTube watch page
    chrome.tabs.query.mockImplementation(async () => [
      { url: "https://www.youtube.com/watch?v=test12345ab" },
    ]);
    // Mock storage to return enabled state
    chrome.storage.sync.set({ enabled: true });
    // Mock runtime.sendMessage for various message types
    chrome.runtime.sendMessage.mockImplementation(async (msg: any) => {
      switch (msg.type) {
        case "GET_USER_INFO":
          return {
            success: true,
            data: {
              userId: "abc123",
              trustScore: 75,
              totalVotes: 100,
              accuracyRate: 0.85,
              accountAge: 30,
              isVip: false,
            },
          };
        case "GET_SYNC_STATUS":
          return {
            success: true,
            data: {
              lastDeltaSync: "2025-06-01T00:00:00Z",
              lastFullSync: "2025-05-01T00:00:00Z",
              videoCount: 500,
              channelCount: 50,
            },
          };
        case "CHECK_VIDEOS":
          return {
            success: true,
            data: {
              videos: [
                {
                  videoId: "test12345ab",
                  score: 85,
                  categories: { fully_ai: { votes: 20, weightedScore: 85 } },
                  channelId: "ch1",
                  lastUpdated: "2025-06-01T00:00:00Z",
                },
              ],
            },
          };
        case "SUBMIT_VOTE":
          return { success: true, data: { newScore: 90, userTrust: 50 } };
        default:
          return { success: false, error: "Unknown" };
      }
    });
  });

  it("shows loading spinner initially", async () => {
    const { Popup } = popupModule;
    const { container } = render(<Popup />);

    // Should show loading state initially
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows paused banner when disabled", async () => {
    chrome.storage.sync.set({ enabled: false });
    const { Popup } = popupModule;

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("RealTube is paused")).toBeInTheDocument();
    });
  });

  it("shows QuickVote section when on a video page", async () => {
    const { Popup } = popupModule;

    render(<Popup />);

    await waitFor(() => {
      expect(screen.getByText("Quick Vote")).toBeInTheDocument();
    });
  });

  it("does not show QuickVote when not on a video page", async () => {
    chrome.tabs.query.mockImplementation(async () => [
      { url: "https://www.youtube.com/" },
    ]);
    const { Popup } = popupModule;

    render(<Popup />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Quick Vote")).not.toBeInTheDocument();
  });
});
