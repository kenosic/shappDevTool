/**
 * Format a timestamp (epoch ms) as local-time HH:MM:SS (24-hour).
 * Uses the devTool host system's timezone.
 */
export function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Generate a local-time timestamp string suitable for filenames.
 * Format: "YYYY-MM-DDTHH-MM-SS" in the devTool host system's timezone.
 */
export function localFilenameTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Format current system time as HH:MM (for status bar display).
 */
export function currentTimeHHMM(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
