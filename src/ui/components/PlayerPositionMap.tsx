import type { Position } from "../../common/config/ratings";
import { Pitch } from "./Pitch";
import { POSITION_SPOTS, positionFit } from "./pitchLayout";

const FIT_LABELS = {
  best: "Best",
  comfortable: "Comfortable (within 3 OVR)",
  cover: "Cover (4–8 OVR below best)",
  lower: "Less suited (9+ below best)",
};
export function PlayerPositionMap({ ovrs }: { ovrs: { position: Position; ovr: number }[] }) {
  const best = Math.max(0, ...ovrs.map((p) => p.ovr));
  return (
    <section className="player-position-map mt-3" aria-label="Position suitability">
      <div className="d-flex justify-content-between align-items-baseline mb-2">
        <h2 className="h6 mb-0">Positions · OVR</h2>
        <span className="small text-body-secondary">Attacking ↑</span>
      </div>
      <Pitch
        compact
        label="OVR at every position; colour shows suitability relative to this player's best OVR"
        testId="position-pitch"
      >
        {POSITION_SPOTS.map((s) => {
          const ovr = ovrs.find((p) => p.position === s.position)?.ovr;
          if (ovr === undefined) return null;
          const fit = positionFit(ovr, best);
          return (
            <div
              key={`${s.position}-${s.side}`}
              className={`pitch-position fit-${fit}`}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              data-position={s.position}
              data-side={s.side}
              data-ovr={ovr}
              aria-label={`${s.label}: ${ovr} OVR, ${FIT_LABELS[fit]}`}
              title={`${s.label}: ${ovr} OVR · ${FIT_LABELS[fit]}`}
            >
              <span>{s.label}</span>
              <strong>{ovr}</strong>
            </div>
          );
        })}
      </Pitch>
      <div className="position-fit-legend mt-2">
        {Object.entries(FIT_LABELS).map(([fit, label]) => (
          <span key={fit} className={`fit-${fit}`} title={label}>
            {label.split(" (")[0]}
          </span>
        ))}
      </div>
      <p className="small text-body-secondary mt-2 mb-0">
        Colour reflects OVR relative to his best position. Left/right share a base rating; Tactics
        includes foot fit.
      </p>
    </section>
  );
}
