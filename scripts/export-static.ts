/**
 * Export a self-contained HTML snapshot of the dashboard.
 *
 *   npx tsx scripts/export-static.ts [--out snapshot.html]
 *     [--idle-minutes 15] [--days 90] [--tz America/Los_Angeles]
 *     [--claude-dir ~/.claude] [--report path/to/report.json]
 *
 * The output is one HTML file with the report JSON, all CSS, and the
 * bundled dashboard JS inlined — shareable, no server needed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { scan, defaultClaudeDir } from "../lib";
import type { TrackerReport } from "../lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const out = arg("out") ?? "claude-time-snapshot.html";
  const idleMinutes = Number(arg("idle-minutes") ?? 15);
  const days = arg("days") ? Number(arg("days")) : undefined;
  const tz = arg("tz");
  const claudeDir = arg("claude-dir") ?? defaultClaudeDir();
  const reportPath = arg("report");

  let report: TrackerReport;
  if (reportPath) {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as TrackerReport;
  } else {
    report = await scan(claudeDir, {
      idleThresholdMs: idleMinutes * 60 * 1000,
      since: days ? Date.now() - days * 86400000 : undefined,
      timeZone: tz,
    });
  }

  const bundle = await build({
    entryPoints: [path.join(ROOT, "scripts/static-entry.tsx")],
    bundle: true,
    minify: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ROOT },
  });

  const js = bundle.outputFiles[0].text;
  const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

  // Escape "</script>" sequences so embedded JSON/JS can't close the tags.
  const reportJson = JSON.stringify(report).replace(/<\//g, "<\\/");
  const safeJs = js.replace(/<\/script>/g, "<\\/script>");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Claude Code time — snapshot</title>
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>window.__REPORT__ = ${reportJson};</script>
<script>${safeJs}</script>
</body>
</html>
`;

  fs.writeFileSync(out, html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(
    `Wrote ${out} (${kb} KB) — ${report.sessionCount} sessions, ` +
      `${report.projectCount} projects, ` +
      `${Math.round(report.totalActiveMs / 3600000)}h active total.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
