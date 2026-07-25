/**
 * Regenerate the README screenshots from the running dashboard.
 *
 *   1. Serve the DEMO dataset (so no real project names leak):
 *        CLAUDE_DIR=/tmp/empty npm run dev
 *   2. In another shell:
 *        node scripts/screenshots.mjs            # assumes http://localhost:3000
 *        BASE_URL=http://localhost:4000 node scripts/screenshots.mjs
 *
 * Requires Playwright's Chromium: `npx playwright install --with-deps chromium`.
 * Writes 2x PNGs to docs/screenshots/.
 */

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const OUT = fileURLToPath(new URL("../docs/screenshots", import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

const card = (name) =>
  page.locator(".card", { has: page.getByRole("heading", { name, exact: true }) });

async function shot(locator, file) {
  try {
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await locator.screenshot({ path: `${OUT}/${file}` });
    console.log("✓", file);
  } catch (e) {
    console.log("✗", file, "—", e.message.split("\n")[0]);
  }
}

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForSelector("text=Active time per day", { timeout: 15000 });
await page.waitForTimeout(800);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/overview.png` });
console.log("✓ overview.png");

await shot(card("Active time per day"), "daily-chart.png");
await shot(card("Session calendar"), "calendar-week.png");

try {
  const cal = card("Session calendar");
  await cal.getByRole("button", { name: "Day" }).click();
  await page.waitForTimeout(600);
  await shot(cal, "calendar-day.png");
  await cal.getByRole("button", { name: "Week" }).click();
  await page.waitForTimeout(400);
} catch (e) {
  console.log("✗ calendar-day.png —", e.message.split("\n")[0]);
}

await shot(card("Sessions"), "sessions.png");
await shot(card("Time by project"), "time-by-project.png");

try {
  const cal = card("Session calendar");
  await cal.scrollIntoViewIfNeeded();
  await cal.locator('[title*="click for details"]').first().click();
  await page.waitForSelector(".modal-card", { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator(".modal-card").screenshot({ path: `${OUT}/session-modal.png` });
  console.log("✓ session-modal.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
} catch (e) {
  console.log("✗ session-modal.png —", e.message.split("\n")[0]);
}

try {
  await card("Time by project").locator('[role="button"]').first().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/project-drilldown.png` });
  console.log("✓ project-drilldown.png");
} catch (e) {
  console.log("✗ project-drilldown.png —", e.message.split("\n")[0]);
}

await browser.close();
console.log("done");
