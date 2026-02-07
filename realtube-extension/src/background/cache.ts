// IndexedDB cache for flagged videos, channels, and pending votes
// Design: infrastructure-design.md section 12 (Client-Side)

const DB_NAME = "realtube";
const DB_VERSION = 1;

export interface CachedVideo {
  videoId: string;
  score: number;
  categories: Record<string, { votes: number; weightedScore: number }>;
  channelId: string;
  lastUpdated: string;
}

export interface CachedChannel {
  channelId: string;
  score: number;
  autoFlag: boolean;
  lastUpdated: string;
}

export interface PendingVote {
  videoId: string;
  category: string;
  timestamp: number;
}

interface CacheMeta {
  key: string;
  value: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos", { keyPath: "videoId" });
      }
      if (!db.objectStoreNames.contains("channels")) {
        db.createObjectStore("channels", { keyPath: "channelId" });
      }
      if (!db.objectStoreNames.contains("pendingVotes")) {
        const store = db.createObjectStore("pendingVotes", {
          keyPath: "videoId",
        });
        store.createIndex("timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (!dbInstance) {
    dbInstance = await openDB();
  }
  return dbInstance;
}

function txPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Video operations ---

export async function getVideo(videoId: string): Promise<CachedVideo | undefined> {
  const db = await getDB();
  const tx = db.transaction("videos", "readonly");
  return txPromise(tx.objectStore("videos").get(videoId));
}

export async function getVideos(videoIds: string[]): Promise<CachedVideo[]> {
  const db = await getDB();
  const tx = db.transaction("videos", "readonly");
  const store = tx.objectStore("videos");
  const results: CachedVideo[] = [];
  for (const id of videoIds) {
    const video = await txPromise(store.get(id));
    if (video) results.push(video);
  }
  return results;
}

export async function putVideo(video: CachedVideo): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("videos", "readwrite");
  tx.objectStore("videos").put(video);
  await txComplete(tx);
}

export async function putVideos(videos: CachedVideo[]): Promise<void> {
  if (videos.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("videos", "readwrite");
  const store = tx.objectStore("videos");
  for (const video of videos) {
    store.put(video);
  }
  await txComplete(tx);
}

export async function deleteVideo(videoId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("videos", "readwrite");
  tx.objectStore("videos").delete(videoId);
  await txComplete(tx);
}

export async function clearVideos(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("videos", "readwrite");
  tx.objectStore("videos").clear();
  await txComplete(tx);
}

export async function getVideoCount(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction("videos", "readonly");
  return txPromise(tx.objectStore("videos").count());
}

// --- Channel operations ---

export async function getChannel(
  channelId: string
): Promise<CachedChannel | undefined> {
  const db = await getDB();
  const tx = db.transaction("channels", "readonly");
  return txPromise(tx.objectStore("channels").get(channelId));
}

export async function putChannel(channel: CachedChannel): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("channels", "readwrite");
  tx.objectStore("channels").put(channel);
  await txComplete(tx);
}

export async function putChannels(channels: CachedChannel[]): Promise<void> {
  if (channels.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("channels", "readwrite");
  const store = tx.objectStore("channels");
  for (const channel of channels) {
    store.put(channel);
  }
  await txComplete(tx);
}

export async function deleteChannel(channelId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("channels", "readwrite");
  tx.objectStore("channels").delete(channelId);
  await txComplete(tx);
}

export async function clearChannels(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("channels", "readwrite");
  tx.objectStore("channels").clear();
  await txComplete(tx);
}

export async function getChannelCount(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction("channels", "readonly");
  return txPromise(tx.objectStore("channels").count());
}

// --- Pending vote operations (offline queue) ---

export async function addPendingVote(vote: PendingVote): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pendingVotes", "readwrite");
  tx.objectStore("pendingVotes").put(vote);
  await txComplete(tx);
}

export async function getPendingVotes(): Promise<PendingVote[]> {
  const db = await getDB();
  const tx = db.transaction("pendingVotes", "readonly");
  return txPromise(tx.objectStore("pendingVotes").getAll());
}

export async function removePendingVote(videoId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pendingVotes", "readwrite");
  tx.objectStore("pendingVotes").delete(videoId);
  await txComplete(tx);
}

export async function clearPendingVotes(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pendingVotes", "readwrite");
  tx.objectStore("pendingVotes").clear();
  await txComplete(tx);
}

// --- Meta operations (last sync time, etc.) ---

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  const tx = db.transaction("meta", "readonly");
  const result: CacheMeta | undefined = await txPromise(
    tx.objectStore("meta").get(key)
  );
  return result?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value } as CacheMeta);
  await txComplete(tx);
}
