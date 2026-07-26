---
name: score
description: Rate how well you prompted Claude in each session (optional, AI-graded). Runs the local prompt-health scorer over your ~/.claude transcripts and writes a 🟢/🟡/🔴 rating, a session type, and a one-line coaching note per session - shown in the dashboard. Needs your own Anthropic API key; runs entirely on your machine, and only the ratings (never your prompts) are ever stored or, if you host it, pushed. Run when the user types /time-tracker:score, or says "rate my prompts", "score my sessions", "how well did I prompt".
---

# Score - grade your prompting (optional)

Adds a prompt-health rating to each session: a 🟢/🟡/🔴 grade, the session type
(explore / build / debug / mixed), and a short coaching note. Ratings are **calibrated to session
type** - an exploratory back-and-forth isn't penalised for meandering the way a build session
would be. Results are cached locally and surfaced as badges in the dashboard.

> Requires an **Anthropic API key** (the user's own). Scoring runs on this machine against local
> logs; only the derived rating/type/note are saved - never the prompts or code.

## How to run

1. **App dir:** `APP_DIR="${CCTI_APP_DIR:-$HOME/.claude-time-tracker}"`. If missing, run
   `/time-tracker:setup` first.
2. **API key.** Ensure `ANTHROPIC_API_KEY` is available - in the environment or in
   `$APP_DIR/.env.local`. If the user doesn't have one, point them to
   console.anthropic.com → API keys. Never ask them to paste it into the chat; have them put it in
   `.env.local` themselves.
3. **Run the scorer:**
   ```bash
   cd "$APP_DIR"
   npm run score-sessions -- --new     # only sessions not yet scored
   ```
   Use `-- --all` to score everything, `-- --rescore` to redo, `-- --limit N` to cap a run.
4. **Report** how many sessions were scored and remind the user the badges appear on next
   dashboard reload (`/time-tracker:launch` if it isn't running).
