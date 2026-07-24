/**
 * Parser for Claude Code session transcripts.
 *
 * Claude Code stores one JSONL file per session under:
 *   ~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl
 *
 * Each line is a JSON object; the ones we care about carry a `timestamp`
 * (ISO 8601) and a `type` of "user" | "assistant" | "system". Other line
 * types (e.g. "summary", snapshots) may lack timestamps and are skipped.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { SessionEvent } from "./types";

/** Raw shape of a transcript line — intentionally loose. */
interface RawLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
}

export interface ParsedTranscript {
  file: string;
  sessionId: string;
  /** Best-known project working directory (from `cwd` fields). */
  cwd: string | null;
  gitBranch?: string;
  version?: string;
  events: SessionEvent[];
}

/**
 * Decode a Claude Code project folder name back into a filesystem path.
 * Folder names replace both `/` and `.` with `-`, so decoding is lossy;
 * we prefer the `cwd` recorded inside transcripts and fall back to this.
 */
export function decodeProjectDir(encoded: string): string {
  return encoded.replace(/-/g, "/");
}

const ACTOR_TYPES = new Set(["user", "assistant", "system"]);

/** Parse one JSONL transcript file into timestamped events. */
export async function parseTranscript(file: string): Promise<ParsedTranscript | null> {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const events: SessionEvent[] = [];
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | undefined;
  let version: string | undefined;

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      let raw: RawLine;
      try {
        raw = JSON.parse(line) as RawLine;
      } catch {
        continue; // tolerate truncated/corrupt lines
      }
      if (raw.cwd && !cwd) cwd = raw.cwd;
      if (raw.gitBranch && !gitBranch) gitBranch = raw.gitBranch;
      if (raw.version && !version) version = raw.version;
      if (raw.sessionId && !sessionId) sessionId = raw.sessionId;

      if (!raw.timestamp || !raw.type || !ACTOR_TYPES.has(raw.type)) continue;
      const ts = Date.parse(raw.timestamp);
      if (Number.isNaN(ts)) continue;

      events.push({
        timestamp: ts,
        actor: raw.type as SessionEvent["actor"],
        sessionId: raw.sessionId ?? sessionId ?? path.basename(file, ".jsonl"),
        isSidechain: raw.isSidechain === true,
      });
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (events.length === 0) return null;
  events.sort((a, b) => a.timestamp - b.timestamp);

  return {
    file,
    sessionId: sessionId ?? path.basename(file, ".jsonl"),
    cwd,
    gitBranch,
    version,
    events,
  };
}

export interface ProjectTranscripts {
  /** Encoded folder name under ~/.claude/projects. */
  encodedDir: string;
  /** Decoded best-guess path (overridden by cwd when available). */
  decodedPath: string;
  files: string[];
}

/** List all transcript files grouped by project folder. */
export function listTranscripts(claudeDir: string): ProjectTranscripts[] {
  const projectsDir = path.join(claudeDir, "projects");
  if (!fs.existsSync(projectsDir)) return [];

  const out: ProjectTranscripts[] = [];
  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(projectsDir, entry.name);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => path.join(dir, f));
    if (files.length === 0) continue;
    out.push({
      encodedDir: entry.name,
      decodedPath: decodeProjectDir(entry.name),
      files,
    });
  }
  return out;
}
