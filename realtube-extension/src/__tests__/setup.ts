// Test setup: extended matchers, IndexedDB polyfill, Chrome API mock
import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { installChromeMock, resetChromeMock } from "./chrome-mock";
import { beforeAll, afterEach } from "vitest";

// Install Chrome API mock globally before any tests run
beforeAll(() => {
  installChromeMock();
});

// Reset mock state between tests
afterEach(() => {
  resetChromeMock();
});
