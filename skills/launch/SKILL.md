---
name: launch
description: Start the Claude Code Time Tracker dashboard locally and open it in the browser. Boots the Next.js dev server in the background against your ~/.claude logs, waits for it to be ready, prints the URL (http://localhost:3000), and opens it. Run when the user types /time-tracker:launch, or says "open the time tracker", "launch the dashboard", "show me my Claude Code hours", "start the time tracker". If it isn't installed yet, run /time-tracker:setup first.
---

# Launch - open the dashboard

Start the local dashboard and open it in the browser. It serves at **http://localhost:3000**,
reads the transcripts in `~/.claude`, and keeps running in the background until the user runs
**`/time-tracker:stop`** (or closes the terminal/machine).

> The app lives in `~/.claude-time-tracker` (set up by `/time-tracker:setup`). If that folder
> or its `node_modules` is missing, run **`/time-tracker:setup`** first, then come back here.

## How to run

1. **Locate the install.** `APP_DIR="${CCTI_APP_DIR:-$HOME/.claude-time-tracker}"`.
   - If `$APP_DIR/node_modules/next` is missing, tell the user to run `/time-tracker:setup`
     first and stop.

2. **Already running?** If `$APP_DIR/.dev-server.pid` exists and that PID is alive, don't start
   a second server - just re-open the URL (step 5) and report it's already up. Read the port
   from `$APP_DIR/.dev-server.log` if present (Next prints `Local: http://localhost:PORT`).

3. **Start the server in the background** and log to a file so we can read the port and detect
   readiness. Use `nohup` so it survives this tool call:
   ```bash
   cd "$APP_DIR"
   nohup npm run dev > .dev-server.log 2>&1 &
   echo $! > .dev-server.pid
   ```
   - To read logs from a different location, prefix with `CLAUDE_DIR=/path/to/.claude`.

4. **Wait for ready.** Poll `.dev-server.log` (up to ~30s) for the line containing
   `Local:` / `Ready` and capture the URL (default `http://localhost:3000`; Next auto-bumps to
   3001+ if 3000 is taken, so read the actual port from the log rather than assuming):
   ```bash
   for i in $(seq 1 30); do
     grep -qE "Ready|Local:" "$APP_DIR/.dev-server.log" && break
     sleep 1
   done
   grep -oE "http://localhost:[0-9]+" "$APP_DIR/.dev-server.log" | head -1
   ```
   - If it never becomes ready, show the tail of `.dev-server.log` so the user sees the error.

5. **Open the browser** at the detected URL. Pick the opener for the platform; try in order and
   don't fail the whole skill if none work - just print the URL clearly:
   - macOS: `open "$URL"`
   - Linux (native): `xdg-open "$URL"`
   - WSL: `explorer.exe "$URL"` (or `wslview "$URL"` if installed)
   - Windows (Git Bash): `start "" "$URL"`

6. **Report.** Tell the user:
   - The dashboard is live at **$URL** (opened in the browser).
   - It's reading their local `~/.claude` logs; data refreshes when they reload the page.
   - It runs in the background - stop it anytime with **`/time-tracker:stop`**.

## Notes

- **First paint** may take a few seconds while Next compiles the route - that's normal on the
  first load after launch.
- **No data / demo data?** If the dashboard shows the built-in demo, the app didn't find local
  transcripts. Confirm `~/.claude/projects` exists, or relaunch with `CLAUDE_DIR` pointing at the
  right folder.
- **Port in use.** If 3000 is busy, Next uses the next free port - always trust the URL printed
  in `.dev-server.log`, not a hard-coded 3000.
