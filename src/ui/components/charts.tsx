/**
 * In-house SVG charts (T, 2026-10-19: no chart library): the player-profile radar, the
 * OVR/POT history and a club's cash over the seasons. One hue; OVR solid, POT dashed, so
 * identity never rests on colour alone.
 */
import { useState, type MouseEvent } from "react";
import { formatDate } from "../format";

const BLUE = "#2a78d6";
const GRID = "#e7e6e2";
const INK = "#52514e";

/** Radar over named axes, values 0–100 (SPEC §11: 8 grouped axes from the config). */
export function RadarChart({ axes }: { axes: { axis: string; value: number }[] }) {
  const size = 300;
  const c = size / 2;
  const r = 100;
  const n = axes.length;
  const point = (i: number, v: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [c + (r * v * Math.cos(angle)) / 100, c + (r * v * Math.sin(angle)) / 100] as const;
  };
  const ring = (v: number) => axes.map((_, i) => point(i, v).join(",")).join(" ");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size }}
      role="img"
      aria-label={`Ratings radar: ${axes.map((a) => `${a.axis} ${a.value}`).join(", ")}`}
      data-testid="radar"
    >
      {[20, 40, 60, 80, 100].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke={GRID} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke={GRID} />;
      })}
      <polygon
        points={axes.map((a, i) => point(i, a.value).join(",")).join(" ")}
        fill={BLUE}
        fillOpacity={0.18}
        stroke={BLUE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {axes.map((a, i) => {
        const [x, y] = point(i, a.value);
        return (
          <circle key={a.axis} cx={x} cy={y} r={4} fill={BLUE} stroke="#fff" strokeWidth={2} />
        );
      })}
      {axes.map((a, i) => {
        const [x, y] = point(i, 122);
        const anchor = Math.abs(x - c) < 4 ? "middle" : x > c ? "start" : "end";
        return (
          <text
            key={a.axis}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={11}
            fill={INK}
          >
            {a.axis} <tspan fontWeight={600}>{a.value}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

/** OVR and POT at each development update, over time. */
export function RatingHistoryChart({
  points,
}: {
  points: { date: string; ovr: number; pot: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const height = 220;
  const pad = { left: 34, right: 12, top: 14, bottom: 26 };
  if (points.length === 0) return null;
  const times = points.map((p) => Date.parse(p.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times, t0 + 1);
  const values = points.flatMap((p) => [p.ovr, p.pot]);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 4) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 4) / 10) * 10);
  const x = (t: number) => pad.left + ((t - t0) / (t1 - t0)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * (height - pad.top - pad.bottom);
  const line = (key: "ovr" | "pot") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(times[i] ?? 0)},${y(p[key])}`).join(" ");
  const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);
  const years = [...new Set(points.map((p) => p.date.slice(0, 4)))];
  const move = (e: MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    let best = 0;
    times.forEach((t, i) => {
      if (Math.abs(x(t) - px) < Math.abs(x(times[best] ?? 0) - px)) best = i;
    });
    setHover(best);
  };
  const h = hover === null ? null : points[hover];
  return (
    <div>
      <div className="d-flex gap-3 small mb-1" style={{ color: INK }}>
        <span>
          <svg width={22} height={8}>
            <line x1={0} y1={4} x2={22} y2={4} stroke={BLUE} strokeWidth={2} />
          </svg>{" "}
          OVR
        </span>
        <span>
          <svg width={22} height={8}>
            <line
              x1={0}
              y1={4}
              x2={22}
              y2={4}
              stroke={BLUE}
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          </svg>{" "}
          POT
        </span>
        {h && (
          <span className="ms-auto" data-testid="history-hover">
            {formatDate(h.date)}: OVR <strong>{h.ovr}</strong>, POT <strong>{h.pot}</strong>
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label="OVR and POT over time"
        data-testid="history-chart"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text
              x={pad.left - 6}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill={INK}
            >
              {v}
            </text>
          </g>
        ))}
        {years.map((year) => {
          const t = Date.parse(`${year}-01-01`);
          if (t < t0 || t > t1) return null;
          return (
            <text key={year} x={x(t)} y={height - 8} textAnchor="middle" fontSize={11} fill={INK}>
              {year}
            </text>
          );
        })}
        <path d={line("pot")} fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" />
        <path d={line("ovr")} fill="none" stroke={BLUE} strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(times[i] ?? 0)}
            cy={y(p.ovr)}
            r={hover === i ? 5 : 3}
            fill={BLUE}
            stroke="#fff"
            strokeWidth={1.5}
          />
        ))}
        {h && hover !== null && (
          <line
            x1={x(times[hover] ?? 0)}
            x2={x(times[hover] ?? 0)}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke={INK}
            strokeDasharray="2 3"
          />
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={width - pad.left - pad.right}
          height={height - pad.top - pad.bottom}
          fill="transparent"
          onMouseMove={move}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
    </div>
  );
}

/** One value per season (cash): a line with points, the zero line marked; hover for values. */
export function SeasonLineChart({
  points,
  format,
  label,
}: {
  points: { season: number; value: number; current: boolean }[];
  format: (v: number) => string;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const height = 200;
  const pad = { left: 64, right: 16, top: 14, bottom: 26 };
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values) || 1;
  const span = hi - lo || 1;
  const x = (i: number) =>
    points.length === 1
      ? (pad.left + width - pad.right) / 2
      : pad.left + (i / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + ((hi - v) / span) * (height - pad.top - pad.bottom);
  const ticks = [lo, lo + span / 2, hi];
  const h = hover === null ? null : points[hover];
  const season = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;
  return (
    <div>
      <div
        className="small mb-1"
        style={{ minHeight: 20, color: INK }}
        data-testid="season-chart-hover"
      >
        {h ? (
          <>
            {season(h.season)}
            {h.current ? " (now)" : ""}: <strong>{format(h.value)}</strong>
          </>
        ) : (
          label
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text
              x={pad.left - 6}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill={INK}
            >
              {format(v)}
            </text>
          </g>
        ))}
        {lo < 0 && <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke={INK} />}
        <path
          d={points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke={BLUE}
          strokeWidth={2}
        />
        {points.map((p, i) => (
          <g key={p.season}>
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={hover === i ? 6 : 4}
              fill={p.current ? "#fff" : BLUE}
              stroke={BLUE}
              strokeWidth={2}
            />
            <text x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={INK}>
              {season(p.season)}
            </text>
            <rect
              x={x(i) - 20}
              y={pad.top}
              width={40}
              height={height - pad.top - pad.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
