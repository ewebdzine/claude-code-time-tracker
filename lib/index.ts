/**
 * claude-code-time — public API.
 *
 * Scan a Claude Code data directory and produce a time-tracking report
 * with idle-aware active durations per session, project, and day.
 */

import os from "node:os";
import path from "node:path";
import { listTranscripts, parseTranscript } from "./parser";
import { buildReport, summarizeSession } from "./blocks";
import type { SessionSummary, TrackerOptions, TrackerReport } from "./types";

export * from "./types";
export * from "./parser";
export * from "./blocks";

/** Default Claude Code data dir (~/.claude), overridable via CLAUDE_DIR. */
export function defaultClaudeDir(): string {
  return process.env.CLAUDE_DIR ?? path.join(os.homedir(), ".claude");
}

/** Scan every transcript under `claudeDir` and build the full report. */
export async function scan(
  claudeDir: string = defaultClaudeDir(),
  opts: TrackerOptions = {}
): Promise<TrackerReport> {
  const projects = listTranscripts(claudeDir);
  const sessions: SessionSummary[] = [];

  for (const proj of projects) {
    const parsed = await Promise.all(proj.files.map((f) => parseTranscript(f)));
    for (const t of parsed) {
      if (!t) continue;
      const s = summarizeSession(t, proj.decodedPath, opts);
      if (s) sessions.push(s);
    }
  }

  return buildReport(sessions, claudeDir, opts);
}
