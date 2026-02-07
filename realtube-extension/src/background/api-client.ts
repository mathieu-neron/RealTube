// API client with retry/exponential backoff for communicating with RealTube server

const DEFAULT_BASE_URL = "http://localhost";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface ApiClientConfig {
  baseUrl: string;
}

export interface VoteRequest {
  videoId: string;
  category: string;
  userId: string;
  userAgent: string;
}

export interface VoteResponse {
  success: boolean;
  newScore: number;
  userTrust: number;
}

export interface VideoResult {
  videoId: string;
  score: number;
  categories: Record<string, { votes: number; weightedScore: number }>;
  totalVotes: number;
  locked: boolean;
  channelId: string;
  channelScore: number;
  lastUpdated: string;
}

export interface SyncDeltaResponse {
  videos: Array<{
    videoId: string;
    score?: number;
    categories?: Record<string, { votes: number; weightedScore: number }>;
    action: "update" | "remove";
  }>;
  channels: Array<{
    channelId: string;
    score?: number;
    action: "update" | "remove";
  }>;
  syncTimestamp: string;
}

export interface SyncFullResponse {
  videos: VideoResult[];
  channels: Array<{
    channelId: string;
    score: number;
    totalVideos: number;
    flaggedVideos: number;
    lastUpdated: string;
  }>;
  generatedAt: string;
}

export interface UserInfoResponse {
  userId: string;
  trustScore: number;
  totalVotes: number;
  accuracyRate: number;
  accountAge: number;
  isVip: boolean;
}

function getConfig(): ApiClientConfig {
  return { baseUrl: DEFAULT_BASE_URL };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry client errors (4xx) except 429
      if (response.status === 429 && attempt < retries) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`RealTube API: rate limited, retrying in ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      return response;
    } catch (err) {
      if (attempt < retries) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(
          `RealTube API: request failed, retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})`
        );
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error("fetchWithRetry exhausted retries");
}

/** Lookup videos by hash prefix (privacy-preserving). */
export async function lookupVideosByPrefix(
  hashPrefix: string
): Promise<VideoResult[]> {
  const { baseUrl } = getConfig();
  const response = await fetchWithRetry(
    `${baseUrl}/api/videos/${encodeURIComponent(hashPrefix)}`
  );
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

/** Submit a vote. */
export async function submitVote(vote: VoteRequest): Promise<VoteResponse> {
  const { baseUrl } = getConfig();
  const response = await fetchWithRetry(`${baseUrl}/api/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vote),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Vote failed: ${response.status}`);
  }
  return response.json();
}

/** Delete a vote. */
export async function deleteVote(
  videoId: string,
  userId: string
): Promise<void> {
  const { baseUrl } = getConfig();
  const response = await fetchWithRetry(`${baseUrl}/api/votes`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, userId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body?.error?.message || `Delete vote failed: ${response.status}`
    );
  }
}

/** Fetch delta sync changes since timestamp. */
export async function syncDelta(since: string): Promise<SyncDeltaResponse> {
  const { baseUrl } = getConfig();
  const response = await fetchWithRetry(
    `${baseUrl}/api/sync/delta?since=${encodeURIComponent(since)}`
  );
  if (!response.ok) throw new Error(`Sync delta failed: ${response.status}`);
  return response.json();
}

/** Fetch full cache blob. */
export async function syncFull(): Promise<SyncFullResponse> {
  const { baseUrl } = getConfig();
  const response = await fetchWithRetry(`${baseUrl}/api/sync/full`);
  if (!response.ok) throw new Error(`Sync full failed: ${response.status}`);
  return response.json();
}

/** Fetch user info. */
export async function getUserInfo(userId: string): Promise<UserInfoResponse> {
  const { baseUrl } = getConfig();
  const response = await fetchWithRetry(
    `${baseUrl}/api/users/${encodeURIComponent(userId)}`
  );
  if (!response.ok) throw new Error(`User info failed: ${response.status}`);
  return response.json();
}
