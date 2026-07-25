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
import type { SessionEvent, ToolUsage } from "./types";

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface RawToolUse {
  type?: string;
  name?: string;
  input?: { file_path?: string; path?: string };
}

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
  message?: { usage?: RawUsage; content?: RawToolUse[] };
}

export interface ParsedTranscript {
  file: string;
  sessionId: string;
  /** Best-known project working directory (from `cwd` fields). */
  cwd: string | null;
  gitBranch?: string;
  version?: string;
  events: SessionEvent[];
  /** Tool-usage trace for the whole transcript. */
  tools: ToolUsage;
}

function emptyTools(): ToolUsage {
  return {
    read: 0,
    edit: 0,
    write: 0,
    bash: 0,
    search: 0,
    canonRead: 0,
    canonRework: 0,
    webSearch: 0,
  };
}

/** Does a file path look like a Canonify canon doc? */
function isCanonPath(fp: string | undefined): boolean {
  if (!fp) return false;
  const p = fp.toLowerCase();
  return (
    /canonify\.md$/.test(p) ||
    /(^|\/)canon/.test(p) ||
    (p.includes("/docs/") && p.endsWith(".md"))
  );
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

  const tools = emptyTools();
  // Track the Edit/Write → canon Read → Edit/Write "rework" pattern.
  let sawBuild = false;
  let canonPending = false;

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

      // Token usage + tool trace live on assistant turns.
      let usage: SessionEvent["usage"];
      if (raw.type === "assistant" && raw.message) {
        const u = raw.message.usage;
        if (u) {
          usage = {
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheCreate: u.cache_creation_input_tokens ?? 0,
          };
        }
        for (const b of raw.message.content ?? []) {
          if (!b || b.type !== "tool_use") continue;
          const name = b.name ?? "";
          const fp = b.input?.file_path ?? b.input?.path;
          switch (name) {
            case "Edit":
            case "MultiEdit":
              tools.edit++;
              if (canonPending) {
                tools.canonRework++;
                canonPending = false;
              }
              sawBuild = true;
              break;
            case "Write":
              tools.write++;
              if (canonPending) {
                tools.canonRework++;
                canonPending = false;
              }
              sawBuild = true;
              break;
            case "Read":
            case "NotebookRead":
              tools.read++;
              if (isCanonPath(fp)) {
                tools.canonRead++;
                if (sawBuild) canonPending = true;
              }
              break;
            case "Grep":
            case "Glob":
              tools.search++;
              break;
            case "Bash":
              tools.bash++;
              break;
            case "WebSearch":
            case "WebFetch":
              tools.webSearch++;
              break;
          }
        }
      }

      events.push({
        timestamp: ts,
        actor: raw.type as SessionEvent["actor"],
        sessionId: raw.sessionId ?? sessionId ?? path.basename(file, ".jsonl"),
        isSidechain: raw.isSidechain === true,
        ...(usage ? { usage } : {}),
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
    tools,
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
