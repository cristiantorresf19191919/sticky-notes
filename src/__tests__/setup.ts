import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Newer Node versions ship an experimental WebStorage global that shadows
// jsdom's working localStorage inside the vitest environment (its methods
// only exist when --localstorage-file is set). A tiny in-memory Storage
// keeps the suite independent of the Node version it runs on.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Deterministic frames: the drag engine coalesces DOM writes through rAF.
// Applying them synchronously lets specs assert mid-drag without waiting.
window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  cb(performance.now());
  return 1;
};
window.cancelAnimationFrame = () => {};
