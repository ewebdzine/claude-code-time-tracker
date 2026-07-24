"use client";

import { useCallback, useEffect, useState } from "react";
import Dashboard from "@/components/Dashboard";
import type { TrackerReport } from "@/lib/types";

export default function Home() {
  const [report, setReport] = useState<TrackerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idleMinutes, setIdleMinutes] = useState(15);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (idle: number) => {
    setRefreshing(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(
        `/api/data?idleMinutes=${idle}&tz=${encodeURIComponent(tz)}`
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setReport((await res.json()) as TrackerReport);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/idle change; state updates happen async after the fetch resolves
    void load(idleMinutes);
  }, [load, idleMinutes]);

  if (error) {
    return (
      <div className="wrap">
        <div className="card">
          <div className="card-head">
            <h2>Couldn&apos;t read session logs</h2>
          </div>
          <p style={{ color: "var(--text-secondary)" }}>{error}</p>
          <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
            claude-code-time reads Claude Code transcripts from ~/.claude
            (override with the CLAUDE_DIR environment variable) and works when
            run on the machine where Claude Code runs.
          </p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="wrap">
        <p style={{ color: "var(--text-muted)" }}>Scanning session logs…</p>
      </div>
    );
  }

  return (
    <Dashboard
      report={report}
      mode="live"
      idleMinutes={idleMinutes}
      onIdleChange={setIdleMinutes}
      refreshing={refreshing}
    />
  );
}
