/**
 * Vercel Blob bridge. On a hosted deploy there is no ~/.claude, so the dev
 * machine pushes its real report JSON to Blob (see scripts/push-blob.ts) and
 * the API serves it from here. Read happens server-side with the store token,
 * so the Blob URL is never exposed to the browser.
 */

import { get } from "@vercel/blob";

/** Stable pathname the push script writes to (addRandomSuffix: false). */
export const BLOB_REPORT_PATHNAME = "reports/latest.json";

/** Load the latest pushed report from the (private) Blob store, or null. */
export async function loadReportFromBlob(): Promise<Record<string, unknown> | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const result = await get(BLOB_REPORT_PATHNAME, {
      access: "private",
      token,
      useCache: false, // always read the freshest push
    });
    if (!result) return null;
    return (await new Response(result.stream).json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
