/**
 * Core types for claude-code-time-tracker.
 */

/** A single timestamped event pulled from a Claude Code session transcript. */
export interface SessionEvent {
  /** ISO timestamp of the event. */
  timestamp: number; // epoch ms
  /** Who produced the event. */
  actor: "user" | "assistant" | "system";
  /** Session this event belongs to. */
  sessionId: string;
  /** Whether this event came from a subagent sidechain. */
  isSidechain: boolean;
}

/** A contiguous block of activity within a session (no gaps > idle threshold). */
export interface WorkBlock {
  start: number; // epoch ms
  end: number; // epoch ms
  /** end - start, in ms. */
  durationMs: number;
  /** Number of events in this block. */
  eventCount: number;
  /** Number of user messages in this block. */
  userMessages: number;
  /** Number of assistant messages in this block. */
  assistantMessages: number;
}

/** One Claude Code session (one JSONL transcript file). */
export interface SessionSummary {
  sessionId: string;
  /** Project directory the session ran in (decoded from folder name / cwd). */
  projectPath: string;
  /** Short display name for the project (last path segment). */
  projectName: string;
  /** First event timestamp. */
  firstEvent: number;
  /** Last event timestamp. */
  lastEvent: number;
  /** Active time: sum of work-block durations (idle gaps excluded). */
  activeMs: number;
  /** Wall-clock span: lastEvent - firstEvent. */
  spanMs: number;
  blocks: WorkBlock[];
  eventCount: number;
  userMessages: number;
  assistantMessages: number;
  /** Git branch, if recorded in the transcript. */
  gitBranch?: string;
  /** Claude Code version, if recorded. */
  version?: string;
  /** Transcript file this summary was computed from. */
  file: string;
  /**
   * Short title summarizing the session, and a prompt-health rating — both
   * attached after scanning by scripts/score-sessions (LLM-derived). Never
   * computed from message content in the parser itself.
   */
  title?: string;
  promptScore?: PromptScore;
}

/** How well the user prompted/steered Claude in a session (LLM-judged). */
export interface PromptScore {
  /** The session's nature — the rating is calibrated to this. */
  type: "explore" | "build" | "debug" | "mixed";
  rating: "green" | "yellow" | "red";
  /** 1..5, relative to the type's bar. */
  score: number;
  /** One-line, second-person coaching tip. */
  note: string;
}

/** Aggregated stats for one project. */
export interface ProjectSummary {
  projectPath: string;
  projectName: string;
  activeMs: number;
  sessionCount: number;
  firstEvent: number;
  lastEvent: number;
  sessions: SessionSummary[];
}

/** Active time bucketed by calendar day (local time). */
export interface DayTotal {
  /** YYYY-MM-DD in local time. */
  date: string;
  activeMs: number;
  /** Per-project breakdown for stacked charts. */
  byProject: Record<string, number>;
}

export interface TrackerReport {
  generatedAt: number;
  claudeDir: string;
  idleThresholdMs: number;
  totalActiveMs: number;
  sessionCount: number;
  projectCount: number;
  projects: ProjectSummary[];
  days: DayTotal[];
}

export interface TrackerOptions {
  /** Gap length that splits work blocks / stops the clock. Default 15 min. */
  idleThresholdMs?: number;
  /** Only include events at or after this time (epoch ms). */
  since?: number;
  /** Only include events before this time (epoch ms). */
  until?: number;
  /** IANA timezone used for day bucketing. Defaults to system timezone. */
  timeZone?: string;
}

export const DEFAULT_IDLE_THRESHOLD_MS = 15 * 60 * 1000;
