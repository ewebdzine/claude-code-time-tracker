import { scan, defaultClaudeDir, DEFAULT_IDLE_THRESHOLD_MS } from "@/lib";
import { loadReportFromBlob, BLOB_REPORT_PATHNAME } from "@/lib/blob";
import { get } from "@vercel/blob";

/**
 * GET /api/data
 *
 * Query params:
 *   idleMinutes  — idle threshold in minutes (default 15)
 *   days         — only include the last N days
 *   tz           — IANA timezone for day bucketing (default: server local)
 *   debug=1      — return Blob-read diagnostics instead of data (no secrets)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Safe diagnostic (this route is behind auth). Reports why the Blob read
  // may be failing without ever exposing the token or your data.
  if (searchParams.get("debug") === "1") {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const info: Record<string, unknown> = {
      tokenPresent: Boolean(token),
      pathname: BLOB_REPORT_PATHNAME,
    };
    if (token) {
      try {
        const r = await get(BLOB_REPORT_PATHNAME, {
          access: "private",
          token,
          useCache: false,
        });
        if (!r) {
          info.blobRead = "null (not found at pathname)";
        } else {
          const j = (await new Response(r.stream).json()) as { sessionCount?: number };
          info.blobRead = "ok";
          info.blobSessionCount = j.sessionCount ?? null;
        }
      } catch (e) {
        info.blobError = e instanceof Error ? e.message : String(e);
      }
    }
    return Response.json(info);
  }

  const idleMinutes = Number(searchParams.get("idleMinutes"));
  const idleThresholdMs =
    Number.isFinite(idleMinutes) && idleMinutes > 0
      ? idleMinutes * 60 * 1000
      : DEFAULT_IDLE_THRESHOLD_MS;

  const days = Number(searchParams.get("days"));
  const since =
    Number.isFinite(days) && days > 0
      ? Date.now() - days * 24 * 60 * 60 * 1000
      : undefined;

  const timeZone = searchParams.get("tz") ?? undefined;

  try {
    const report = await scan(defaultClaudeDir(), {
      idleThresholdMs,
      since,
      timeZone,
    });

    // Local run with real logs: serve the freshly scanned report.
    if (report.sessionCount > 0) return Response.json(report);

    // Hosted deploy (no ~/.claude): prefer the real report pushed to Blob by
    // the dev machine; the idle threshold is whatever the push used.
    const blob = await loadReportFromBlob();
    if (blob) return Response.json({ ...blob, source: "blob" });

    // Nothing pushed yet: fall back to the bundled demo so the page still works.
    const demo = await loadDemoReport();
    if (demo) return Response.json({ ...demo, demo: true });

    return Response.json(report);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "scan failed" },
      { status: 500 }
    );
  }
}

async function loadDemoReport(): Promise<Record<string, unknown> | null> {
  try {
    const { default: demo } = await import("@/data/demo-report.json");
    return demo as Record<string, unknown>;
  } catch {
    return null;
  }
}
