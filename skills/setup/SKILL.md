---
name: setup
description: One-time local install for the Claude Code Time Tracker dashboard. Copies the app out of the plugin into a stable working directory (~/.claude-time-tracker), installs its dependencies with npm, and verifies it's ready - no API keys, no account, nothing leaves the machine. Run when the user types /time-tracker:setup, or says "install the time tracker", "set up claude code time tracker", "get the time tracker running", "install the dashboard". Re-running is safe and also acts as an update.
---

# Setup - install the Time Tracker locally

Stand up the dashboard on this machine so `/time-tracker:launch` can open it. This is a
**100% local** tool: it reads the Claude Code transcripts already in `~/.claude`, computes
idle-aware active time, and serves a dashboard on `localhost`. No API key, no account, and
no data ever leaves the machine. Scoring prompts (`/time-tracker:score`) and hosting it
(`/time-tracker:deploy-vercel`) are separate, optional add-ons.

> **App source** is the plugin's own directory (`${CLAUDE_PLUGIN_ROOT}` - the Next.js project
> that ships in this plugin). The **running copy** lives in `~/.claude-time-tracker` so a plugin
> update never clobbers `node_modules` and vice-versa. This skill (re)syncs source → working
> copy, so running it again is how you **update** after upgrading the plugin.

## How to run

1. **Check Node.** Run `node --version`. The app needs **Node 20 or newer**.
   - If Node is missing or older, stop and tell the user to install it (nodejs.org, or
     `nvm install 20`). Do not try to install Node for them.

2. **Pick the working directory.** Default `APP_DIR="$HOME/.claude-time-tracker"`.
   - Honour an existing `$CCTI_APP_DIR` if the user set one; otherwise use the default.

3. **Sync the app** from the plugin into the working dir, preserving an existing
   `node_modules` (so re-runs are fast). Prefer `rsync`; fall back to `cp` if it's absent:
   ```bash
   mkdir -p "$APP_DIR"
   if command -v rsync >/dev/null; then
     rsync -a --delete \
       --exclude node_modules --exclude .next --exclude .git \
       "$CLAUDE_PLUGIN_ROOT"/ "$APP_DIR"/
   else
     cp -R "$CLAUDE_PLUGIN_ROOT"/. "$APP_DIR"/
     rm -rf "$APP_DIR/.git" "$APP_DIR/.next"
   fi
   ```

4. **Install dependencies:**
   ```bash
   cd "$APP_DIR" && npm install
   ```
   This can take a minute on first run. If it fails, show the user the actual npm error rather
   than guessing.

5. **Verify** the build toolchain resolved:
   ```bash
   test -d "$APP_DIR/node_modules/next" && echo "OK: next installed"
   ```

6. **Report success** and tell the user exactly what's next. Keep it short:
   - Installed to `~/.claude-time-tracker`.
   - Reads your local `~/.claude` logs - nothing is uploaded.
   - Run **`/time-tracker:launch`** to open the dashboard.
   - Optional: **`/time-tracker:deploy-vercel`** to put it online behind a private login.

## Notes

- **Where are the logs?** The app reads `~/.claude/projects/**/**.jsonl` by default. If the
  user keeps them elsewhere, they can set `CLAUDE_DIR` when launching (the launch skill covers this).
- **Nothing to configure for local use.** Auth, email, and cloud storage are all off unless the
  corresponding env vars are set - which only happens via `/time-tracker:deploy-vercel`.
- **Idempotent.** Safe to re-run anytime; it re-syncs the latest app code and reinstalls.
