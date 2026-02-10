import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

// Mock createRoot to prevent auto-mount side effect
vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({ render: vi.fn() })),
}));

let optionsModule: typeof import("../options");

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetModules();
  vi.mock("react-dom/client", () => ({
    createRoot: vi.fn(() => ({ render: vi.fn() })),
  }));

  // Set up default storage values
  chrome.storage.sync.set({
    enabled: true,
    shortsFilterEnabled: true,
    defaultAction: "hide",
    hideThreshold: 50,
    categoryThresholds: {
      fully_ai: 50,
      ai_voiceover: 60,
      ai_visuals: 60,
      ai_thumbnails: 70,
      ai_assisted: 70,
    },
    badgeStyle: "badge",
    showNotifications: true,
    hashPrefixMode: true,
    serverUrl: "",
    cacheTtlMinutes: 30,
    debugLogging: false,
  });

  // Mock runtime messages
  chrome.runtime.sendMessage.mockImplementation(async (msg: any) => {
    switch (msg.type) {
      case "GET_USER_ID":
        return { success: true, data: { userId: "abcdef12" } };
      case "GET_USER_INFO":
        return {
          success: true,
          data: { userId: "abcdef12", trustScore: 75, totalVotes: 100, accuracyRate: 0.85 },
        };
      default:
        return { success: false };
    }
  });

  optionsModule = await import("../options");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Options", () => {
  it("shows loading state initially then settings", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    expect(screen.getByText("Loading settings...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("RealTube Settings")).toBeInTheDocument();
    });
  });

  it("loads and displays settings from storage", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText("RealTube Settings")).toBeInTheDocument();
    });

    // Check that "Enable RealTube" toggle exists
    expect(screen.getByText("Enable RealTube")).toBeInTheDocument();
  });

  it("toggles enabled setting", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText("Enable RealTube")).toBeInTheDocument();
    });

    // Find the toggle for "Enable RealTube" - it's the first checkbox
    const checkboxes = screen.getAllByRole("checkbox");
    const enableToggle = checkboxes[0]; // First toggle is "Enable RealTube"

    expect(enableToggle).toBeChecked();

    await act(async () => {
      fireEvent.click(enableToggle);
    });

    expect(enableToggle).not.toBeChecked();

    // Wait for debounced save
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // Verify storage was updated
    const stored = await new Promise<any>((resolve) => {
      chrome.storage.sync.get("enabled", (result: any) => resolve(result));
    });
    expect(stored.enabled).toBe(false);
  });

  it("displays server URL input field", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText("Server URL override")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("https://api.realtube.example");
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("changes server URL", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://api.realtube.example")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("https://api.realtube.example");

    await act(async () => {
      fireEvent.change(input, { target: { value: "https://custom.api.com" } });
    });

    expect((input as HTMLInputElement).value).toBe("https://custom.api.com");
  });

  it("displays category threshold sliders", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText("Global hide threshold")).toBeInTheDocument();
    });

    // All 5 categories should have sliders
    expect(screen.getByText("Fully AI-Generated")).toBeInTheDocument();
    expect(screen.getByText("AI Voiceover")).toBeInTheDocument();
    expect(screen.getByText("AI Visuals")).toBeInTheDocument();
    expect(screen.getByText("AI Thumbnails Only")).toBeInTheDocument();
    expect(screen.getByText("AI-Assisted")).toBeInTheDocument();
  });

  it("changes global hide threshold", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText("Global hide threshold")).toBeInTheDocument();
    });

    // Find range inputs (sliders)
    const sliders = screen.getAllByRole("slider");
    const globalSlider = sliders[0]; // First slider is the global threshold

    await act(async () => {
      fireEvent.change(globalSlider, { target: { value: "75" } });
    });

    expect((globalSlider as HTMLInputElement).value).toBe("75");
  });

  it("displays About section with version", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText("About")).toBeInTheDocument();
    });

    expect(screen.getByText("0.1.0")).toBeInTheDocument();
  });

  it("shows saved toast after changing a setting", async () => {
    const { Options } = optionsModule;
    render(<Options />);

    await waitFor(() => {
      expect(screen.getByText("Enable RealTube")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });

    // Wait for debounced save + toast
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByText("Settings saved")).toBeInTheDocument();
  });
});
