/**
 * Entry point for the self-contained static snapshot.
 * The export script embeds the report JSON on window.__REPORT__ and
 * bundles this file (React included) into a single <script>.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../components/Dashboard";
import type { TrackerReport } from "../lib/types";

declare global {
  interface Window {
    __REPORT__: TrackerReport;
  }
}

const report = window.__REPORT__;
const idleMinutes = Math.round(report.idleThresholdMs / 60000);

const root = createRoot(document.getElementById("root")!);
root.render(
  <Dashboard report={report} mode="static" idleMinutes={idleMinutes} />
);
