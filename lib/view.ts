/**
 * Browser-safe view helpers: range filtering, color assignment, formatting.
 * No Node imports — this module is bundled into the client and the static
 * snapshot.
 */

import type { DayTotal, SessionSummary, TrackerReport } from "./types";

/** CSS variables for the categorical slots, in fixed order (never cycled). */
export const SERIES_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const OTHER_VAR = "var(--other)";
export const OTHER_LABEL = "Other";

/** Stacked-chart series cap (soft cap from the series-count ladder). */
export const MAX_SERIES = 5;

/**
 * Assign each project a color slot from the FULL report (all time), so
 * filtering a date range never repaints surviving projects.
 * Top `MAX_SERIES` projects by all-time active get slots 1..N; the rest
 * fold into "Other".
 */
export function assignColors(report: TrackerReport): Map<string, string> {
  const colors = new Map<string, string>();
  report.projects.forEach((p, i) => {
    colors.set(
      p.projectName,
      i < MAX_SERIES ? SERIES_VARS[i] : OTHER_VAR
    );
  });
  return colors;
}

/** Names of the projects that get their own series (all-time top N). */
export function seriesProjects(report: TrackerReport): string[] {
  return report.projects.slice(0, MAX_SERIES).map((p) => p.projectName);
}

export interface RangePreset {
  key: string;
  label: string;
  days: number | null; // null = all time
}

export const RANGE_PRESETS: RangePreset[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

export interface DashboardView {
  days: DayTotal[];
  sessions: SessionSummary[];
  /** projectName -> activeMs within range, sorted desc. */
  projectTotals: { name: string; activeMs: number }[];
  totalActiveMs: number;
  sessionCount: number;
  activeDayCount: number;
  avgPerActiveDayMs: number;
}

/**
 * Compute the view for a date-range preset, from day buckets + sessions.
 * Day-level granularity: a preset of N days keeps the last N day-keys
 * present in the report's continuous day range.
 */
export function computeView(
  report: TrackerReport,
  presetDays: number | null,
  nowMs: number,
  /** When set, scope the whole view to a single project. */
  projectFilter?: string | null
): DashboardView {
  let cutoffKey: string | null = null;
  if (presetDays != null) {
    const cutoff = new Date(nowMs - (presetDays - 1) * 86400000);
    // Day keys are local YYYY-MM-DD; report.days already uses the chosen tz.
    cutoffKey = fmtDateKeyLocal(cutoff);
  }

  let days = cutoffKey
    ? report.days.filter((d) => d.date >= cutoffKey!)
    : report.days;

  // Scope each day to the single project (keeps the same continuous axis).
  if (projectFilter) {
    days = days.map((d) => {
      const ms = d.byProject[projectFilter] ?? 0;
      return {
        date: d.date,
        activeMs: ms,
        byProject: ms > 0 ? { [projectFilter]: ms } : {},
      };
    });
  }

  const sinceMs =
    presetDays != null ? nowMs - presetDays * 86400000 : -Infinity;

  const sessions: SessionSummary[] = [];
  for (const p of report.projects) {
    if (projectFilter && p.projectName !== projectFilter) continue;
    for (const s of p.sessions) {
      if (s.lastEvent >= sinceMs) sessions.push(s);
    }
  }
  sessions.sort((a, b) => b.lastEvent - a.lastEvent);

  const totals = new Map<string, number>();
  let totalActiveMs = 0;
  for (const d of days) {
    totalActiveMs += d.activeMs;
    for (const [name, ms] of Object.entries(d.byProject)) {
      totals.set(name, (totals.get(name) ?? 0) + ms);
    }
  }

  const projectTotals = [...totals.entries()]
    .map(([name, activeMs]) => ({ name, activeMs }))
    .sort((a, b) => b.activeMs - a.activeMs);

  const activeDayCount = days.filter((d) => d.activeMs > 0).length;

  return {
    days,
    sessions,
    projectTotals,
    totalActiveMs,
    sessionCount: sessions.length,
    activeDayCount,
    avgPerActiveDayMs: activeDayCount ? totalActiveMs / activeDayCount : 0,
  };
}

function fmtDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Fill gaps so the daily chart has a continuous x-axis. */
export function continuousDays(days: DayTotal[]): DayTotal[] {
  if (days.length === 0) return [];
  const byKey = new Map(days.map((d) => [d.date, d]));
  const out: DayTotal[] = [];
  // Iterate date keys as UTC dates — safe for stepping YYYY-MM-DD strings.
  const start = new Date(days[0].date + "T00:00:00Z");
  const end = new Date(days[days.length - 1].date + "T00:00:00Z");
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push(byKey.get(key) ?? { date: key, activeMs: 0, byProject: {} });
  }
  return out;
}

/** "3h 24m", "45m", "<1m" */
export function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return ms > 0 ? "<1m" : "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Compact axis ticks: "8h", "1.5h", "30m". */
export function fmtHoursTick(ms: number): string {
  if (ms > 0 && ms < 3600000) return `${Math.round(ms / 60000)}m`;
  const h = ms / 3600000;
  return Number.isInteger(h) ? `${h}h` : `${Math.round(h * 10) / 10}h`;
}

/** "Jul 18" from a YYYY-MM-DD key. */
export function fmtDayLabel(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Fri, Jul 18 2026" from a YYYY-MM-DD key. */
export function fmtDayLong(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Nice max for the y-axis in ms, snapped to clean hour/minute steps. */
export function niceMax(maxMs: number): number {
  if (maxMs <= 0) return 3600000; // default 1h
  const steps = [
    15 * 60000, 30 * 60000, 3600000, 2 * 3600000, 3 * 3600000, 4 * 3600000,
    6 * 3600000, 8 * 3600000, 10 * 3600000, 12 * 3600000, 16 * 3600000,
    24 * 3600000,
  ];
  for (const s of steps) if (maxMs <= s) return s;
  return Math.ceil(maxMs / (4 * 3600000)) * 4 * 3600000;
}
