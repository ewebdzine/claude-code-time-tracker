/**
 * Prompt-health score cache (server-only — uses node:fs).
 *
 * scripts/score-sessions.ts writes ratings here keyed by sessionId; the API and
 * the Blob push read them back and attach them onto the report. The raw prompt
 * text never lives here — only the resulting {type, rating, score, note}.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PromptScore, TrackerReport } from "./types";

export interface CachedScore extends PromptScore {
  scoredAt: number;
}

/** Where ratings are cached (override with CCT_SCORES_PATH). */
export const SCORES_PATH =
  process.env.CCT_SCORES_PATH ??
  path.join(os.homedir(), ".cache", "ccti", "scores.json");

export function loadScores(): Record<string, CachedScore> {
  try {
    return JSON.parse(fs.readFileSync(SCORES_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function saveScores(scores: Record<string, CachedScore>): void {
  fs.mkdirSync(path.dirname(SCORES_PATH), { recursive: true });
  fs.writeFileSync(SCORES_PATH, JSON.stringify(scores, null, 2));
}

/** Attach cached ratings onto each session in the report (mutates + returns). */
export function attachScores(
  report: TrackerReport,
  scores: Record<string, CachedScore> = loadScores()
): TrackerReport {
  if (!scores || Object.keys(scores).length === 0) return report;
  for (const project of report.projects) {
    for (const s of project.sessions) {
      const sc = scores[s.sessionId];
      if (sc) {
        s.promptScore = {
          type: sc.type,
          rating: sc.rating,
          score: sc.score,
          note: sc.note,
        };
      }
    }
  }
  return report;
}
