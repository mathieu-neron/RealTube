// Identity management: UUID generation + SHA256 iterated hashing
// Security design: anonymous extension IDs, 5000-iteration SHA256 for public ID

const STORAGE_KEY = "realtube_local_id";
const HASH_ITERATIONS = 5000;

function generateUUID(): string {
  // crypto.randomUUID() available in service workers and modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function iteratedHash(input: string, iterations: number): Promise<string> {
  let result = input;
  for (let i = 0; i < iterations; i++) {
    result = await sha256(result);
  }
  return result;
}

/** Get or create the local UUID (private, never sent to server). */
export async function getLocalId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        resolve(result[STORAGE_KEY]);
      } else {
        const id = generateUUID();
        chrome.storage.local.set({ [STORAGE_KEY]: id }, () => {
          console.log("RealTube: generated new local ID");
          resolve(id);
        });
      }
    });
  });
}

/** Derive the public user ID (5000x SHA256 of local UUID). Sent to server. */
export async function getPublicUserId(): Promise<string> {
  const localId = await getLocalId();
  return iteratedHash(localId, HASH_ITERATIONS);
}

/** Hash a video ID with SHA256 and return the specified prefix length. */
export async function hashVideoId(
  videoId: string,
  prefixLength: number = 4
): Promise<string> {
  const hash = await sha256(videoId);
  return hash.substring(0, prefixLength);
}
