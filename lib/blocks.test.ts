import { describe, it, expect } from "vitest";
import { buildBlocks, bucketByDay, localDateKey, summarizeSession } from "./blocks";
import type { SessionEvent, SessionSummary } from "./types";
import type { ParsedTranscript } from "./parser";

const MIN = 60 * 1000;
const IDLE = 15 * MIN;

function ev(tsMin: number, actor: SessionEvent["actor"] = "user"): SessionEvent {
  return {
    timestamp: tsMin * MIN,
    actor,
    sessionId: "s1",
    isSidechain: false,
  };
}

describe("buildBlocks", () => {
  it("returns empty for no events", () => {
    expect(buildBlocks([], IDLE)).toEqual([]);
  });

  it("puts continuous activity in one block", () => {
    const blocks = buildBlocks([ev(0), ev(5, "assistant"), ev(10)], IDLE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].durationMs).toBe(10 * MIN);
    expect(blocks[0].userMessages).toBe(2);
    expect(blocks[0].assistantMessages).toBe(1);
  });

  it("splits on gaps longer than the idle threshold", () => {
    // Work 0–10, walk away 2 hours, work 130–140.
    const blocks = buildBlocks(
      [ev(0), ev(10, "assistant"), ev(130), ev(140, "assistant")],
      IDLE
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].durationMs).toBe(10 * MIN);
    expect(blocks[1].durationMs).toBe(10 * MIN);
    // Total active = 20 min, not the 140-min wall-clock span.
    const active = blocks.reduce((s, b) => s + b.durationMs, 0);
    expect(active).toBe(20 * MIN);
  });

  it("keeps a gap exactly at the threshold in one block", () => {
    const blocks = buildBlocks([ev(0), ev(15)], IDLE);
    expect(blocks).toHaveLength(1);
  });

  it("splits a gap one ms over the threshold", () => {
    const a = ev(0);
    const b = { ...ev(15), timestamp: 15 * MIN + 1 };
    expect(buildBlocks([a, b], IDLE)).toHaveLength(2);
  });

  it("a lone event forms a zero-duration block", () => {
    const blocks = buildBlocks([ev(42)], IDLE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].durationMs).toBe(0);
    expect(blocks[0].eventCount).toBe(1);
  });
});

describe("summarizeSession", () => {
  const transcript: ParsedTranscript = {
    file: "/tmp/s1.jsonl",
    sessionId: "s1",
    cwd: "/home/brent/projects/acme",
    gitBranch: "main",
    version: "2.0.0",
    events: [ev(0), ev(10, "assistant"), ev(130), ev(140, "assistant")],
  };

  it("computes active vs span time", () => {
    const s = summarizeSession(transcript, "/fallback", { idleThresholdMs: IDLE });
    expect(s).not.toBeNull();
    expect(s!.activeMs).toBe(20 * MIN);
    expect(s!.spanMs).toBe(140 * MIN);
    expect(s!.projectName).toBe("acme");
    expect(s!.blocks).toHaveLength(2);
  });

  it("respects since/until filters", () => {
    const s = summarizeSession(transcript, "/fallback", {
      idleThresholdMs: IDLE,
      since: 100 * MIN,
    });
    expect(s!.eventCount).toBe(2);
    expect(s!.activeMs).toBe(10 * MIN);
  });

  it("returns null when all events are filtered out", () => {
    const s = summarizeSession(transcript, "/fallback", { since: 999 * MIN });
    expect(s).toBeNull();
  });

  it("falls back to decoded path when cwd is missing", () => {
    const s = summarizeSession({ ...transcript, cwd: null }, "/decoded/path");
    expect(s!.projectPath).toBe("/decoded/path");
  });
});

describe("day bucketing", () => {
  it("formats local date keys as YYYY-MM-DD", () => {
    // 2026-07-24T20:00:00Z is 13:00 in Los Angeles.
    const ts = Date.parse("2026-07-24T20:00:00Z");
    expect(localDateKey(ts, "America/Los_Angeles")).toBe("2026-07-24");
    // ...but already the 25th in Tokyo.
    expect(localDateKey(ts, "Asia/Tokyo")).toBe("2026-07-25");
  });

  it("splits a midnight-crossing block across both days", () => {
    const start = Date.parse("2026-07-24T23:50:00-07:00");
    const end = Date.parse("2026-07-25T00:10:00-07:00");
    const session: SessionSummary = {
      sessionId: "s1",
      projectPath: "/p",
      projectName: "p",
      firstEvent: start,
      lastEvent: end,
      activeMs: end - start,
      spanMs: end - start,
      blocks: [
        {
          start,
          end,
          durationMs: end - start,
          eventCount: 2,
          userMessages: 1,
          assistantMessages: 1,
        },
      ],
      eventCount: 2,
      userMessages: 1,
      assistantMessages: 1,
      file: "/tmp/s1.jsonl",
    };
    const days = bucketByDay([session], "America/Los_Angeles");
    expect(days).toHaveLength(2);
    expect(days[0].date).toBe("2026-07-24");
    expect(days[0].activeMs).toBe(10 * MIN);
    expect(days[1].date).toBe("2026-07-25");
    expect(days[1].activeMs).toBe(10 * MIN);
    const total = days.reduce((s, d) => s + d.activeMs, 0);
    expect(total).toBe(20 * MIN);
  });
});
