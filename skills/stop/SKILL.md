---
name: stop
description: Stop the locally running Claude Code Time Tracker dashboard. Shuts down the background Next.js dev server that /time-tracker:launch started and cleans up its PID file. Run when the user types /time-tracker:stop, or says "stop the time tracker", "shut down the dashboard", "kill the time tracker server", "close the dashboard".
---

# Stop - shut down the dashboard

Stop the background dev server started by `/time-tracker:launch`.

## How to run

1. **Locate the install.** `APP_DIR="${CCTI_APP_DIR:-$HOME/.claude-time-tracker}"`.

2. **Stop via the PID file** if present:
   ```bash
   if [ -f "$APP_DIR/.dev-server.pid" ]; then
     PID=$(cat "$APP_DIR/.dev-server.pid")
     # Kill the process group so the Node child (next-server) goes too.
     kill "$PID" 2>/dev/null && sleep 1
     kill -9 "$PID" 2>/dev/null
     rm -f "$APP_DIR/.dev-server.pid"
     echo "stopped pid $PID"
   else
     echo "no pid file"
   fi
   ```

3. **Fallback / sanity check.** If there was no PID file (or a stale one), find any dev server
   still serving this app and stop it. Match on the app directory to avoid killing unrelated
   Node processes:
   ```bash
   pkill -f "next dev" 2>/dev/null || true
   ```
   Prefer the narrowest match you can - if `pgrep -af "next dev"` shows other projects' servers,
   only target the one whose cwd is `$APP_DIR` rather than killing them all.

4. **Report** whether a server was stopped or nothing was running. Remind the user they can
   start it again anytime with **`/time-tracker:launch`**.
