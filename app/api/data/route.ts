import { scan, defaultClaudeDir, DEFAULT_IDLE_THRESHOLD_MS } from "@/lib";
import { loadReportFromBlob } from "@/lib/blob";
import { attachScores } from "@/lib/scores";

/**
 * GET /api/data
 *
 * Query params:
 *   idleMinutes  — idle threshold in minutes (default 15)
 *   days         — only include the last N days
 *   tz           — IANA timezone for day bucketing (default: server local)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

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

    // Local run with real logs: attach prompt-health ratings and serve.
    if (report.sessionCount > 0) return Response.json(attachScores(report));

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
