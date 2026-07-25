/**
 * Generate data/demo-report.json — sample data so a hosted deploy
 * (e.g. Vercel, where there is no ~/.claude) still shows a working demo.
 *
 *   npx tsx scripts/make-demo.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport, summarizeSession } from "../lib/blocks";
import type { ParsedTranscript } from "../lib/parser";
import type { SessionEvent, SessionSummary } from "../lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../data/demo-report.json");

// Deterministic PRNG so the demo is stable across builds.
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

const PROJECTS = [
  "/home/demo/projects/storefront",
  "/home/demo/projects/api-gateway",
  "/home/demo/projects/mobile-app",
  "/home/demo/projects/data-pipeline",
  "/home/demo/projects/marketing-site",
  "/home/demo/projects/infra",
];

function makeSession(
  project: string,
  startMs: number,
  sessionIndex: number
): ParsedTranscript {
  const events: SessionEvent[] = [];
  const sessionId = `demo-${project.split("/").pop()}-${sessionIndex}`;
  let t = startMs;
  const blockCount = 1 + Math.floor(rand() * 3);
  for (let b = 0; b < blockCount; b++) {
    const exchanges = 3 + Math.floor(rand() * 18);
    for (let i = 0; i < exchanges; i++) {
      events.push({
        timestamp: t,
        actor: "user",
        sessionId,
        isSidechain: false,
      });
      t += 5000 + rand() * 60000; // Claude replies within a minute…
      events.push({
        timestamp: t,
        actor: "assistant",
        sessionId,
        isSidechain: false,
        usage: {
          input: 500 + Math.floor(rand() * 3000),
          output: 150 + Math.floor(rand() * 1800),
          cacheRead: 8000 + Math.floor(rand() * 90000),
          cacheCreate: Math.floor(rand() * 8000),
        },
      });
      t += 20000 + rand() * 300000; // …user replies within ~5 minutes
    }
    // Walk away: a gap well past the idle threshold.
    t += (30 + rand() * 150) * 60000;
  }
  const canonRead = rand() < 0.4 ? 1 + Math.floor(rand() * 6) : 0;
  return {
    file: `/demo/${sessionId}.jsonl`,
    sessionId,
    cwd: project,
    gitBranch: rand() > 0.5 ? "main" : "feature/demo",
    version: "2.1.0",
    entrypoint: rand() < 0.15 ? "cli" : "claude-desktop",
    events,
    tools: {
      read: 3 + Math.floor(rand() * 20),
      edit: 2 + Math.floor(rand() * 15),
      write: Math.floor(rand() * 4),
      bash: Math.floor(rand() * 10),
      search: canonRead > 0 ? Math.floor(rand() * 2) : 2 + Math.floor(rand() * 10),
      canonRead,
      canonRework: canonRead > 0 && rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0,
      webSearch: Math.floor(rand() * 3),
    },
  };
}

// Synthetic prompt-health ratings + titles so the demo showcases those too.
const RATINGS: { rating: "green" | "yellow" | "red"; score: number }[] = [
  { rating: "green", score: 5 },
  { rating: "green", score: 4 },
  { rating: "yellow", score: 3 },
  { rating: "yellow", score: 3 },
  { rating: "red", score: 2 },
];
const TYPES = ["explore", "build", "debug", "mixed"] as const;
const TITLE_BY_PROJECT: Record<string, string[]> = {
  storefront: ["Checkout flow redesign", "Cart persistence bug fix", "Product page A/B setup"],
  "api-gateway": ["Rate-limit middleware", "Auth token refresh flow", "Webhook retry logic"],
  "mobile-app": ["Push notification wiring", "Offline sync groundwork", "Onboarding screens"],
  "data-pipeline": ["Nightly ETL refactor", "Schema migration + backfill", "Dedup job tuning"],
  "marketing-site": ["Landing page rebuild", "Blog CMS integration", "SEO metadata pass"],
  infra: ["Terraform module cleanup", "CI cache optimization", "Staging env provisioning"],
};
const NOTES = [
  "Strong up-front spec with clear constraints and verification steps.",
  "Ask Claude to run the tests before moving to the next phase.",
  "State the acceptance criteria earlier so the options fit the goal.",
  "Good course-correction; confirm each step before proceeding.",
  "Lead with the concrete error and repro before diving into fixes.",
];

const now = Date.now();
const sessions: SessionSummary[] = [];

for (let day = 75; day >= 0; day--) {
  // Not every day has work.
  if (rand() < 0.3) continue;
  const sessionsToday = 1 + Math.floor(rand() * 3);
  for (let s = 0; s < sessionsToday; s++) {
    const project = PROJECTS[Math.floor(rand() * PROJECTS.length)];
    const startHour = 8 + rand() * 11;
    const start = now - day * 86400000 - (24 - startHour) * 3600000;
    const t = makeSession(project, start, day * 10 + s);
    const summary = summarizeSession(t, project);
    if (!summary) continue;
    const r = RATINGS[Math.floor(rand() * RATINGS.length)];
    const titles = TITLE_BY_PROJECT[summary.projectName] ?? ["Session work"];
    summary.title = titles[Math.floor(rand() * titles.length)];
    summary.promptScore = {
      type: TYPES[Math.floor(rand() * TYPES.length)],
      rating: r.rating,
      score: r.score,
      note: NOTES[Math.floor(rand() * NOTES.length)],
    };
    sessions.push(summary);
  }
}

const report = buildReport(sessions, "~/.claude (demo data)");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(
  `Wrote ${OUT} — ${report.sessionCount} sessions, ` +
    `${Math.round(report.totalActiveMs / 3600000)}h active.`
);
