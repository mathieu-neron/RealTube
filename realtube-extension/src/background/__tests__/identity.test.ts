import { describe, it, expect, beforeEach } from "vitest";
import { getLocalId, getPublicUserId, hashVideoId } from "../identity";

describe("identity", () => {
  beforeEach(() => {
    chrome.storage.local._reset();
  });

  describe("getLocalId", () => {
    it("generates a UUID on first call and stores it", async () => {
      const id = await getLocalId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      // Verify it was stored
      const stored = await new Promise<string>((resolve) => {
        chrome.storage.local.get("realtube_local_id", (result: any) => {
          resolve(result.realtube_local_id);
        });
      });
      expect(stored).toBe(id);
    });

    it("returns the same ID on subsequent calls", async () => {
      const id1 = await getLocalId();
      const id2 = await getLocalId();
      expect(id1).toBe(id2);
    });

    it("returns existing ID from storage", async () => {
      const existing = "11111111-2222-4333-a444-555555555555";
      chrome.storage.local.set({ realtube_local_id: existing });
      const id = await getLocalId();
      expect(id).toBe(existing);
    });
  });

  describe("getPublicUserId", () => {
    it("returns a 64-char hex string (SHA256 output)", async () => {
      const publicId = await getPublicUserId();
      expect(publicId).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for the same local ID", async () => {
      chrome.storage.local.set({
        realtube_local_id: "fixed-uuid-for-test",
      });
      const pub1 = await getPublicUserId();
      const pub2 = await getPublicUserId();
      expect(pub1).toBe(pub2);
    });

    it("differs from the local ID", async () => {
      const localId = await getLocalId();
      const publicId = await getPublicUserId();
      expect(publicId).not.toBe(localId);
    });
  });

  describe("hashVideoId", () => {
    it("returns a hex prefix of the specified length", async () => {
      const prefix = await hashVideoId("dQw4w9WgXcQ", 4);
      expect(prefix).toMatch(/^[0-9a-f]{4}$/);
      expect(prefix).toHaveLength(4);
    });

    it("defaults to prefix length 4", async () => {
      const prefix = await hashVideoId("dQw4w9WgXcQ");
      expect(prefix).toHaveLength(4);
    });

    it("returns longer prefix when requested", async () => {
      const prefix = await hashVideoId("dQw4w9WgXcQ", 8);
      expect(prefix).toMatch(/^[0-9a-f]{8}$/);
    });

    it("is deterministic", async () => {
      const p1 = await hashVideoId("test123", 4);
      const p2 = await hashVideoId("test123", 4);
      expect(p1).toBe(p2);
    });

    it("produces different hashes for different inputs", async () => {
      const p1 = await hashVideoId("video1", 8);
      const p2 = await hashVideoId("video2", 8);
      expect(p1).not.toBe(p2);
    });
  });
});
