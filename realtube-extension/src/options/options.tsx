// RealTube Options Page
// Full-tab settings dashboard — General, Categories, Appearance, Privacy, Advanced, About

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";

// ── Types ──

interface Settings {
  enabled: boolean;
  shortsFilterEnabled: boolean;
  defaultAction: "hide" | "warn" | "dim" | "ignore";
  hideThreshold: number;
  categoryThresholds: Record<string, number>;
  badgeStyle: "dot" | "badge" | "none";
  showNotifications: boolean;
  hashPrefixMode: boolean;
  serverUrl: string;
  cacheTtlMinutes: number;
  debugLogging: boolean;
}

interface UserInfo {
  userId: string;
  trustScore: number;
  totalVotes: number;
  accuracyRate: number;
}

const DEFAULT_SETTINGS: Settings = {
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
};

const CATEGORIES = [
  { id: "fully_ai", label: "Fully AI-Generated", desc: "Entire video is AI: visuals, audio, script" },
  { id: "ai_voiceover", label: "AI Voiceover", desc: "Real footage with AI-generated narration" },
  { id: "ai_visuals", label: "AI Visuals", desc: "AI-generated images/video with human voice" },
  { id: "ai_thumbnails", label: "AI Thumbnails Only", desc: "Only thumbnail is AI-generated" },
  { id: "ai_assisted", label: "AI-Assisted", desc: "Significant AI editing/enhancement" },
] as const;

// ── Helpers ──

async function sendMessage(
  type: string,
  payload?: unknown
): Promise<{ success: boolean; data?: any; error?: string }> {
  return chrome.runtime.sendMessage({ type, payload });
}

async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => {
      resolve({
        enabled: items.enabled !== undefined ? items.enabled : DEFAULT_SETTINGS.enabled,
        shortsFilterEnabled: items.shortsFilterEnabled !== undefined ? items.shortsFilterEnabled : DEFAULT_SETTINGS.shortsFilterEnabled,
        defaultAction: items.defaultAction || DEFAULT_SETTINGS.defaultAction,
        hideThreshold: items.hideThreshold !== undefined ? items.hideThreshold : DEFAULT_SETTINGS.hideThreshold,
        categoryThresholds: {
          ...DEFAULT_SETTINGS.categoryThresholds,
          ...(items.categoryThresholds || {}),
        },
        badgeStyle: items.badgeStyle || DEFAULT_SETTINGS.badgeStyle,
        showNotifications: items.showNotifications !== undefined ? items.showNotifications : DEFAULT_SETTINGS.showNotifications,
        hashPrefixMode: items.hashPrefixMode !== undefined ? items.hashPrefixMode : DEFAULT_SETTINGS.hashPrefixMode,
        serverUrl: items.serverUrl || DEFAULT_SETTINGS.serverUrl,
        cacheTtlMinutes: items.cacheTtlMinutes !== undefined ? items.cacheTtlMinutes : DEFAULT_SETTINGS.cacheTtlMinutes,
        debugLogging: items.debugLogging !== undefined ? items.debugLogging : DEFAULT_SETTINGS.debugLogging,
      });
    });
  });
}

// ── SVG Icons ──

const IconScan = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7V2h5" /><path d="M22 7V2h-5" /><path d="M2 17v5h5" /><path d="M22 17v5h-5" /><circle cx="12" cy="12" r="4" />
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconSliders = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const IconEye = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconTerminal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const IconInfo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

// ── Toggle Component ──

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="rt-opts-toggle" style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="rt-opts-toggle-track" />
      <span className="rt-opts-toggle-thumb" />
    </label>
  );
}

// ── Slider Component ──

function Slider({
  label,
  value,
  onChange,
  desc,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  desc?: string;
}) {
  // Compute inline style for teal fill progress
  const pct = value;
  const trackStyle = {
    background: `linear-gradient(to right, var(--rt-accent) 0%, var(--rt-accent) ${pct}%, var(--rt-surface-raised) ${pct}%, var(--rt-surface-raised) 100%)`,
  };

  return (
    <div className="rt-opts-slider-row">
      <div className="rt-opts-slider-header">
        <span className="rt-opts-slider-label">{label}</span>
        <span className="rt-opts-slider-value">{value}</span>
      </div>
      {desc && <div className="rt-opts-row-desc" style={{ marginBottom: 6 }}>{desc}</div>}
      <input
        type="range"
        className="rt-opts-slider"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={trackStyle}
      />
    </div>
  );
}

// ── Main Options Page ──

function Options() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [userId, setUserId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings and user data on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const s = await loadSettings();
      if (cancelled) return;
      setSettings(s);
      setLoading(false);

      // Fetch user data in background
      try {
        const idRes = await sendMessage("GET_USER_ID");
        if (!cancelled && idRes.success) setUserId(idRes.data?.userId || null);
      } catch { /* silent */ }
      try {
        const infoRes = await sendMessage("GET_USER_INFO");
        if (!cancelled && infoRes.success) setUserInfo(infoRes.data as UserInfo);
      } catch { /* silent */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Save helper with debounce and toast
  const save = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      // Debounce the actual storage write
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        chrome.storage.sync.set(next);
        // Show toast
        setToastVisible(true);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastVisible(false), 1500);
      }, 300);
      return next;
    });
  }, []);

  // Convenience for updating a single category threshold
  const setCategoryThreshold = useCallback(
    (catId: string, value: number) => {
      const updated = { ...settings.categoryThresholds, [catId]: value };
      save({ categoryThresholds: updated });
    },
    [settings.categoryThresholds, save]
  );

  if (loading) {
    return (
      <>
        <div className="rt-opts-topbar" />
        <div className="rt-opts-container">
          <div className="rt-opts-loading">
            <span className="rt-opts-spinner" />
            <span>Loading settings...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="rt-opts-topbar" />
      <div className="rt-opts-container">
        {/* Header */}
        <div className="rt-opts-header">
          <span className="rt-opts-logo"><IconScan /></span>
          <span className="rt-opts-title">RealTube Settings</span>
          <span className="rt-opts-subtitle">v0.1.0</span>
        </div>

        {/* General */}
        <div className="rt-opts-section">
          <div className="rt-opts-section-header">
            <span className="rt-opts-section-icon"><IconSettings /></span>
            <span className="rt-opts-section-title">General</span>
          </div>
          <div className="rt-opts-section-body">
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Enable RealTube</div>
                <div className="rt-opts-row-desc">Detect and hide AI-generated videos on YouTube</div>
              </div>
              <Toggle checked={settings.enabled} onChange={(v) => save({ enabled: v })} />
            </div>
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Default action for flagged videos</div>
                <div className="rt-opts-row-desc">What happens when a video exceeds the threshold</div>
              </div>
              <select
                className="rt-opts-select"
                value={settings.defaultAction}
                onChange={(e) => save({ defaultAction: e.target.value as Settings["defaultAction"] })}
              >
                <option value="hide">Hide</option>
                <option value="warn">Warn</option>
                <option value="dim">Dim</option>
                <option value="ignore">Ignore</option>
              </select>
            </div>
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Filter Shorts</div>
                <div className="rt-opts-row-desc">Automatically skip flagged AI videos in YouTube Shorts</div>
              </div>
              <Toggle checked={settings.shortsFilterEnabled} onChange={(v) => save({ shortsFilterEnabled: v })} />
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="rt-opts-section">
          <div className="rt-opts-section-header">
            <span className="rt-opts-section-icon"><IconSliders /></span>
            <span className="rt-opts-section-title">Category Thresholds</span>
          </div>
          <div className="rt-opts-section-body">
            <Slider
              label="Global hide threshold"
              value={settings.hideThreshold}
              onChange={(v) => save({ hideThreshold: v })}
              desc="Minimum AI score to trigger the default action"
            />
            {CATEGORIES.map((cat) => (
              <Slider
                key={cat.id}
                label={cat.label}
                value={settings.categoryThresholds[cat.id] ?? 50}
                onChange={(v) => setCategoryThreshold(cat.id, v)}
                desc={cat.desc}
              />
            ))}
          </div>
        </div>

        {/* Appearance */}
        <div className="rt-opts-section">
          <div className="rt-opts-section-header">
            <span className="rt-opts-section-icon"><IconEye /></span>
            <span className="rt-opts-section-title">Appearance</span>
          </div>
          <div className="rt-opts-section-body">
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Badge style</div>
                <div className="rt-opts-row-desc">Icon badge shown on flagged video thumbnails</div>
              </div>
              <select
                className="rt-opts-select"
                value={settings.badgeStyle}
                onChange={(e) => save({ badgeStyle: e.target.value as Settings["badgeStyle"] })}
              >
                <option value="badge">Badge</option>
                <option value="dot">Dot</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Show notifications</div>
                <div className="rt-opts-row-desc">Notify when new AI detections are found on the page</div>
              </div>
              <Toggle
                checked={settings.showNotifications}
                onChange={(v) => save({ showNotifications: v })}
              />
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="rt-opts-section">
          <div className="rt-opts-section-header">
            <span className="rt-opts-section-icon"><IconShield /></span>
            <span className="rt-opts-section-title">Privacy</span>
          </div>
          <div className="rt-opts-section-body">
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Hash-prefix mode</div>
                <div className="rt-opts-row-desc">Send only a prefix of the video hash to the server (always enabled)</div>
              </div>
              <Toggle checked={settings.hashPrefixMode} onChange={() => {}} disabled />
            </div>
            <div className="rt-opts-row" style={{ display: "block" }}>
              <div className="rt-opts-info-block">
                <strong>How your privacy is protected:</strong> RealTube never sends full video IDs to the server.
                Instead, it sends a short hash prefix (first 4 characters of SHA-256) which matches multiple videos,
                making it impossible for the server to know exactly which video you are watching.
                Your user ID is generated locally and hashed 5,000 times before being sent to the server.
                No browsing history, IP addresses, or personal data is collected.
              </div>
            </div>
          </div>
        </div>

        {/* Advanced */}
        <div className="rt-opts-section">
          <div className="rt-opts-section-header">
            <span className="rt-opts-section-icon"><IconTerminal /></span>
            <span className="rt-opts-section-title">Advanced</span>
          </div>
          <div className="rt-opts-section-body">
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Server URL override</div>
                <div className="rt-opts-row-desc">Leave empty to use the default server</div>
              </div>
              <input
                type="text"
                className="rt-opts-input"
                placeholder="https://api.realtube.example"
                value={settings.serverUrl}
                onChange={(e) => save({ serverUrl: e.target.value })}
              />
            </div>
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Cache TTL (minutes)</div>
                <div className="rt-opts-row-desc">How long cached data is considered fresh</div>
              </div>
              <input
                type="number"
                className="rt-opts-input"
                min={5}
                max={1440}
                value={settings.cacheTtlMinutes}
                onChange={(e) => save({ cacheTtlMinutes: Math.max(5, Math.min(1440, Number(e.target.value) || 30)) })}
              />
            </div>
            <div className="rt-opts-row">
              <div className="rt-opts-row-info">
                <div className="rt-opts-row-label">Debug logging</div>
                <div className="rt-opts-row-desc">Log detailed messages to the browser console</div>
              </div>
              <Toggle
                checked={settings.debugLogging}
                onChange={(v) => save({ debugLogging: v })}
              />
            </div>
          </div>
        </div>

        {/* About */}
        <div className="rt-opts-section">
          <div className="rt-opts-section-header">
            <span className="rt-opts-section-icon"><IconInfo /></span>
            <span className="rt-opts-section-title">About</span>
          </div>
          <div className="rt-opts-section-body">
            <div className="rt-opts-about-grid">
              <div className="rt-opts-about-item">
                <div className="rt-opts-about-label">Version</div>
                <div className="rt-opts-about-value">0.1.0</div>
              </div>
              <div className="rt-opts-about-item">
                <div className="rt-opts-about-label">Trust Score</div>
                <div className="rt-opts-about-value accent">
                  {userInfo ? Math.round(userInfo.trustScore) : "\u2014"}
                </div>
              </div>
              <div className="rt-opts-about-item" style={{ gridColumn: "1 / -1" }}>
                <div className="rt-opts-about-label">User ID</div>
                <div className="rt-opts-about-value mono">
                  {userId ? `${userId.substring(0, 8)}...` : "Loading..."}
                </div>
              </div>
            </div>
            <div className="rt-opts-links">
              <a href="https://github.com/mathieu-neron/RealTube" className="rt-opts-link" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              <a href="https://github.com/mathieu-neron/RealTube/blob/master/docs/design/security-design.md" className="rt-opts-link" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Save toast */}
      <div className={`rt-opts-toast${toastVisible ? " visible" : ""}`}>
        <IconCheck />
        <span>Settings saved</span>
      </div>
    </>
  );
}

// Mount
const root = createRoot(document.getElementById("root")!);
root.render(<Options />);
