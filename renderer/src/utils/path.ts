/**
 * Minimal path utilities for renderer (browser environment).
 * Does not use Node's 'path' module.
 */

export function join(...parts: string[]): string {
  return parts
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\\/g, "/");
}

export function basename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

export function dirname(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx < 0 ? "." : normalized.slice(0, idx);
}
