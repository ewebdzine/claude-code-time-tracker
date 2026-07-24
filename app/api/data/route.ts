import { scan, defaultClaudeDir, DEFAULT_IDLE_THRESHOLD_MS } from "@/lib";

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

    // Demo fallback (e.g. a Vercel deploy, where there is no ~/.claude):
    // serve the bundled sample report so the hosted app works as a demo.
    if (report.sessionCount === 0) {
      const demo = await loadDemoReport();
      if (demo) return Response.json({ ...demo, demo: true });
    }

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
