import { SkillTags } from "./SkillTags";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Position } from "../../common/config/ratings";
import { daysBetween } from "../../common/dates";
import { formatDate } from "../format";
import { ratingColumns } from "../ratingsLayout";

const COUNTRIES: Record<string, string> = {
  FRA: "FR",
  ESP: "ES",
  BRA: "BR",
  POR: "PT",
  NED: "NL",
  BEL: "BE",
  GER: "DE",
  ARG: "AR",
  DEN: "DK",
  IRL: "IE",
  NOR: "NO",
  SWE: "SE",
  CIV: "CI",
  SEN: "SN",
  NGA: "NG",
  GHA: "GH",
  USA: "US",
  COL: "CO",
  URU: "UY",
  ITA: "IT",
  SUI: "CH",
  CRO: "HR",
  SRB: "RS",
  JPN: "JP",
  KOR: "KR",
  MAR: "MA",
  CMR: "CM",
  AUT: "AT",
  POL: "PL",
  JAM: "JM",
  AUS: "AU",
  ISL: "IS",
  CZE: "CZ",
  HUN: "HU",
  BIH: "BA",
  TUR: "TR",
  SVK: "SK",
};
const HOME: Record<string, string> = { ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls", NIR: "gb-nir" };
export function NationalityFlag({ nationality }: { nationality: string }) {
  const code = HOME[nationality] ?? COUNTRIES[nationality]?.toLowerCase();
  return code ? (
    <img
      className="nationality-flag"
      src={`/flags/${code}.svg`}
      width={22}
      height={16}
      alt={nationality}
      title={nationality}
    />
  ) : (
    <span title="Nationality">{nationality}</span>
  );
}

export function RatingChange({ value }: { value: number | null }) {
  return value === null ? null : (
    <span
      className={`rating-change ${value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-body-secondary"}`}
      title="Change since last season"
    >
      {" "}
      ({value > 0 ? "+" : ""}
      {value})
    </span>
  );
}

export function RatingValue({ value, children }: { value: number; children?: ReactNode }) {
  const hue = Math.max(0, Math.min(120, (value - 25) * 2.4));
  return (
    <span
      className="rating-value"
      style={{ backgroundColor: `hsl(${hue} 46% 88%)`, color: `hsl(${hue} 70% 21%)` }}
    >
      {children ?? value}
    </span>
  );
}

/**
 * The 22 ratings in FM-style columns (T, 2026-10-23). Rows that count most towards the OVR at
 * `position` are highlighted; only the number carries the red-to-green scale.
 */
export function RatingsGrid({
  ratings,
  position,
  changes,
  where,
}: {
  ratings: readonly number[];
  position: Position | null;
  /** Change per rating since last season, shown in a third column. */
  changes?: readonly (number | null)[];
  /** Why this position, when it isn't the player's own (e.g. "this slot"). */
  where?: string;
}) {
  return (
    <>
      <div className="ratings-grid">
        {ratingColumns(position).map((column, i) => (
          <div key={i}>
            {column.map((group) => (
              <section key={group.title} className="ratings-group">
                <h4 className="ratings-group-title">{group.title}</h4>
                <table className="ratings-table">
                  <tbody>
                    {group.rows.map((r) => {
                      const change = changes?.[r.index] ?? null;
                      return (
                        <tr
                          key={r.code}
                          className={r.importance ? `rating-${r.importance}` : undefined}
                        >
                          <td title={r.name}>
                            {r.label}
                            {r.importance && (
                              <span className="visually-hidden">
                                {" "}
                                ({r.importance} for {position})
                              </span>
                            )}
                          </td>
                          <td className="rating-number">
                            <RatingValue value={Math.round(ratings[r.index] ?? 0)} />
                          </td>
                          {changes && (
                            <td className="rating-delta">
                              {change ? (
                                <span className={change > 0 ? "text-success" : "text-danger"}>
                                  {change > 0 ? `+${change}` : change}
                                </span>
                              ) : null}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        ))}
      </div>
      {position && (
        <div className="ratings-legend">
          Highlighted for {position}
          {where ? ` (${where})` : ""}:
          <span>
            <span className="rating-swatch rating-key" />
            key
          </span>
          <span>
            <span className="rating-swatch rating-useful" />
            useful
          </span>
        </div>
      )}
    </>
  );
}

export function injuryTitle(injury: { type: string; until: string }, today: string) {
  const days = Math.max(0, daysBetween(today, injury.until));
  return `${injury.type}: ${days} day${days === 1 ? "" : "s"} remaining; back ${formatDate(injury.until)}`;
}

export function PlayerRatings({
  player: p,
  slot,
}: {
  player: {
    name: string;
    position: Position;
    age: number;
    ovr: number;
    pot: number;
    ovrChange: number | null;
    potChange: number | null;
    ratings: number[];
    season: { appearances: number; goals: number; assists: number; rating: number | null };
  };
  /** The position of the line-up slot he's in, which then decides the highlights. */
  slot?: Position;
}) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        type="button"
        className="player-summary-button"
        popoverTarget={id}
        aria-label={`Show ratings and stats for ${p.name}`}
        title="Ratings and season stats"
        draggable={false}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const box = e.currentTarget.getBoundingClientRect();
          const width = Math.min(480, window.innerWidth - 24);
          if (card.current) {
            card.current.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`;
            card.current.style.top = `${Math.max(12, Math.min(box.bottom + 8, window.innerHeight - 370))}px`;
          }
        }}
      >
        <svg width="15" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="1" y="9" width="3" height="6" rx=".5" />
          <rect x="6" y="5" width="3" height="10" rx=".5" />
          <rect x="11" y="1" width="3" height="14" rx=".5" />
        </svg>
      </button>
      {createPortal(
        <div
          ref={card}
          id={id}
          popover="auto"
          onToggle={(e) => {
            if (e.newState === "open") {
              const el = e.currentTarget;
              const box = el.getBoundingClientRect();
              el.style.top = `${Math.max(12, Math.min(box.top, window.innerHeight - box.height - 12))}px`;
            }
          }}
          className="player-summary-popover"
          role="dialog"
          aria-label={`${p.name} ratings and stats`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="d-flex justify-content-between align-items-start gap-2">
            <strong>
              {p.name}{" "}
              <span className="text-body-secondary fw-normal">
                {p.position} · {p.age} yo
              </span>
            </strong>
            <button
              className="btn-close"
              type="button"
              popoverTarget={id}
              popoverTargetAction="hide"
              aria-label="Close player summary"
            />
          </div>
          <div className="mt-2">
            <SkillTags ratings={p.ratings} position={p.position} />
          </div>
          <div className="d-flex flex-wrap align-items-center gap-3 mt-3 mb-2">
            <h3 className="h6 mb-0">Ratings</h3>
            <span>
              <RatingValue value={p.ovr}>OVR {p.ovr}</RatingValue>
              <RatingChange value={p.ovrChange} />
            </span>
            <span>
              <RatingValue value={p.pot}>POT {p.pot}</RatingValue>
              <RatingChange value={p.potChange} />
            </span>
          </div>
          <RatingsGrid
            ratings={p.ratings}
            position={slot ?? p.position}
            where={slot && slot !== p.position ? "this slot" : undefined}
          />
          <h3 className="h6 mt-3 mb-1">Season stats</h3>
          <div className="small">
            {p.season.appearances} apps · {p.season.goals} goals · {p.season.assists} assists ·{" "}
            {p.season.rating === null
              ? "No match rating yet"
              : `${p.season.rating.toFixed(2)} avg rating`}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
