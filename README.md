# claude-code-time

**Idle-aware time tracking for [Claude Code](https://claude.com/claude-code) — see how long you and Claude actually worked, per project, per day, per session.**

Claude Code already writes a complete transcript of every session to `~/.claude/projects/<project>/<session>.jsonl`, with a timestamp on every message. `claude-code-time` reads those logs and turns them into an honest time report:

- **Active time, not wall clock.** The clock runs while there's back-and-forth activity. Any gap longer than the idle threshold (default **15 minutes**) splits the session into separate work blocks — so if Claude finishes at 2pm and you don't come back until 4pm, those two hours don't count. Come back and work another two hours, and that block is tracked as its own stretch.
- **Per project · per day · per session.** Totals by project, a stacked daily chart, and a session table with active vs wall-clock time, work-block counts, and message counts.
- **Nothing to install in Claude Code, no hooks, no daemon.** It's a pure reader — your logs already have everything.

## Quick start

```bash
git clone https://github.com/YOURNAME/claude-code-time
cd claude-code-time
npm install
npm run dev
```

Open http://localhost:3000. The dashboard reads `~/.claude` on the machine it runs on (override with the `CLAUDE_DIR` environment variable).

## Static snapshots

Export a single self-contained HTML file — shareable, attachable, no server:

```bash
npm run snapshot -- --out my-hours.html --idle-minutes 15 --tz America/Los_Angeles
```

Options: `--idle-minutes <n>` (default 15) · `--days <n>` (limit range) · `--tz <IANA zone>` (day bucketing) · `--claude-dir <path>` · `--report <path.json>` (render a saved report instead of scanning).

## How active time is computed

1. Every transcript line with a timestamp and a `user` / `assistant` / `system` type becomes an event.
2. Events in a session are sorted and grouped into **work blocks**: consecutive events stay in one block while the gap between them is ≤ the idle threshold.
3. A block's duration is `last event − first event`. Session active time is the sum of its blocks. A lone event (a session you opened and abandoned) counts as zero.
4. Day totals split midnight-crossing blocks across the days they touch, in your timezone.

The idle threshold is the honest-hours dial: 5 min approximates billing-strict tracking, 15 min (default) tolerates coffee, 30–60 min tolerates research detours. Change it live in the dashboard's filter row.

## Deploying to Vercel

The app deploys to Vercel as-is (`vercel` or the GitHub integration — framework preset: Next.js). One caveat by design: a hosted deployment can't read visitors' local `~/.claude`, so when no logs exist the API serves the bundled **demo dataset** (`data/demo-report.json`, regenerate with `npm run demo-data`) and the UI runs as a live demo. Real tracking happens where your logs live:

- run `npm run dev` locally, or
- generate a static snapshot (`npm run snapshot`) and host *that* anywhere — it's one HTML file with your data baked in.

## Project layout

```
lib/parser.ts     JSONL transcript parser (~/.claude/projects scanner)
lib/blocks.ts     work-block engine: idle splitting, day bucketing, aggregation
lib/view.ts       browser-safe view helpers (range filters, colors, formatting)
components/       the dashboard (React, no chart library — hand-rolled SVG)
app/api/data      scan endpoint (idleMinutes, days, tz params)
scripts/          static snapshot exporter · demo data generator
```

## Tests

```bash
npm test
```

Covers block splitting (threshold edges, lone events), session summarization, range filters, and timezone-correct midnight splitting.

## Privacy

Your transcripts never leave your machine. The tool reads timestamps and message *types* only — it never parses message content into the report. A snapshot HTML contains your project names, session times, and message counts; share accordingly.

## License

MIT
