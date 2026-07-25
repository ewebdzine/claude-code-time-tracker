"use client";

/**
 * The claude-code-time-tracker dashboard.
 *
 * Design follows the dataviz method: form before color, categorical hues in
 * fixed slot order (color follows the project, never its filtered rank),
 * thin marks with 2px surface gaps, hairline solid grid, one filter row
 * scoping everything, hover tooltips that enhance but never gate (every
 * chart has a table twin), and a dark mode selected from the same ramps.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SessionSummary, TrackerReport } from "@/lib/types";
import {
  assignColors,
  computeView,
  continuousDays,
  fmtDayLabel,
  fmtDayLong,
  fmtDuration,
  fmtHoursTick,
  fmtTime,
  niceMax,
  seriesProjects,
  OTHER_LABEL,
  OTHER_VAR,
  RANGE_PRESETS,
} from "@/lib/view";
import type { DashboardView } from "@/lib/view";

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

function useContainerWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number
] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 960);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* ------------------------------------------------------------------ */
/* Stat tiles                                                          */
/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Daily stacked columns                                               */
/* ------------------------------------------------------------------ */

interface TipState {
  x: number;
  y: number;
  title: string;
  rows: { name: string; color: string; value: string }[];
  total?: string;
}

function Tooltip({ tip }: { tip: TipState }) {
  return (
    <div className="tip" style={{ left: tip.x, top: tip.y }}>
      <div className="tip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div className="row" key={r.name}>
          <span className="key" style={{ borderTopColor: r.color }} />
          <span className="name">{r.name}</span>
          <span className="val">{r.value}</span>
        </div>
      ))}
      {tip.total ? (
        <div className="row total">
          <span className="name">Total</span>
          <span className="val">{tip.total}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Rect with only its top corners rounded (the data-end of a column). */
function roundedTopPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): string {
  const rr = Math.min(r, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

function DailyChart({
  view,
  series,
  colors,
}: {
  view: DashboardView;
  series: string[];
  colors: Map<string, string>;
}) {
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [tableView, setTableView] = useState(false);

  const days = useMemo(() => continuousDays(view.days), [view.days]);

  // Series stack order: slot order bottom-up, then Other on top.
  const stackNames = useMemo(() => {
    const present = new Set<string>();
    for (const d of days)
      for (const k of Object.keys(d.byProject)) present.add(k);
    const named = series.filter((s) => present.has(s));
    const hasOther = [...present].some((p) => !series.includes(p));
    return hasOther ? [...named, OTHER_LABEL] : named;
  }, [days, series]);

  const dayStacks = useMemo(
    () =>
      days.map((d) => {
        const vals = new Map<string, number>();
        let other = 0;
        for (const [name, ms] of Object.entries(d.byProject)) {
          if (series.includes(name)) vals.set(name, ms);
          else other += ms;
        }
        if (other > 0) vals.set(OTHER_LABEL, other);
        return vals;
      }),
    [days, series]
  );

  const PAD_L = 44;
  const PAD_R = 8;
  const PAD_T = 8;
  const PLOT_H = 240;
  const AXIS_H = 24; // x-axis band included in the container height
  const H = PAD_T + PLOT_H + AXIS_H;

  const plotW = Math.max(120, width - PAD_L - PAD_R);
  const n = days.length || 1;
  const band = plotW / n;
  const barW = Math.min(24, Math.max(3, band * 0.66));
  const GAP = 2; // surface gap between stacked segments

  const maxMs = niceMax(Math.max(...days.map((d) => d.activeMs), 0));
  const yFor = (ms: number) => PAD_T + PLOT_H - (ms / maxMs) * PLOT_H;

  // Pick a divisor whose step lands on clean values (whole hours or
  // 15/30-minute marks) so ticks read "1h", "30m" — never "2.3h".
  const CLEAN = [
    5 * 60000, 10 * 60000, 15 * 60000, 30 * 60000, 3600000, 2 * 3600000,
    3 * 3600000, 4 * 3600000, 6 * 3600000, 8 * 3600000,
  ];
  const divisor =
    [4, 3, 2].find((d) => CLEAN.includes(maxMs / d)) ?? 4;
  const ticks = Array.from({ length: divisor + 1 }, (_, k) =>
    (k / divisor) * maxMs
  );

  const labelEvery = Math.max(1, Math.ceil(n / Math.floor(plotW / 64)));

  const colorFor = (name: string) =>
    name === OTHER_LABEL ? OTHER_VAR : colors.get(name) ?? OTHER_VAR;

  const showTip = useCallback(
    (i: number, clientX: number, clientY: number, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const d = days[i];
      const stack = dayStacks[i];
      const rows = stackNames
        .filter((s) => (stack.get(s) ?? 0) > 0)
        .map((s) => ({
          name: s,
          color: colorFor(s),
          value: fmtDuration(stack.get(s) ?? 0),
        }));
      setHovered(i);
      setTip({
        x: Math.min(clientX - rect.left + 14, rect.width - 190),
        y: Math.max(8, clientY - rect.top - 10),
        title: fmtDayLong(d.date),
        rows: rows.length ? rows : [],
        total: fmtDuration(d.activeMs),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, dayStacks, stackNames, colors]
  );

  const hideTip = useCallback(() => {
    setTip(null);
    setHovered(null);
  }, []);

  if (days.length === 0) {
    return <div className="empty">No activity in this range.</div>;
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }} onPointerLeave={hideTip}>
      {tableView ? (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Day</th>
                {stackNames.map((s) => (
                  <th className="num" key={s}>
                    {s}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) =>
                d.activeMs > 0 ? (
                  <tr key={d.date}>
                    <td>{fmtDayLong(d.date)}</td>
                    {stackNames.map((s) => {
                      const v = dayStacks[i].get(s) ?? 0;
                      return (
                        <td className="num" key={s}>
                          {v > 0 ? fmtDuration(v) : "–"}
                        </td>
                      );
                    })}
                    <td className="num strong">{fmtDuration(d.activeMs)}</td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="Active time per day, stacked by project"
        >
          {/* gridlines: hairline, solid, recessive */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={width - PAD_R}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke={t === 0 ? "var(--baseline)" : "var(--grid)"}
                strokeWidth={1}
              />
              <text
                x={PAD_L - 8}
                y={yFor(t) + 3.5}
                textAnchor="end"
                fontSize={11}
                fill="var(--text-muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmtHoursTick(t)}
              </text>
            </g>
          ))}

          {/* columns */}
          {days.map((d, i) => {
            const x = PAD_L + i * band + (band - barW) / 2;
            const stack = dayStacks[i];
            let cumMs = 0;
            const segs: React.ReactNode[] = [];
            const parts = stackNames.filter((s) => (stack.get(s) ?? 0) > 0);
            parts.forEach((s, si) => {
              const ms = stack.get(s) ?? 0;
              const yTop = yFor(cumMs + ms);
              const yBot = yFor(cumMs);
              const isTop = si === parts.length - 1;
              // 2px surface gap between segments (not after the top one)
              const gapAbove = isTop ? 0 : GAP;
              const h = Math.max(0.5, yBot - yTop - gapAbove);
              const fill = colorFor(s);
              segs.push(
                isTop ? (
                  <path
                    key={s}
                    d={roundedTopPath(x, yTop, barW, h, 4)}
                    fill={fill}
                    opacity={hovered === null || hovered === i ? 1 : 0.45}
                  />
                ) : (
                  <rect
                    key={s}
                    x={x}
                    y={yTop + gapAbove}
                    width={barW}
                    height={h}
                    fill={fill}
                    opacity={hovered === null || hovered === i ? 1 : 0.45}
                  />
                )
              );
              cumMs += ms;
            });

            return (
              <g key={d.date}>
                {segs}
                {/* hit target: the whole column band, bigger than the mark */}
                <rect
                  x={PAD_L + i * band}
                  y={PAD_T}
                  width={band}
                  height={PLOT_H}
                  fill="transparent"
                  tabIndex={d.activeMs > 0 ? 0 : -1}
                  aria-label={`${fmtDayLong(d.date)}: ${fmtDuration(
                    d.activeMs
                  )}`}
                  onPointerMove={(e) =>
                    showTip(
                      i,
                      e.clientX,
                      e.clientY,
                      (e.currentTarget as SVGRectElement).ownerSVGElement!
                        .parentElement as HTMLElement
                    )
                  }
                  onFocus={(e) => {
                    const svg = (e.currentTarget as SVGRectElement)
                      .ownerSVGElement!;
                    const wrap = svg.parentElement as HTMLElement;
                    const r = wrap.getBoundingClientRect();
                    showTip(
                      i,
                      r.left + PAD_L + i * band + band / 2,
                      r.top + PAD_T + 40,
                      wrap
                    );
                  }}
                  onBlur={hideTip}
                  style={{ outline: "none" }}
                />
              </g>
            );
          })}

          {/* x-axis labels */}
          {days.map((d, i) =>
            i % labelEvery === 0 ? (
              <text
                key={d.date}
                x={PAD_L + i * band + band / 2}
                y={PAD_T + PLOT_H + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-muted)"
              >
                {fmtDayLabel(d.date)}
              </text>
            ) : null
          )}
        </svg>
      )}

      {!tableView && stackNames.length >= 2 ? (
        <div className="legend">
          {stackNames.map((s) => (
            <span className="item" key={s}>
              <span
                className="swatch"
                style={{ background: colorFor(s) }}
              />
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {tip && !tableView ? <Tooltip tip={tip} /> : null}

      <button
        className="view-toggle"
        style={{ position: "absolute", top: -34, right: 0 }}
        onClick={() => setTableView((v) => !v)}
      >
        {tableView ? "Chart" : "Table"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Project bars (horizontal)                                           */
/* ------------------------------------------------------------------ */

function ProjectBars({
  view,
  colors,
  onSelect,
}: {
  view: DashboardView;
  colors: Map<string, string>;
  onSelect?: (name: string) => void;
}) {
  const max = view.projectTotals[0]?.activeMs ?? 1;
  if (view.projectTotals.length === 0)
    return <div className="empty">No activity in this range.</div>;

  return (
    <div>
      {view.projectTotals.map((p) => (
        <div
          key={p.name}
          className={onSelect ? "hoverable-row" : undefined}
          onClick={onSelect ? () => onSelect(p.name) : undefined}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onKeyDown={
            onSelect
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(p.name);
                }
              : undefined
          }
          title={onSelect ? `View ${p.name} only` : undefined}
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr 70px",
            alignItems: "center",
            gap: 10,
            padding: "5px 0",
            cursor: onSelect ? "pointer" : undefined,
            borderRadius: 6,
          }}
        >
          <span
            style={{
              color: "var(--text-secondary)",
              fontSize: 12.5,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={p.name}
          >
            <span
              className="proj-key"
              style={{ background: colors.get(p.name) ?? OTHER_VAR }}
            />
            {p.name}
          </span>
          <div style={{ position: "relative", height: 16 }}>
            <div
              style={{
                position: "absolute",
                insetBlock: 1,
                left: 0,
                width: `${Math.max(0.8, (p.activeMs / max) * 100)}%`,
                background: colors.get(p.name) ?? OTHER_VAR,
                borderRadius: "0 4px 4px 0", // rounded data-end, square baseline
              }}
            />
          </div>
          {/* value at the tip — text tokens, never the series color */}
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 650,
              color: "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
              textAlign: "right",
            }}
          >
            {fmtDuration(p.activeMs)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sessions table                                                      */
/* ------------------------------------------------------------------ */

const RATING_HEX = {
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
} as const;

/** Compact token counts: 1234567 → "1.2M", 45200 → "45K". */
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return String(n);
}

/** 🟢/🟡/🔴 dot + score + type tag; the coaching note is on hover. */
function PromptBadge({ score }: { score?: SessionSummary["promptScore"] }) {
  if (!score)
    return <span style={{ color: "var(--text-muted)" }}>–</span>;
  return (
    <span
      title={`${score.type} · ${score.note}`}
      style={{ whiteSpace: "nowrap", cursor: "help" }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: RATING_HEX[score.rating],
          marginRight: 6,
          verticalAlign: "middle",
        }}
      />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{score.score}/5</span>
      <span
        style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 11 }}
      >
        {score.type}
      </span>
    </span>
  );
}

function SessionsTable({
  sessions,
  colors,
  onSelect,
  limit = 25,
}: {
  sessions: SessionSummary[];
  colors: Map<string, string>;
  onSelect?: (name: string) => void;
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? sessions : sessions.slice(0, limit);

  if (sessions.length === 0)
    return <div className="empty">No sessions in this range.</div>;

  return (
    <div className="scroll-x">
      <table className="data">
        <thead>
          <tr>
            <th>Started</th>
            <th>Project</th>
            <th>Prompt</th>
            <th>First → last activity</th>
            <th className="num">Active time</th>
            <th className="num">Wall clock</th>
            <th className="num">Blocks</th>
            <th className="num">You / Claude</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.file}>
              <td>
                {new Date(s.firstEvent).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </td>
              <td>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span
                    className="proj-key"
                    style={{
                      background: colors.get(s.projectName) ?? OTHER_VAR,
                    }}
                  />
                  {onSelect ? (
                    <button
                      className="link-btn"
                      onClick={() => onSelect(s.projectName)}
                      title={`View ${s.projectName} only`}
                    >
                      {s.projectName}
                    </button>
                  ) : (
                    s.projectName
                  )}
                </div>
                {s.title ? (
                  <div
                    title={s.title}
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 11.5,
                      marginTop: 2,
                      maxWidth: 240,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.title}
                  </div>
                ) : null}
              </td>
              <td>
                <PromptBadge score={s.promptScore} />
              </td>
              <td className="num">
                {fmtTime(s.firstEvent)} → {fmtTime(s.lastEvent)}
              </td>
              <td className="num strong">{fmtDuration(s.activeMs)}</td>
              <td className="num">{fmtDuration(s.spanMs)}</td>
              <td className="num">{s.blocks.length}</td>
              <td className="num">
                {s.userMessages} / {s.assistantMessages}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sessions.length > limit ? (
        <button
          className="view-toggle"
          style={{ marginTop: 10 }}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show fewer" : `Show all ${sessions.length} sessions`}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Week calendar                                                       */
/* ------------------------------------------------------------------ */

const CAL_ROW_H = 30; // px per hour
const DAY_MS = 86400000;

/** Local-midnight epoch for the day containing `ms`. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local-midnight epoch for the Sunday of the week containing `ms`. */
function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function fmtHourLabel(h: number): string {
  const hh = h % 24;
  const ap = hh < 12 ? "a" : "p";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${ap}`;
}

interface CalBlock {
  session: SessionSummary;
  projectName: string;
  activeMs: number;
  note?: string;
  ptype?: string;
  start: number; // epoch ms (clamped to the day)
  startH: number; // hours since that day's midnight (0..24)
  endH: number;
  lane: number;
}

/**
 * A week grid of the idle-split WORK BLOCKS (the actual active periods), placed
 * by the time they ran and colored by project — not the full session spans.
 */
const CAL_COLLAPSED_H = 400;

function WeekCalendar({
  sessions,
  colors,
  nowMs,
  onOpenSession,
}: {
  sessions: SessionSummary[];
  colors: Map<string, string>;
  nowMs: number;
  onOpenSession: (s: SessionSummary) => void;
}) {
  const [mode, setMode] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(() => startOfDay(nowMs));
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dayCount = mode === "week" ? 7 : 1;
  const firstDay = mode === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => firstDay + i * DAY_MS),
    [firstDay, dayCount]
  );

  // Explode sessions into work blocks, clamp each to the day, lane-pack overlaps.
  const perDay = useMemo(
    () =>
      days.map((dayStart) => {
        const dayEnd = dayStart + DAY_MS;
        const blocks: CalBlock[] = [];
        for (const s of sessions) {
          for (const wb of s.blocks) {
            if (wb.end < dayStart || wb.start >= dayEnd) continue;
            const cs = Math.max(wb.start, dayStart);
            const ce = Math.min(wb.end, dayEnd);
            blocks.push({
              session: s,
              projectName: s.projectName,
              activeMs: wb.durationMs,
              note: s.promptScore?.note,
              ptype: s.promptScore?.type,
              start: cs,
              startH: (cs - dayStart) / 3600000,
              endH: (ce - dayStart) / 3600000,
              lane: 0,
            });
          }
        }
        blocks.sort((a, b) => a.startH - b.startH);
        const laneEnd: number[] = [];
        for (const b of blocks) {
          let lane = laneEnd.findIndex((e) => e <= b.startH);
          if (lane === -1) {
            lane = laneEnd.length;
            laneEnd.push(b.endH);
          } else laneEnd[lane] = b.endH;
          b.lane = lane;
        }
        return { blocks, lanes: Math.max(1, laneEnd.length) };
      }),
    [days, sessions]
  );

  // Vertical range: clamp to the hours that actually have activity.
  let hMin = 24;
  let hMax = 0;
  for (const d of perDay)
    for (const b of d.blocks) {
      hMin = Math.min(hMin, b.startH);
      hMax = Math.max(hMax, b.endH);
    }
  if (hMin > hMax) {
    hMin = 8;
    hMax = 18;
  }
  hMin = Math.floor(hMin);
  hMax = Math.ceil(hMax);
  if (hMax - hMin < 4) hMax = hMin + 4;
  const hours = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);
  const H = (hMax - hMin) * CAL_ROW_H;

  const rangeLabel =
    mode === "week"
      ? new Date(firstDay).toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " – " +
        new Date(firstDay + 6 * DAY_MS).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : new Date(firstDay).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

  const atNow =
    mode === "week"
      ? startOfWeek(anchor) === startOfWeek(nowMs)
      : startOfDay(anchor) === startOfDay(nowMs);

  // When collapsed, center the active hours in the 400px window.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || expanded) return;
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  }, [expanded, firstDay, mode, H]);

  const headCell: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "var(--surface-1)",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="seg" role="group" aria-label="Calendar view">
            <button aria-pressed={mode === "week"} onClick={() => setMode("week")}>
              Week
            </button>
            <button aria-pressed={mode === "day"} onClick={() => setMode("day")}>
              Day
            </button>
          </div>
          <button className="view-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "⤡ Collapse" : "⤢ Expand"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!atNow ? (
            <button
              className="view-toggle"
              onClick={() => setAnchor(startOfDay(nowMs))}
            >
              {mode === "week" ? "This week" : "Today"}
            </button>
          ) : null}
          <button
            className="view-toggle"
            aria-label="Previous"
            onClick={() => setAnchor((a) => a - dayCount * DAY_MS)}
          >
            ‹
          </button>
          <span className="meta" style={{ minWidth: 120, textAlign: "center" }}>
            {rangeLabel}
          </span>
          <button
            className="view-toggle"
            aria-label="Next"
            onClick={() => setAnchor((a) => a + dayCount * DAY_MS)}
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scroll-x"
        style={{
          maxHeight: expanded ? undefined : CAL_COLLAPSED_H,
          overflowY: expanded ? "visible" : "auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `38px repeat(${dayCount}, minmax(78px, 1fr))`,
            minWidth: mode === "week" ? 620 : 220,
          }}
        >
          {/* header row (sticky while the body scrolls) */}
          <div style={headCell} />
          {days.map((d) => (
            <div
              key={d}
              style={{
                ...headCell,
                textAlign: "center",
                fontSize: 11.5,
                color: "var(--text-muted)",
                padding: "2px 0 6px",
              }}
            >
              {new Date(d).toLocaleDateString("en-US", { weekday: "short" })}{" "}
              {new Date(d).getDate()}
            </div>
          ))}

          {/* hour labels */}
          <div style={{ position: "relative", height: H }}>
            {hours.slice(0, -1).map((h) => (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: (h - hMin) * CAL_ROW_H - 5,
                  right: 6,
                  fontSize: 10,
                  color: "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtHourLabel(h)}
              </div>
            ))}
          </div>

          {/* day columns */}
          {perDay.map(({ blocks, lanes }, di) => (
            <div
              key={di}
              style={{
                position: "relative",
                height: H,
                borderLeft: "1px solid var(--grid)",
              }}
            >
              {hours.slice(0, -1).map((h) => (
                <div
                  key={h}
                  style={{
                    position: "absolute",
                    top: (h - hMin) * CAL_ROW_H,
                    left: 0,
                    right: 0,
                    borderTop: "1px solid var(--grid)",
                  }}
                />
              ))}
              {blocks.map((b, bi) => {
                const col = colors.get(b.projectName) ?? OTHER_VAR;
                const top = (b.startH - hMin) * CAL_ROW_H;
                const height = Math.max(14, (b.endH - b.startH) * CAL_ROW_H);
                const w = 100 / lanes;
                return (
                  <div
                    key={bi}
                    onClick={() => onOpenSession(b.session)}
                    title={
                      (b.session.title ? `${b.session.title}\n` : "") +
                      `${b.projectName} · ${fmtTime(b.start)}\n` +
                      `${fmtDuration(b.activeMs)} active — click for details` +
                      (b.note ? `\n${b.ptype}: ${b.note}` : "")
                    }
                    style={{
                      position: "absolute",
                      top,
                      height,
                      left: `calc(${b.lane * w}% + 1px)`,
                      width: `calc(${w}% - 2px)`,
                      background: `color-mix(in srgb, ${col} 18%, transparent)`,
                      borderLeft: `3px solid ${col}`,
                      borderRadius: 4,
                      padding: "1px 5px",
                      overflow: "hidden",
                      cursor: "pointer",
                      fontSize: 10.5,
                      lineHeight: 1.2,
                      color: "var(--text-secondary)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {b.projectName}
                    </div>
                    {height > 28 ? <div>{fmtDuration(b.activeMs)}</div> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Session detail modal                                                */
/* ------------------------------------------------------------------ */

function SessionModal({
  session,
  colors,
  onClose,
  onFocusProject,
}: {
  session: SessionSummary;
  colors: Map<string, string>;
  onClose: () => void;
  onFocusProject: (name: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: [string, React.ReactNode][] = [
    [
      "Date",
      new Date(session.firstEvent).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    ],
    ["Time", `${fmtTime(session.firstEvent)} – ${fmtTime(session.lastEvent)}`],
    ["Active time", fmtDuration(session.activeMs)],
    ["Wall clock", fmtDuration(session.spanMs)],
    ["Work blocks", String(session.blocks.length)],
    [
      "Messages",
      `${session.userMessages} you / ${session.assistantMessages} Claude`,
    ],
  ];
  if (session.gitBranch) rows.push(["Git branch", session.gitBranch]);
  if (session.version) rows.push(["Claude version", session.version]);
  if (session.entrypoint) {
    const client =
      session.entrypoint === "claude-desktop"
        ? "Desktop app"
        : session.entrypoint === "cli"
          ? "CLI"
          : session.entrypoint;
    rows.push(["Client", client]);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="proj-key"
            style={{ background: colors.get(session.projectName) ?? OTHER_VAR }}
          />
          <h3 style={{ margin: 0, fontSize: "1.05rem", flex: 1 }}>
            {session.projectName}
          </h3>
          <button className="view-toggle" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {session.title ? (
          <div
            style={{
              color: "var(--text-secondary)",
              fontSize: 13,
              marginTop: 5,
            }}
          >
            {session.title}
          </div>
        ) : null}

        {session.promptScore ? (
          <div style={{ margin: "10px 0 14px" }}>
            <PromptBadge score={session.promptScore} />
            <div
              style={{
                color: "var(--text-secondary)",
                fontSize: 12.5,
                marginTop: 5,
              }}
            >
              {session.promptScore.note}
            </div>
          </div>
        ) : (
          <div style={{ height: 10 }} />
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            rowGap: 7,
            columnGap: 16,
            fontSize: 13,
          }}
        >
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <div style={{ color: "var(--text-muted)" }}>{k}</div>
              <div
                style={{
                  color: "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {v}
              </div>
            </React.Fragment>
          ))}
        </div>

        {session.tokens ? (
          <div style={{ marginTop: 16 }}>
            <div className="modal-section-label">Tokens</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                rowGap: 6,
                columnGap: 16,
                fontSize: 13,
              }}
            >
              <div style={{ color: "var(--text-muted)" }}>Generated</div>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtCompact(session.tokens.output)}
              </div>
              <div style={{ color: "var(--text-muted)" }}>New input</div>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtCompact(session.tokens.input)}
              </div>
              <div style={{ color: "var(--text-muted)" }}>Cached context</div>
              <div style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtCompact(session.tokens.cacheRead)}
              </div>
            </div>
          </div>
        ) : null}

        {session.tools ? (
          <div style={{ marginTop: 16 }}>
            <div className="modal-section-label">Activity</div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "flex",
                flexWrap: "wrap",
                gap: "3px 14px",
              }}
            >
              <span>{session.tools.read} reads</span>
              <span>{session.tools.edit} edits</span>
              {session.tools.write ? <span>{session.tools.write} writes</span> : null}
              <span>{session.tools.bash} bash</span>
              <span>{session.tools.search} searches</span>
              {session.tools.webSearch ? (
                <span>{session.tools.webSearch} web</span>
              ) : null}
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <strong style={{ color: "var(--text-primary)" }}>
                Canon references: {session.tools.canonRead}
              </strong>
              {session.tools.canonRework ? (
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  · {session.tools.canonRework} consulted mid-build
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <button
            className="view-toggle"
            onClick={() => onFocusProject(session.projectName)}
          >
            Focus {session.projectName} →
          </button>
          <span style={{ flex: 1 }} />
          <span
            style={{ fontSize: 11, color: "var(--text-muted)" }}
            title={session.projectPath}
          >
            {session.sessionId.slice(0, 8)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardProps {
  report: TrackerReport;
  /** "live" shows the idle-threshold control (re-fetches); "static" hides it. */
  mode: "live" | "static";
  idleMinutes: number;
  onIdleChange?: (minutes: number) => void;
  /** Reduce opacity while a refetch is in flight (no skeleton flash). */
  refreshing?: boolean;
}

export default function Dashboard({
  report,
  mode,
  idleMinutes,
  onIdleChange,
  refreshing,
}: DashboardProps) {
  const [preset, setPreset] = useState("30d");
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [modalSession, setModalSession] = useState<SessionSummary | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  const colors = useMemo(() => assignColors(report), [report]);
  // When scoped to one project, it is the only series (keeps its stable color).
  const series = useMemo(
    () => (selectedProject ? [selectedProject] : seriesProjects(report)),
    [report, selectedProject]
  );

  const presetDays =
    RANGE_PRESETS.find((p) => p.key === preset)?.days ?? null;
  const view = useMemo(
    () => computeView(report, presetDays, report.generatedAt, selectedProject),
    [report, presetDays, selectedProject]
  );

  // All sessions (calendar has its own week window, independent of the range).
  const allSessions = useMemo(
    () => report.projects.flatMap((p) => p.sessions),
    [report]
  );

  // Prompt-health summary for the sessions in view.
  const promptCounts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0, scored: 0 };
    for (const s of view.sessions) {
      if (s.promptScore) {
        c[s.promptScore.rating]++;
        c.scored++;
      }
    }
    return c;
  }, [view.sessions]);

  return (
    <div
      className="wrap viz-root"
      style={refreshing ? { opacity: 0.55, transition: "opacity .2s" } : undefined}
    >
      <div className="masthead">
        <h1>Claude Code Time Tracker</h1>
        <span className="sub">
          {report.sessionCount} sessions · {report.projectCount} projects ·
          idle cutoff {Math.round(report.idleThresholdMs / 60000)}m
        </span>
      </div>

      {selectedProject ? (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            margin: "2px 0 14px",
          }}
        >
          <button className="link-btn" onClick={() => setSelectedProject(null)}>
            ← All projects
          </button>
          <span className="sub">
            Viewing <strong>{selectedProject}</strong> · {view.sessionCount}{" "}
            sessions · {fmtDuration(view.totalActiveMs)} active
          </span>
        </div>
      ) : null}

      {/* one filter row, above everything it scopes */}
      <div className="filters">
        <div className="seg" role="group" aria-label="Date range">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              aria-pressed={preset === p.key}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {mode === "live" ? (
          <>
            <label htmlFor="idle">Idle cutoff</label>
            <select
              id="idle"
              value={idleMinutes}
              onChange={(e) => onIdleChange?.(Number(e.target.value))}
            >
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </>
        ) : null}
        <span className="spacer" />
        <button
          className="theme-toggle"
          onClick={() =>
            setTheme((t) =>
              t === "auto" ? "dark" : t === "dark" ? "light" : "auto"
            )
          }
        >
          Theme: {theme}
        </button>
      </div>

      <div className="kpis">
        <StatTile
          label="Active time"
          value={fmtDuration(view.totalActiveMs)}
          hint={
            RANGE_PRESETS.find((p) => p.key === preset)?.label ?? "All time"
          }
        />
        <StatTile
          label="Sessions"
          value={String(view.sessionCount)}
          hint={`across ${view.projectTotals.length} project${
            view.projectTotals.length === 1 ? "" : "s"
          }`}
        />
        <StatTile
          label="Active days"
          value={String(view.activeDayCount)}
          hint="days with tracked work"
        />
        <StatTile
          label="Avg per active day"
          value={fmtDuration(view.avgPerActiveDayMs)}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Active time per day</h2>
          <span className="meta" style={{ marginRight: 64 }}>
            {`gaps over ${Math.round(
              report.idleThresholdMs / 60000
            )} minutes don't count`}
          </span>
        </div>
        <DailyChart view={view} series={series} colors={colors} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Session calendar</h2>
          <span className="meta">when you actually worked · hover a block</span>
        </div>
        <WeekCalendar
          sessions={
            selectedProject
              ? allSessions.filter((s) => s.projectName === selectedProject)
              : allSessions
          }
          colors={colors}
          nowMs={report.generatedAt}
          onOpenSession={setModalSession}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Time by project</h2>
          {!selectedProject ? (
            <span className="meta">click a project to focus</span>
          ) : null}
        </div>
        <ProjectBars
          view={view}
          colors={colors}
          onSelect={selectedProject ? undefined : setSelectedProject}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Sessions</h2>
          <span className="meta">
            {promptCounts.scored > 0
              ? `🟢 ${promptCounts.green} · 🟡 ${promptCounts.yellow} · 🔴 ${promptCounts.red} · `
              : ""}
            most recent first
          </span>
        </div>
        <SessionsTable
          sessions={view.sessions}
          colors={colors}
          onSelect={selectedProject ? undefined : setSelectedProject}
        />
      </div>

      <footer className="credits">
        Generated {new Date(report.generatedAt).toLocaleString()} from{" "}
        {mode === "live" ? report.claudeDir : "a snapshot of session logs"} ·{" "}
        <a
          href="https://github.com/"
          target="_blank"
          rel="noreferrer"
        >
          claude-code-time-tracker
        </a>{" "}
        — open source, MIT.
      </footer>

      {modalSession ? (
        <SessionModal
          session={modalSession}
          colors={colors}
          onClose={() => setModalSession(null)}
          onFocusProject={(name) => {
            setSelectedProject(name);
            setModalSession(null);
          }}
        />
      ) : null}
    </div>
  );
}
