---
name: snapshot
description: Export a static, shareable snapshot of your Claude Code Time Tracker data - a self-contained report file built from your ~/.claude logs, with no server required. Useful for sharing your hours or archiving a point-in-time view without hosting anything. Run when the user types /time-tracker:snapshot, or says "export my time tracker", "snapshot my hours", "save a report of my Claude Code time".
---

# Snapshot - export a static report

Produce a point-in-time export of the tracker's data from the local logs, with no dev server and
nothing hosted. Good for archiving or sharing a single file.

## How to run

1. **App dir:** `APP_DIR="${CCTI_APP_DIR:-$HOME/.claude-time-tracker}"`. If missing, run
   `/time-tracker:setup` first.
2. **Generate the snapshot:**
   ```bash
   cd "$APP_DIR"
   npm run snapshot
   ```
   To read logs from a non-default location, prefix with `CLAUDE_DIR=/path/to/.claude`.
3. **Report** the path to the generated file and what it contains (idle-aware active time per
   project/day/session, token/tool usage - no message content). Remind the user it's a frozen
   copy; re-run to refresh.
