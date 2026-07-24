/**
 * Prompt-health scorer (prototype).
 *
 * Rates how well *you* prompted Claude in each session — clarity, course-
 * correction, scope control, verification — into a 🟢/🟡/🔴 badge with a
 * one-line coaching note. Runs on THIS machine (where the transcripts live),
 * reads your prompt text locally, and sends only the prompts to Claude Haiku
 * for judging. Only the resulting rating is meant to leave the machine.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/score-sessions.ts [--limit 10] [--all]
 *
 * Results are cached in ~/.cache/ccti/scores.json so re-runs only score new
 * sessions. This is a PROTOTYPE: it prints a table and does not push anywhere.
 */

import fs from "node:fs";
import readline from "node:readline";
import Anthropic from "@anthropic-ai/sdk";
import { scan, defaultClaudeDir } from "../lib";
import type { SessionSummary } from "../lib/types";
import { SCORES_PATH, loadScores, saveScores, type CachedScore } from "../lib/scores";

const MODEL = "claude-haiku-4-5";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["explore", "build", "debug", "mixed"] },
    rating: { type: "string", enum: ["green", "yellow", "red"] },
    score: { type: "integer", enum: [1, 2, 3, 4, 5] },
    note: { type: "string" },
  },
  required: ["type", "rating", "score", "note"],
} as const;

const RUBRIC = `You are a coding-workflow coach. You are given the USER's prompts from one
Claude Code session (Claude's replies are omitted).

STEP 1 — classify the session's nature ("type"):
- explore: open-ended brainstorming / figuring out an approach / building
  something new the user doesn't fully know yet. Direction is expected to evolve.
- build: implementing something well-understood, with a known goal up front.
- debug: chasing a specific bug or failure.
- mixed: a genuine blend (e.g. explore that becomes build).

STEP 2 — rate how well the USER prompted and steered Claude, CALIBRATED TO THAT
TYPE. The bar is different per type:
- For explore/mixed: wide-ranging back-and-forth and shifting direction are
  APPROPRIATE — do NOT penalize them as "meandering". Judge instead: did the
  user give useful context, react well to Claude's suggestions, make decisions,
  and converge toward something? Reward good thinking-out-loud.
- For build: the goal is known, so reward clear specs, constraints, and
  verification; penalize vague, contradictory, or under-specified direction.
- For debug: reward a clear symptom + repro + relevant context; penalize "it's
  broken, fix it" with no detail.

Across all types also weigh: clarity/context, course-correction when Claude
drifted, and asking Claude to verify (tests, confirmation) where it matters.

Rating scale (relative to the type's bar):
- green (4-5): strong, well-directed prompting for this kind of session
- yellow (3): workable, clear room to improve
- red (1-2): vague, contradictory, or unguided

"note" = one short, concrete, second-person tip (max ~15 words), appropriate to
the session type — the single biggest thing that would have helped. For an
explore session, do not tell the user to "stop meandering"; coach the thing that
actually would have helped (e.g. "state your constraints earlier so Claude's
options fit"). Be specific, not generic praise.`;

/** Pull the human's typed prompts out of a transcript (skip tool results). */
async function extractUserPrompts(file: string): Promise<string[]> {
  const prompts: string[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let raw: any;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    if (raw.type !== "user" || raw.isMeta || raw.isSidechain) continue;
    const content = raw.message?.content;
    let text = "";
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      // Only real text blocks — a tool_result block means this "user" turn is
      // a tool response, not something the human typed.
      if (content.some((b: any) => b?.type === "tool_result")) continue;
      text = content
        .filter((b: any) => b?.type === "text" && typeof b.text === "string")
        .map((b: any) => b.text)
        .join("\n");
    }
    text = text.trim();
    // Skip local command noise and empties.
    if (!text || text.startsWith("<command-") || text.startsWith("<local-command")) continue;
    prompts.push(text.length > 600 ? text.slice(0, 600) + "…" : text);
    if (prompts.length >= 40) break;
  }
  return prompts;
}

async function score(client: Anthropic, prompts: string[]): Promise<CachedScore> {
  const body = prompts.map((p, i) => `[${i + 1}] ${p}`).join("\n\n").slice(0, 12000);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: RUBRIC,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Session prompts:\n\n${body}` }],
  });
  const textBlock = res.content.find((b) => b.type === "text");
  const parsed = JSON.parse((textBlock as { text: string }).text);
  return { ...parsed, scoredAt: Date.now() };
}

const DOT = { green: "🟢", yellow: "🟡", red: "🔴" } as const;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }
  const limit = Number(arg("limit") ?? 10);
  // --all/--rescore: (re)score every session. --new: every uncached session
  // (no limit) — used by the hourly cron. default: uncached, up to --limit.
  const rescore = process.argv.includes("--all") || process.argv.includes("--rescore");
  const scoreNew = process.argv.includes("--new");
  const client = new Anthropic();

  const report = await scan(defaultClaudeDir());
  const sessions: SessionSummary[] = report.projects
    .flatMap((p) => p.sessions)
    .sort((a, b) => b.lastEvent - a.lastEvent);

  const cache = rescore ? {} : loadScores();
  let todo = sessions.filter((s) => rescore || !cache[s.sessionId]);
  if (!rescore && !scoreNew) todo = todo.slice(0, limit);
  console.log(`Scoring ${todo.length} session(s) with ${MODEL}…\n`);

  for (const s of todo) {
    let prompts: string[] = [];
    try {
      prompts = await extractUserPrompts(s.file);
    } catch {
      /* unreadable */
    }
    if (prompts.length === 0) continue;
    try {
      const sc = await score(client, prompts);
      cache[s.sessionId] = sc;
      saveScores(cache);
      console.log(
        `${DOT[sc.rating]} ${sc.score}/5  [${sc.type.padEnd(7)}] ${s.projectName.padEnd(22)} ` +
          `(${prompts.length} prompts) — ${sc.note}`
      );
    } catch (e) {
      console.error(`  ✗ ${s.projectName}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\nCached ${Object.keys(cache).length} total ratings at ${SCORES_PATH}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
