// RealTube Popup UI
// Extension control panel — status, video info, quick vote, user stats, cache info

import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";

// ── Types ──

interface UserInfo {
  userId: string;
  trustScore: number;
  totalVotes: number;
  accuracyRate: number;
  accountAge: number;
  isVip: boolean;
}

interface CachedVideo {
  videoId: string;
  score: number;
  categories: Record<string, { votes: number; weightedScore: number }>;
  channelId: string;
  lastUpdated: string;
}

interface SyncStatus {
  lastDeltaSync: string | null;
  lastFullSync: string | null;
  videoCount: number;
  channelCount: number;
}

interface VoteFeedback {
  type: "success" | "error";
  message: string;
}

// ── Helpers ──

async function sendMessage(
  type: string,
  payload?: unknown
): Promise<{ success: boolean; data?: any; error?: string }> {
  return chrome.runtime.sendMessage({ type, payload });
}

function getVideoIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      return u.searchParams.get("v");
    }
  } catch {
    /* ignore */
  }
  return null;
}

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return "Never";
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function scoreColor(score: number): string {
  if (score < 30) return "var(--rt-success)";
  if (score < 60) return "var(--rt-warning)";
  return "var(--rt-danger)";
}

function scoreVerdict(score: number): { text: string; cls: string } {
  if (score < 30) return { text: "Likely Human", cls: "clean" };
  if (score < 60) return { text: "Suspect", cls: "suspect" };
  return { text: "Likely AI", cls: "flagged" };
}

// ── SVG Icons (inline) ──

const IconScan = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7V2h5" /><path d="M22 7V2h-5" /><path d="M2 17v5h5" /><path d="M22 17v5h-5" /><circle cx="12" cy="12" r="4" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
);

const IconPause = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="10" y1="15" x2="10" y2="9" /><line x1="14" y1="15" x2="14" y2="9" />
  </svg>
);

// Category metadata
const CATEGORIES = [
  { id: "fully_ai", label: "Fully AI", icon: "\u2b22" },
  { id: "ai_voiceover", label: "AI Voice", icon: "\u266a" },
  { id: "ai_visuals", label: "AI Visuals", icon: "\u25c6" },
  { id: "ai_thumbnails", label: "AI Thumb", icon: "\u25a3" },
  { id: "ai_assisted", label: "AI Assist", icon: "\u2726" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  fully_ai: "Fully AI",
  ai_voiceover: "AI Voice",
  ai_visuals: "AI Visuals",
  ai_thumbnails: "AI Thumb",
  ai_assisted: "AI Assist",
};

// ── Score Ring Component ──

function ScoreRing({ score }: { score: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="rt-score-ring">
      <svg viewBox="0 0 48 48">
        <circle className="rt-score-ring-bg" cx="24" cy="24" r={radius} />
        <circle
          className="rt-score-ring-fill"
          cx="24"
          cy="24"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="rt-score-ring-value" style={{ color }}>
        {Math.round(score)}
      </span>
    </div>
  );
}

// ── StatusBar ──

function StatusBar({
  enabled,
  onToggle,
  connected,
}: {
  enabled: boolean;
  onToggle: () => void;
  connected: "online" | "offline" | "unknown";
}) {
  return (
    <div className="rt-header">
      <div className="rt-header-left">
        <span className="rt-logo-icon"><IconScan /></span>
        <span className="rt-header-title">
          RealTube
          <span className="rt-header-version">v0.1.0</span>
        </span>
      </div>
      <div className="rt-header-right">
        <span
          className={`rt-conn-dot ${connected}`}
          title={connected === "online" ? "Connected" : connected === "offline" ? "Offline" : "Checking..."}
        />
        <label className="rt-toggle" title={enabled ? "Disable RealTube" : "Enable RealTube"}>
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          <span className="rt-toggle-track" />
          <span className="rt-toggle-thumb" />
        </label>
      </div>
    </div>
  );
}

// ── Current Video Info ──

function CurrentVideoInfo({ video }: { video: CachedVideo | null }) {
  if (!video) {
    return (
      <div className="rt-section">
        <div className="rt-section-label">Current Video</div>
        <div className="rt-no-data">No AI data for this video</div>
      </div>
    );
  }

  const verdict = scoreVerdict(video.score);
  const catEntries = Object.entries(video.categories || {}).sort(
    (a, b) => b[1].weightedScore - a[1].weightedScore
  );
  const maxScore = catEntries.length > 0 ? Math.max(...catEntries.map(([, c]) => c.weightedScore)) : 1;

  return (
    <div className="rt-section">
      <div className="rt-section-label">Current Video</div>
      <div className="rt-video-score-row">
        <ScoreRing score={video.score} />
        <div className="rt-video-meta">
          <div className={`rt-video-verdict ${verdict.cls}`}>{verdict.text}</div>
          <div className="rt-video-id">{video.videoId}</div>
        </div>
      </div>
      {catEntries.length > 0 && (
        <div className="rt-cat-bars">
          {catEntries.map(([catId, cat]) => (
            <div className="rt-cat-bar-row" key={catId}>
              <span className="rt-cat-bar-label">{CATEGORY_LABELS[catId] || catId}</span>
              <div className="rt-cat-bar-track">
                <div
                  className="rt-cat-bar-fill"
                  style={{ width: `${(cat.weightedScore / Math.max(maxScore, 1)) * 100}%` }}
                />
              </div>
              <span className="rt-cat-bar-value">{cat.votes}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Vote ──

function QuickVote({
  videoId,
  onVote,
  feedback,
  submitting,
}: {
  videoId: string;
  onVote: (category: string) => void;
  feedback: VoteFeedback | null;
  submitting: string | null;
}) {
  if (feedback) {
    return (
      <div className="rt-section">
        <div className="rt-section-label">Quick Vote</div>
        <div className={`rt-vote-feedback ${feedback.type}`}>
          {feedback.type === "success" ? <IconCheck /> : <IconX />}
          <span>{feedback.message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rt-section">
      <div className="rt-section-label">Quick Vote</div>
      <div className="rt-quick-vote-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`rt-qv-btn${submitting === cat.id ? " voted" : ""}`}
            disabled={submitting !== null}
            onClick={() => onVote(cat.id)}
          >
            {submitting === cat.id ? (
              <span className="rt-spinner" />
            ) : (
              <span>{cat.icon}</span>
            )}
            <span>{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── User Stats ──

function UserStats({ info }: { info: UserInfo | null }) {
  if (!info) return null;

  return (
    <div className="rt-section">
      <div className="rt-section-label">Your Stats</div>
      <div className="rt-stats-grid">
        <div className="rt-stat-card">
          <div className="rt-stat-value accent">{Math.round(info.trustScore)}</div>
          <div className="rt-stat-label">Trust</div>
        </div>
        <div className="rt-stat-card">
          <div className="rt-stat-value">{info.totalVotes.toLocaleString()}</div>
          <div className="rt-stat-label">Votes</div>
        </div>
        <div className="rt-stat-card">
          <div className="rt-stat-value">{Math.round(info.accuracyRate)}%</div>
          <div className="rt-stat-label">Accuracy</div>
        </div>
      </div>
    </div>
  );
}

// ── Cache Info ──

function CacheInfo({
  syncStatus,
  onSync,
  syncing,
}: {
  syncStatus: SyncStatus | null;
  onSync: () => void;
  syncing: boolean;
}) {
  if (!syncStatus) return null;

  return (
    <div className="rt-section">
      <div className="rt-section-label">Cache</div>
      <div className="rt-cache-row">
        <span className="rt-cache-key">Videos cached</span>
        <span className="rt-cache-val">{syncStatus.videoCount.toLocaleString()}</span>
      </div>
      <div className="rt-cache-row">
        <span className="rt-cache-key">Channels cached</span>
        <span className="rt-cache-val">{syncStatus.channelCount.toLocaleString()}</span>
      </div>
      <div className="rt-cache-row">
        <span className="rt-cache-key">Last sync</span>
        <span className="rt-cache-val">{formatTimeAgo(syncStatus.lastDeltaSync)}</span>
      </div>
      <button
        className={`rt-sync-btn${syncing ? " syncing" : ""}`}
        onClick={onSync}
        disabled={syncing}
      >
        <IconRefresh />
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}

// ── Main Popup ──

function Popup() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [connected, setConnected] = useState<"online" | "offline" | "unknown">("unknown");
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentVideo, setCurrentVideo] = useState<CachedVideo | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [voteFeedback, setVoteFeedback] = useState<VoteFeedback | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Load all data on mount
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        // Read enabled state
        const storage = await chrome.storage.sync.get("enabled");
        if (cancelled) return;
        setEnabled(storage.enabled !== false);

        // Get current tab to detect watch page
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const videoId = tab?.url ? getVideoIdFromUrl(tab.url) : null;
        if (cancelled) return;
        setCurrentVideoId(videoId);

        // Parallel data fetches
        const promises: Promise<void>[] = [];

        // User info
        promises.push(
          sendMessage("GET_USER_INFO").then((res) => {
            if (!cancelled && res.success) {
              setUserInfo(res.data as UserInfo);
              setConnected("online");
            }
          }).catch(() => {
            if (!cancelled) setConnected("offline");
          })
        );

        // Sync status
        promises.push(
          sendMessage("GET_SYNC_STATUS").then((res) => {
            if (!cancelled && res.success) setSyncStatus(res.data as SyncStatus);
          }).catch(() => {})
        );

        // Current video data
        if (videoId) {
          promises.push(
            sendMessage("CHECK_VIDEOS", { videoIds: [videoId] }).then((res) => {
              if (!cancelled && res.success && res.data?.videos?.length > 0) {
                const found = (res.data.videos as CachedVideo[]).find(
                  (v) => v.videoId === videoId
                );
                if (found) setCurrentVideo(found);
              }
            }).catch(() => {})
          );
        }

        await Promise.all(promises);
      } catch {
        if (!cancelled) setConnected("offline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    chrome.storage.sync.set({ enabled: next });
  }, [enabled]);

  const handleVote = useCallback(async (category: string) => {
    if (!currentVideoId || submitting) return;
    setSubmitting(category);
    setVoteFeedback(null);

    try {
      const res = await sendMessage("SUBMIT_VOTE", {
        videoId: currentVideoId,
        category,
      });
      if (res.success) {
        setVoteFeedback({ type: "success", message: "Vote submitted" });
      } else {
        setVoteFeedback({ type: "error", message: res.error || "Vote failed" });
      }
    } catch (err) {
      setVoteFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Connection error",
      });
    } finally {
      setSubmitting(null);
      // Clear feedback after delay
      setTimeout(() => setVoteFeedback(null), 3000);
    }
  }, [currentVideoId, submitting]);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await sendMessage("SYNC_DELTA");
      // Refresh sync status after sync
      const res = await sendMessage("GET_SYNC_STATUS");
      if (res.success) setSyncStatus(res.data as SyncStatus);
    } catch {
      /* silent */
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  if (loading) {
    return (
      <div className="rt-popup-loading">
        <span className="rt-spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <>
      <StatusBar enabled={enabled} onToggle={handleToggle} connected={connected} />

      {!enabled ? (
        <div className="rt-disabled-banner">
          <IconPause />
          <span>RealTube is paused</span>
        </div>
      ) : (
        <>
          {currentVideoId && (
            <>
              <CurrentVideoInfo video={currentVideo} />
              <QuickVote
                videoId={currentVideoId}
                onVote={handleVote}
                feedback={voteFeedback}
                submitting={submitting}
              />
            </>
          )}
          <UserStats info={userInfo} />
          <CacheInfo syncStatus={syncStatus} onSync={handleSync} syncing={syncing} />
        </>
      )}

      <div className="rt-footer">
        <span className="rt-footer-text">RealTube &mdash; Community AI Detection</span>
      </div>
    </>
  );
}

// Mount
const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
