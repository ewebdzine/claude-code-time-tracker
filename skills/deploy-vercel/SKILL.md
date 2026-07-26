---
name: deploy-vercel
description: Optional wizard to put the Claude Code Time Tracker online as a private, magic-link-gated dashboard on Vercel, fed by your real data. Walks through deploying the app (Vercel CLI or dashboard), turning on passwordless email login (Resend + an email allowlist), wiring private Vercel Blob storage, and scheduling the hourly push that sends your local report up. Run when the user types /time-tracker:deploy-vercel, or says "host the time tracker", "deploy the dashboard to Vercel", "put my time tracker online", "share my dashboard with a login". Local use needs none of this - it's purely for a hosted copy.
---

# Deploy to Vercel - a private, hosted dashboard

Stand up an online copy of the dashboard, gated behind a **passwordless magic-link login**
(only emails you allow can sign in), showing your **real** data. Because a Vercel server has no
`~/.claude` folder, real data gets there by a small **hourly push** from this machine to private
**Vercel Blob** storage; the hosted app reads it server-side, behind the login. With no data
pushed yet, the site shows the bundled demo.

This is entirely optional. If the user just wants the dashboard for themselves, point them at
`/time-tracker:launch` instead and stop.

> **Secret-handling boundary.** You (Claude) orchestrate the deploy and set *non-secret* config
> (the generated `AUTH_SECRET`, the email allowlist, the app URL). **The user enters their own
> credentials** - the Resend API key and anything from their Vercel/Resend accounts - into the
> Vercel dashboard or via `vercel env add` themselves. Never ask the user to paste an API key into
> the chat, and never echo a secret back.

## The pieces

| Env var | Where | What it does |
|---|---|---|
| `AUTH_SECRET` | Vercel (Production) | Turns on the login gate; signs the magic-link/session tokens. **You generate it.** |
| `ALLOWED_EMAILS` | Vercel (Production) | Comma-separated allowlist - only these addresses can sign in. |
| `RESEND_API_KEY` | Vercel (Production) | Sends the login email via [Resend](https://resend.com). **User supplies.** |
| `MAGIC_FROM` | Vercel (Production, optional) | From-address for the login email. Defaults to Resend's sandbox `onboarding@resend.dev`, which only delivers to your own Resend account email - fine for solo use; verify a domain in Resend to email others. |
| `APP_URL` | Vercel (Production, optional) | Your prod URL (e.g. `https://<app>.vercel.app`) so magic links point at prod. |
| `BLOB_READ_WRITE_TOKEN` | **Auto** on Vercel; **manual** locally | Read/write the private report Blob. Vercel injects it when you connect a Blob store; the local push needs a copy. |

## How to run

Walk these steps interactively. Confirm before anything irreversible (creating the Vercel
project, deploying, scheduling a job).

### 1. Preflight
- The deployable app is the local copy at `APP_DIR="${CCTI_APP_DIR:-$HOME/.claude-time-tracker}"`
  (from `/time-tracker:setup`). If it's missing, run `/time-tracker:setup` first.
- Check for the Vercel CLI: `vercel --version`. If absent, either `npm i -g vercel` (ask first)
  or use the **Dashboard path** in step 3.
- Confirm the user has (or will make) free accounts at **vercel.com** and **resend.com**.

### 2. Generate the auth secret (non-secret orchestration)
```bash
openssl rand -hex 32
```
Hold this value for step 4's `AUTH_SECRET`. (It's freshly generated, not a user credential.)

### 3. Create the project & first deploy

**CLI path (recommended - no GitHub needed):**
```bash
cd "$APP_DIR"
vercel link          # create/link a Vercel project (interactive; the user picks scope/name)
vercel deploy        # a preview build to confirm it compiles
```

**Dashboard path (no CLI):**
- Fork `github.com/ewebdzine/claude-code-time-tracker` to the user's GitHub, then in Vercel:
  **Add New → Project → Import** that fork. Framework autodetects as Next.js. Deploy once.

### 4. Turn on the login gate + email (env vars)
Set these on the **Production** environment. Non-secrets you can set directly; **the user enters
`RESEND_API_KEY` themselves**.

CLI (each command prompts for the value on stdin - not echoed):
```bash
vercel env add AUTH_SECRET production        # paste the hex from step 2
vercel env add ALLOWED_EMAILS production     # e.g. you@example.com,teammate@example.com
vercel env add APP_URL production            # your https://<app>.vercel.app
# USER runs this one with their Resend key:
vercel env add RESEND_API_KEY production
# optional, only if they verified a sending domain in Resend:
vercel env add MAGIC_FROM production         # e.g. login@theirdomain.com
```
Dashboard: **Project → Settings → Environment Variables** → add the same keys for Production.

> Resend key: the user creates it at resend.com → **API Keys**. For solo use they can skip domain
> verification and rely on the sandbox sender (delivers only to their Resend account email).

### 5. Connect private Blob storage
- Vercel dashboard → the project → **Storage → Create Database → Blob** → connect it to the
  project. Vercel automatically adds **`BLOB_READ_WRITE_TOKEN`** to the project's env - **do not
  set it by hand.** The app already reads/writes this store with `access: "private"`, so the
  report is never public.

### 6. Redeploy to production
```bash
cd "$APP_DIR" && vercel deploy --prod
```
(Or **Redeploy** in the dashboard so the new env vars take effect.) Then visit the URL: you
should hit the **login screen**; an allowed email gets a magic link; the dashboard shows the
**demo** until step 7 pushes real data.

### 7. Schedule the hourly push (real data)
The hosted app only shows *your* data once this machine pushes it. The push needs the Blob token
locally:
- Get the token: `cd "$APP_DIR" && vercel env pull .env.local` (writes `BLOB_READ_WRITE_TOKEN`
  into `.env.local`), or copy it from the dashboard into `$APP_DIR/.env.local`.
- The push command (score first if the user wants prompt-health, then upload - both read local
  logs, only derived numbers leave the machine):
  ```bash
  cd "$APP_DIR"
  npm run score-sessions -- --new   # optional; needs ANTHROPIC_API_KEY in .env.local
  npm run push-blob                 # uploads the report to private Blob
  ```
- Schedule it hourly:
  - **macOS/Linux (cron):** `crontab -e`, add
    `0 * * * * cd $HOME/.claude-time-tracker && /usr/bin/env npm run push-blob >> $HOME/.claude-time-tracker/push.log 2>&1`
    (prepend the `score-sessions` line if scoring). Load env from `.env.local` in the command or a
    wrapper script so the token is present.
  - **Windows:** Task Scheduler → hourly task running the same `npm run push-blob` in `APP_DIR`.
- Confirm: run the push once by hand, reload the hosted dashboard, and verify real data appears
  (not the demo).

### 8. Report
Give the user: the **URL**, who's on the **allowlist**, that login is **magic-link only**, that
**Blob is private** and only derived metrics (timestamps, token counts, tool names, ratings -
never code or prompts) are uploaded, and that data refreshes **hourly** via the scheduled push.
Note they can add/remove people later by editing `ALLOWED_EMAILS` and redeploying.

## Notes
- **Nothing here affects local use.** The gate only activates when `AUTH_SECRET` is set, which is
  only on the hosted deploy - `/time-tracker:launch` stays open and keyless.
- **Privacy.** Prompt-health scoring runs on this machine (needs `ANTHROPIC_API_KEY`); only the
  resulting ratings are pushed. Message content and code never leave the machine.
- **Costs.** Vercel Hobby, Vercel Blob, and Resend all have free tiers that comfortably cover a
  personal dashboard.
