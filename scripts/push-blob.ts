/**
 * Push a real time-tracking report from this machine's ~/.claude up to Vercel
 * Blob, so the hosted (login-protected) dashboard can show live data.
 *
 *   BLOB_READ_WRITE_TOKEN=xxx npx tsx scripts/push-blob.ts \
 *     --idle-minutes 15 --tz America/Chicago
 *
 * Run it on a schedule (e.g. hourly cron) to keep the hosted view fresh.
 * Options: --idle-minutes <n> · --days <n> · --tz <IANA zone> · --claude-dir <path>
 */

import { put } from "@vercel/blob";
import { scan, defaultClaudeDir } from "../lib";
import { BLOB_REPORT_PATHNAME } from "../lib/blob";
import { attachScores } from "../lib/scores";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error(
      "BLOB_READ_WRITE_TOKEN is not set. Copy it from your Vercel project's\n" +
        "Storage → Blob store, then re-run."
    );
    process.exit(1);
  }

  const idleMinutes = Number(arg("idle-minutes") ?? 15);
  const days = Number(arg("days") ?? 0);
  const claudeDir = arg("claude-dir") ?? defaultClaudeDir();

  const report = await scan(claudeDir, {
    idleThresholdMs: idleMinutes * 60 * 1000,
    since: days > 0 ? Date.now() - days * 86400000 : undefined,
    timeZone: arg("tz"),
  });

  if (report.sessionCount === 0) {
    console.error(`No sessions found under ${claudeDir} — nothing to push.`);
    process.exit(1);
  }

  // Fold in any prompt-health ratings so the hosted dashboard shows them too.
  attachScores(report);

  await put(BLOB_REPORT_PATHNAME, JSON.stringify(report), {
    access: "private",
    contentType: "application/json",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  console.log(
    `Pushed ${report.sessionCount} sessions / ` +
      `${Math.round(report.totalActiveMs / 3600000)}h active to Blob (${BLOB_REPORT_PATHNAME}).`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
