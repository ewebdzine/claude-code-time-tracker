# claude-code-time-tracker

**Idle-aware time tracking for [Claude Code](https://claude.com/claude-code) — see how long you and Claude actually worked, per project, per day, per session.**

Claude Code already writes a complete transcript of every session to `~/.claude/projects/<project>/<session>.jsonl`, with a timestamp on every message. `claude-code-time-tracker` reads those logs and turns them into an honest time report:

- **Active time, not wall clock.** The clock runs while there's back-and-forth activity. Any gap longer than the idle threshold (default **15 minutes**) splits the session into separate work blocks — so if Claude finishes at 2pm and you don't come back until 4pm, those two hours don't count. Come back and work another two hours, and that block is tracked as its own stretch.
- **Per project · per day · per session.** Totals by project, a stacked daily chart, and a session table with active vs wall-clock time, work-block counts, and message counts.
- **Nothing to install in Claude Code, no hooks, no daemon.** It's a pure reader — your logs already have everything.

## Quick start

```bash
git clone https://github.com/ewebdzine/claude-code-time-tracker
cd claude-code-time-tracker
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

## Private hosted dashboard (magic link + your real data)

Want your **real** hours on a hosted URL, visible only to you? The app has an
optional, self-contained auth + data layer:

- **Magic-link login.** Set `AUTH_SECRET` and `ALLOWED_EMAILS`, and every page/API
  route is gated behind a passwordless email link (`middleware.ts`). Only listed
  addresses can sign in — even a validly-signed token for another address is
  rejected. Stateless (no database); links are sent via [Resend](https://resend.com)
  (`RESEND_API_KEY`). With auth unset (local dev), the gate is bypassed entirely.
- **Real data via Vercel Blob.** The dev machine pushes its report up with
  `npm run push-blob` (needs `BLOB_READ_WRITE_TOKEN`); the hosted API reads it
  server-side and serves it behind the login. Your data never touches the repo.
  Run the push on a schedule (e.g. hourly cron) to keep it fresh.

Env vars are documented in [`.env.example`](.env.example). When neither Blob nor
real logs are present, the API still falls back to the bundled demo dataset.

## Project layout

```
lib/parser.ts     JSONL transcript parser (~/.claude/projects scanner)
lib/blocks.ts     work-block engine: idle splitting, day bucketing, aggregation
lib/view.ts       browser-safe view helpers (range filters, colors, formatting)
lib/auth.ts       magic-link auth: signed tokens, allowlist, Resend email (edge-safe)
lib/blob.ts       reads the pushed report from Vercel Blob (hosted deploys)
middleware.ts     gates every route behind the login when auth is configured
components/       the dashboard (React, no chart library — hand-rolled SVG)
app/login         email-a-link sign-in page
app/api/auth      request · callback · logout routes
app/api/data      scan endpoint (idleMinutes, days, tz params) + Blob/demo fallback
scripts/          static snapshot exporter · demo data generator · Blob push
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
