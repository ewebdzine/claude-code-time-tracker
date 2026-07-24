/**
 * Vercel Blob bridge. On a hosted deploy there is no ~/.claude, so the dev
 * machine pushes its real report JSON to Blob (see scripts/push-blob.ts) and
 * the API serves it from here. Read happens server-side with the store token,
 * so the Blob URL is never exposed to the browser.
 */

import { list } from "@vercel/blob";

/** Stable pathname the push script writes to (addRandomSuffix: false). */
export const BLOB_REPORT_PATHNAME = "reports/latest.json";

/** Load the latest pushed report from Blob, or null if unconfigured/missing. */
export async function loadReportFromBlob(): Promise<Record<string, unknown> | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { blobs } = await list({ prefix: BLOB_REPORT_PATHNAME, token, limit: 1 });
    const blob = blobs.find((b) => b.pathname === BLOB_REPORT_PATHNAME) ?? blobs[0];
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
