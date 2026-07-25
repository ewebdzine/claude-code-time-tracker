/**
 * Active-time engine: turns timestamped events into work blocks and
 * aggregates them into session / project / day summaries.
 *
 * The rule, per the project's design: the clock runs while there is
 * back-and-forth activity. Any gap between consecutive events longer than
 * the idle threshold (default 15 minutes) splits the block — so if Claude
 * finishes and you don't respond for two hours, those two hours don't count.
 */

import path from "node:path";
import type {
  DayTotal,
  ProjectSummary,
  SessionEvent,
  SessionSummary,
  TokenUsage,
  TrackerOptions,
  TrackerReport,
  WorkBlock,
} from "./types";
import { DEFAULT_IDLE_THRESHOLD_MS } from "./types";
import type { ParsedTranscript } from "./parser";

/** Group sorted events into contiguous work blocks. */
export function buildBlocks(
  events: SessionEvent[],
  idleThresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS
): WorkBlock[] {
  if (events.length === 0) return [];

  const blocks: WorkBlock[] = [];
  let cur: SessionEvent[] = [events[0]];

  for (let i = 1; i < events.length; i++) {
    const gap = events[i].timestamp - cur[cur.length - 1].timestamp;
    if (gap > idleThresholdMs) {
      blocks.push(finishBlock(cur));
      cur = [events[i]];
    } else {
      cur.push(events[i]);
    }
  }
  blocks.push(finishBlock(cur));
  return blocks;
}

function zeroUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}

function addUsage(a: TokenUsage, b?: TokenUsage): TokenUsage {
  if (b) {
    a.input += b.input;
    a.output += b.output;
    a.cacheRead += b.cacheRead;
    a.cacheCreate += b.cacheCreate;
  }
  return a;
}

function finishBlock(events: SessionEvent[]): WorkBlock {
  const start = events[0].timestamp;
  const end = events[events.length - 1].timestamp;
  let userMessages = 0;
  let assistantMessages = 0;
  const tokens = zeroUsage();
  for (const e of events) {
    if (e.actor === "user") userMessages++;
    else if (e.actor === "assistant") assistantMessages++;
    addUsage(tokens, e.usage);
  }
  return {
    start,
    end,
    durationMs: end - start,
    eventCount: events.length,
    userMessages,
    assistantMessages,
    tokens,
  };
}

/** Summarize one parsed transcript into a session. */
export function summarizeSession(
  t: ParsedTranscript,
  decodedPathFallback: string,
  opts: TrackerOptions = {}
): SessionSummary | null {
  const idle = opts.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
  let events = t.events;
  if (opts.since != null) events = events.filter((e) => e.timestamp >= opts.since!);
  if (opts.until != null) events = events.filter((e) => e.timestamp < opts.until!);
  if (events.length === 0) return null;

  const blocks = buildBlocks(events, idle);
  const projectPath = t.cwd ?? decodedPathFallback;
  const tokens = blocks.reduce((acc, b) => addUsage(acc, b.tokens), zeroUsage());

  return {
    sessionId: t.sessionId,
    projectPath,
    projectName: path.basename(projectPath) || projectPath,
    firstEvent: events[0].timestamp,
    lastEvent: events[events.length - 1].timestamp,
    activeMs: blocks.reduce((s, b) => s + b.durationMs, 0),
    spanMs: events[events.length - 1].timestamp - events[0].timestamp,
    blocks,
    eventCount: events.length,
    userMessages: blocks.reduce((s, b) => s + b.userMessages, 0),
    assistantMessages: blocks.reduce((s, b) => s + b.assistantMessages, 0),
    gitBranch: t.gitBranch,
    version: t.version,
    file: t.file,
    tokens,
    tools: t.tools,
    entrypoint: t.entrypoint,
  };
}

/** Format an epoch-ms timestamp as YYYY-MM-DD in the given timezone. */
export function localDateKey(ts: number, timeZone?: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(ts)); // en-CA gives YYYY-MM-DD
}

/**
 * Bucket work blocks into per-day totals. Blocks that cross midnight are
 * split proportionally across the days they touch.
 */
export function bucketByDay(
  sessions: SessionSummary[],
  timeZone?: string
): DayTotal[] {
  const days = new Map<string, DayTotal>();

  const add = (date: string, project: string, ms: number) => {
    let d = days.get(date);
    if (!d) {
      d = { date, activeMs: 0, byProject: {} };
      days.set(date, d);
    }
    d.activeMs += ms;
    d.byProject[project] = (d.byProject[project] ?? 0) + ms;
  };

  for (const s of sessions) {
    for (const b of s.blocks) {
      const startKey = localDateKey(b.start, timeZone);
      const endKey = localDateKey(b.end, timeZone);
      if (startKey === endKey || b.durationMs === 0) {
        add(startKey, s.projectName, b.durationMs);
        continue;
      }
      // Split a midnight-crossing block into chunks aligned to epoch
      // quarter-hours. Every real timezone offset is a multiple of 15
      // minutes, so local midnight always falls on a quarter-hour epoch
      // boundary — meaning no aligned chunk can straddle two days.
      const stepMs = 15 * 60 * 1000;
      let cursor = b.start;
      while (cursor < b.end) {
        const boundary = Math.floor(cursor / stepMs) * stepMs + stepMs;
        const next = Math.min(boundary, b.end);
        add(localDateKey(cursor, timeZone), s.projectName, next - cursor);
        cursor = next;
      }
    }
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Aggregate sessions into projects, and produce the full report. */
export function buildReport(
  sessions: SessionSummary[],
  claudeDir: string,
  opts: TrackerOptions = {}
): TrackerReport {
  const idle = opts.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
  const byProject = new Map<string, ProjectSummary>();

  for (const s of sessions) {
    let p = byProject.get(s.projectPath);
    if (!p) {
      p = {
        projectPath: s.projectPath,
        projectName: s.projectName,
        activeMs: 0,
        sessionCount: 0,
        firstEvent: s.firstEvent,
        lastEvent: s.lastEvent,
        sessions: [],
      };
      byProject.set(s.projectPath, p);
    }
    p.activeMs += s.activeMs;
    p.sessionCount++;
    p.firstEvent = Math.min(p.firstEvent, s.firstEvent);
    p.lastEvent = Math.max(p.lastEvent, s.lastEvent);
    p.sessions.push(s);
  }

  const projects = [...byProject.values()].sort((a, b) => b.activeMs - a.activeMs);
  for (const p of projects) {
    p.sessions.sort((a, b) => b.lastEvent - a.lastEvent);
  }

  return {
    generatedAt: Date.now(),
    claudeDir,
    idleThresholdMs: idle,
    totalActiveMs: sessions.reduce((s, x) => s + x.activeMs, 0),
    sessionCount: sessions.length,
    projectCount: projects.length,
    projects,
    days: bucketByDay(sessions, opts.timeZone),
  };
}
