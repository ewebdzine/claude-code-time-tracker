# Team Edition — scope & design

**Goal:** a company deploys one hosted dashboard; multiple developers connect their Claude Code (their `~/.claude` logs) to it. The dashboard shows **all development across all developers combined**, and you can **drill into any individual developer**. Privacy holds — still only timestamps, token counts, tool names, and ratings; never code or prompts.

Status: **scoped, not built.** This is the design to work from when we start.

---

## The core shift: single-user → multi-tenant

Today: one machine builds one report → one Blob object (`reports/latest.json`) → the dashboard reads it.

Team: **N developers each push their own report**, and the server **merges them** into a company view with a new *developer* dimension. Everything else (idle-aware active time, calendar, tokens, canon, prompt-health) is unchanged per session — we just add "who" alongside "what project / when."

```
 dev A machine ──push──▶ reports/alice.json ─┐
 dev B machine ──push──▶ reports/bob.json    ─┼─▶ merge + tag owner ─▶ team dashboard
 dev C machine ──push──▶ reports/carol.json  ─┘         (server-side)     ├─ all developers combined
                                                                          └─ drill into one developer
```

---

## Data model

Each developer has a stable **`userId`** (their email from the magic-link roster is the natural key).

Two storage options:

| | **A. Per-user Blob objects** *(MVP)* | **B. Database** (Postgres / KV) |
|---|---|---|
| Shape | `reports/<userId>.json` per dev; merge on read | `sessions` table keyed by `(userId, sessionId)`; upsert |
| Infra | None new (already using Blob) | +1 managed DB |
| Merge | Read all objects, tag each session with its owner, aggregate in memory (cache ~60s) | Query with filters/aggregates |
| History | Rolling current state only | Time-series / trends over time |
| Scales to | Small teams (<~50 devs) | Large teams + history |

**Recommendation:** ship on **(A) per-user Blob** — it matches the current architecture with zero new infra — and migrate to **(B)** behind the same read API only if a team needs scale or historical trends.

`SessionSummary` gains an optional `userId` (attached at merge time). `TrackerReport` gains a `developers[]` aggregate (mirroring `projects[]`): active time, session count, first/last, per developer.

---

## Dashboard: the "developer" dimension

Mirror the existing **project drill-down**, but on a **people** axis — the individual-view you described falls out for free:

- **Team overview** — team KPI tiles (total active time, total sessions, active developers, avg per developer), and the daily chart stackable **by developer** or by project (a toggle).
- **Time by developer** — a bar list like "Time by project"; **click a developer → the whole dashboard scopes to them** (their projects, calendar, sessions, tokens).
- **Combined filters** — developer × project (e.g. "Alice on `storefront`").
- **Team calendar** — all developers' work blocks, color-coded by developer (with a per-developer filter so it stays readable).
- **Admin developer switcher** — quick jump between "everyone" and any one person.

Most of this reuses the `computeView(..., filter)` + breadcrumb pattern already built for projects.

---

## Auth, roles & secure push

- The **magic-link allowlist becomes the team roster** (`ALLOWED_EMAILS`).
- **Roles:** `admin` (sees the whole team + any individual) vs `developer` (sees themselves; team aggregates optional/configurable). MVP: an `ADMIN_EMAILS` list; everyone else is a developer.
- **Secure multi-user push** — the important new piece. Today the push agent needs the Blob read/write token, which can read/write *everyone's* data. For a team we add an authenticated **write endpoint**:
  - Dev's agent `POST`s its report to **`/api/push`** with a **per-developer bearer token**.
  - The server validates the token → writes only to **that developer's** key.
  - The storage (Blob/DB) token stays server-side; developers never hold it.

---

## Onboarding a developer ("connect your Claude Code")

The UX that makes this real — target a 2-minute setup:

1. Admin invites a developer (adds their email to the roster) → the app issues a **per-developer push token**.
2. Developer runs a **one-line installer** on their machine that:
   - configures identity (their email) + the push token + the instance URL,
   - installs the hourly job (the existing `push-blob` + `score-sessions`, pointed at `/api/push`).
3. Within the hour their data appears in the team dashboard.

Prompt-health scoring stays per-machine (their prompts never leave their box); only ratings are pushed. Decision needed: shared company Anthropic key vs each dev's own vs scoring off by default.

---

## What changes vs. the current code

1. **Data model** — optional `userId` on sessions; a `developers[]` aggregate; `lib/team.ts` to load + merge per-user reports.
2. **Push** — new authenticated `/api/push` endpoint + per-developer tokens; the agent posts there instead of writing Blob directly.
3. **Auth/roles** — roster + admin role; "who am I" so developers see themselves; middleware already gates access.
4. **Dashboard** — developer dimension: Time-by-developer, developer drill-down, team KPIs, developer filter on calendar/sessions, admin switcher.
5. **Onboarding** — the installer/agent + docs.
6. **Storage** — MVP per-user Blob; optional DB later.

---

## Phases

- **Phase 0 — data model & merge (foundation):** per-user report keys + server-side merge + owner tagging; dashboard reads merged data (no UI change yet).
- **Phase 1 — developer dimension UI:** Time-by-developer, developer drill-down, team KPIs, developer filter. Reuses the project-drilldown pattern.
- **Phase 2 — secure multi-user push:** `/api/push` endpoint + per-developer tokens + the connect-your-Claude-Code installer. *(The heart of "multiple users connect.")*
- **Phase 3 — roles & admin:** admin vs developer visibility; roster management.
- **Phase 4 (optional) — DB backend:** scale, history, faster queries; drop-in behind the same read API.

An MVP is **Phases 0–3**: a company self-deploys one instance, a handful of devs connect, combined + per-developer views, magic-link roster, basic admin.

---

## Open decisions (to settle before building)

1. **Storage:** per-user Blob (simple) vs Postgres (scale + history). → recommend Blob for MVP.
2. **Push security:** per-developer push tokens via `/api/push` (recommended) vs sharing the Blob token (simpler, less safe).
3. **Visibility:** managers see everyone — do developers see team aggregates, or only themselves?
4. **Prompt-health for the team:** shared Anthropic key, each dev's own, or off by default.
5. **Deployment shape:** one instance per company (self-deploy, matches today) vs a hosted multi-company SaaS (bigger product). → recommend one-instance-per-company for MVP.
6. **History:** rolling current state (Blob overwrite) vs historical time-series (DB) for trends.
7. **Sensitivity:** surfacing per-developer hours/ratings to managers is a people/culture decision, not just a technical one — worth an explicit policy + transparency to the team.

---

## Rough effort

- **Phase 0 + 1** (merge + developer-dimension UI) — a focused chunk; heavily reuses existing patterns.
- **Phase 2** (secure push + onboarding) — the trickiest: auth, per-dev tokens, installer UX.
- **Phase 3** (roles) — moderate.
- **Phase 4** (DB) — optional, larger.
