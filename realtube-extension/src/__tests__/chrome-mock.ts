// Chrome API mock for tests
// Provides in-memory implementations of chrome.storage, chrome.runtime, chrome.tabs

import { vi } from "vitest";

type Callback = (...args: any[]) => void;

interface EventMock {
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  _listeners: Callback[];
  _fire: (...args: any[]) => void;
}

function createEventMock(): EventMock {
  const listeners: Callback[] = [];
  return {
    _listeners: listeners,
    addListener: vi.fn((cb: Callback) => {
      listeners.push(cb);
    }),
    removeListener: vi.fn((cb: Callback) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    _fire(...args: any[]) {
      for (const cb of [...listeners]) {
        cb(...args);
      }
    },
  };
}

function createStorageArea() {
  let store: Record<string, any> = {};
  return {
    _store: store,
    get: vi.fn((keys: string | string[] | Record<string, any> | null, callback?: Callback) => {
      let result: Record<string, any> = {};
      if (keys === null || keys === undefined) {
        result = { ...store };
      } else if (typeof keys === "string") {
        if (keys in store) result[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        for (const k of keys) {
          if (k in store) result[k] = store[k];
        }
      } else {
        // Object with defaults
        for (const [k, def] of Object.entries(keys)) {
          result[k] = k in store ? store[k] : def;
        }
      }
      if (callback) {
        callback(result);
        return undefined;
      }
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, any>, callback?: Callback) => {
      Object.assign(store, items);
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[], callback?: Callback) => {
      const arr = typeof keys === "string" ? [keys] : keys;
      for (const k of arr) {
        delete store[k];
      }
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    }),
    clear: vi.fn((callback?: Callback) => {
      store = {};
      // Re-assign so _store reference stays useful for tests that read it
      createStorageArea._replaceStore?.(store);
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    }),
    _reset() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

// Workaround: clear() creates a new object, but we want _store to reflect changes.
// Instead, we just delete all keys in _reset().
createStorageArea._replaceStore = undefined as any;

export function createChromeMock() {
  const local = createStorageArea();
  const sync = createStorageArea();
  const onChanged = createEventMock();

  const onMessage = createEventMock();
  const sendMessage = vi.fn();

  const mock = {
    storage: {
      local,
      sync,
      onChanged,
    },
    runtime: {
      id: "test-extension-id",
      sendMessage,
      onMessage,
      getURL: vi.fn((path: string) => path),
      openOptionsPage: vi.fn(),
    },
    tabs: {
      query: vi.fn(),
    },
  };

  return mock;
}

export type ChromeMock = ReturnType<typeof createChromeMock>;

let currentMock: ChromeMock | null = null;

export function installChromeMock(): ChromeMock {
  const mock = createChromeMock();
  currentMock = mock;
  (globalThis as any).chrome = mock;
  return mock;
}

export function getChromeMock(): ChromeMock {
  if (!currentMock) throw new Error("Chrome mock not installed. Call installChromeMock() first.");
  return currentMock;
}

export function resetChromeMock(): void {
  if (!currentMock) return;
  currentMock.storage.local._reset();
  currentMock.storage.sync._reset();
  currentMock.storage.onChanged._listeners.length = 0;
  currentMock.storage.onChanged.addListener.mockClear();
  currentMock.storage.onChanged.removeListener.mockClear();
  currentMock.runtime.sendMessage.mockReset();
  currentMock.runtime.onMessage._listeners.length = 0;
  currentMock.runtime.onMessage.addListener.mockClear();
  currentMock.runtime.onMessage.removeListener.mockClear();
  currentMock.runtime.getURL.mockImplementation((path: string) => path);
  currentMock.runtime.openOptionsPage.mockReset();
  currentMock.tabs.query.mockReset();
}
