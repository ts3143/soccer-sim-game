/**
 * Senior players per OVR value: one series, so one hue and no legend (the title names
 * it). Faint guides mark the OVR band thresholds; each column has a hover tooltip, and
 * the same numbers are available as a table below the chart.
 */
import { useState } from "react";

interface Props {
  counts: { ovr: number; count: number }[];
  /** Band thresholds to mark, e.g. [45, 55, 65, 75, 85]. */
  thresholds: number[];
}

const WIDTH = 880;
const HEIGHT = 220;
const MARGIN = { top: 22, right: 8, bottom: 26, left: 36 };
const GAP = 2;
const RADIUS = 4;

/** Column path with a rounded top and a square base on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(value: number): number {
  const step = value > 100 ? 25 : value > 40 ? 10 : 5;
  return Math.ceil(value / step) * step;
}

export function OvrHistogram({ counts, thresholds }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (counts.length === 0) return null;

  const minOvr = Math.min(...counts.map((c) => c.ovr), ...thresholds) - 1;
  const maxOvr = Math.max(...counts.map((c) => c.ovr)) + 1;
  const yMax = niceMax(Math.max(...counts.map((c) => c.count)));
  const plotW = WIDTH - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotW / (maxOvr - minOvr + 1);
  const barW = Math.min(24, band - GAP);
  const xOf = (ovr: number) => MARGIN.left + (ovr - minOvr) * band + (band - barW) / 2;
  const yOf = (count: number) => MARGIN.top + plotH - (count / yMax) * plotH;
  const yTicks = [0, yMax / 2, yMax];
  const hovered = counts.find((c) => c.ovr === hover);

  return (
    <figure className="ovr-histogram mb-0">
      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          style={{ minWidth: 560, display: "block" }}
          role="img"
          aria-label="Senior players per OVR value"
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yOf(tick)}
                y2={yOf(tick)}
                stroke="var(--viz-grid)"
              />
              <text x={MARGIN.left - 6} y={yOf(tick) + 4} textAnchor="end" className="viz-axis">
                {tick}
              </text>
            </g>
          ))}
          {thresholds.map((t) => (
            <g key={t}>
              <line
                x1={xOf(t) - GAP / 2 - (band - barW) / 2}
                x2={xOf(t) - GAP / 2 - (band - barW) / 2}
                y1={MARGIN.top - 8}
                y2={MARGIN.top + plotH}
                stroke="var(--viz-guide)"
                strokeDasharray="3 3"
              />
              <text x={xOf(t) - (band - barW) / 2 + 3} y={MARGIN.top - 10} className="viz-axis">
                {t}+
              </text>
            </g>
          ))}
          {counts.map(({ ovr, count }) => (
            <path
              key={ovr}
              d={columnPath(xOf(ovr), yOf(count), barW, yOf(0) - yOf(count))}
              fill="var(--viz-series-1)"
              opacity={hover === null || hover === ovr ? 1 : 0.55}
            />
          ))}
          {counts.map(({ ovr }) => (
            <rect
              key={`hit-${ovr}`}
              x={xOf(ovr) - (band - barW) / 2}
              y={MARGIN.top}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(ovr)}
            />
          ))}
          {counts
            .filter(({ ovr }) => ovr % 5 === 0)
            .map(({ ovr }) => (
              <text
                key={`x-${ovr}`}
                x={xOf(ovr) + barW / 2}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="viz-axis"
              >
                {ovr}
              </text>
            ))}
          {hovered && (
            <g pointerEvents="none">
              <rect
                x={Math.min(Math.max(xOf(hovered.ovr) + barW / 2 - 70, 2), WIDTH - 142)}
                y={Math.max(yOf(hovered.count) - 38, 2)}
                width={140}
                height={30}
                rx={4}
                fill="var(--viz-tooltip-bg)"
              />
              <text
                x={Math.min(Math.max(xOf(hovered.ovr) + barW / 2, 72), WIDTH - 72)}
                y={Math.max(yOf(hovered.count) - 18, 22)}
                textAnchor="middle"
                className="viz-tooltip"
              >
                OVR {hovered.ovr}: {hovered.count} players
              </text>
            </g>
          )}
        </svg>
      </div>
      <figcaption className="small text-body-secondary mt-1">
        Senior players at clubs, by OVR. Dashed lines mark the OVR bands.
      </figcaption>
      <details className="mt-2">
        <summary className="small">Show as a table</summary>
        <div className="table-responsive">
          <table className="table table-sm small w-auto mt-2">
            <thead>
              <tr>
                <th>OVR</th>
                {counts.map((c) => (
                  <th key={c.ovr} className="text-end fw-normal">
                    {c.ovr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Players</th>
                {counts.map((c) => (
                  <td key={c.ovr} className="text-end">
                    {c.count}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
