import type { HTMLAttributes } from "react";
import type { TacticsView } from "../../common/api";
import { formationById } from "../../common/config/formations";
import type { Fit } from "./lineupFit";
import { Pitch } from "./Pitch";
import { formationCoordinates } from "./pitchLayout";

export function FormationPitch({
  view,
  selectedSlot,
  slotProps,
  fitAt,
}: {
  view: TacticsView;
  selectedSlot?: number;
  slotProps?: (index: number, filled: boolean) => HTMLAttributes<HTMLDivElement>;
  /** How well the player being moved suits each slot (highlighted). */
  fitAt?: (index: number) => Fit;
}) {
  const coordinates = formationCoordinates(formationById(view.setup.formation));
  return (
    <section className="formation-panel mb-3" aria-label="Formation on the pitch">
      <div className="d-flex justify-content-between align-items-baseline mb-2">
        <h2 className="h6 mb-0">Formation · {view.setup.formation}</h2>
        <span className="small text-body-secondary">Attacking ↑</span>
      </div>
      <Pitch
        label={`${view.setup.formation} starting lineup, attacking upwards`}
        testId="formation-pitch"
      >
        {view.slots.map((s, i) => {
          const p = s.player;
          const c = coordinates[i]!;
          const fit = fitAt?.(i) ?? null;
          const nameParts = p?.name.trim().split(/\s+/) ?? [];
          const displayName =
            nameParts.length > 1 ? `${nameParts[0]![0]}. ${nameParts.slice(1).join(" ")}` : p?.name;
          return (
            <div
              key={i}
              {...slotProps?.(i, p !== null)}
              className={`pitch-player ${selectedSlot === i ? "pitch-player-selected" : ""} ${!p ? "pitch-player-empty" : ""} ${p?.injury || p?.suspension ? "pitch-player-unavailable" : ""} ${fit ? `pitch-player-fit-${fit}` : ""}`}
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
              data-slot={i}
              data-fit={fit ?? undefined}
              data-pid={p?.pid}
              aria-label={`${s.label}: ${p ? `${p.name}, slot OVR ${p.slotOvr}, condition ${p.condition}%${p.injury ? ", injured" : ""}${p.suspension ? ", suspended" : ""}` : "Empty slot"}`}
              title={
                p
                  ? `${p.name} · ${p.position} · slot OVR ${p.slotOvr} · condition ${p.condition}%`
                  : `${s.label}: Empty slot`
              }
            >
              <span className="pitch-slot-label">{s.label}</span>
              <strong className="pitch-player-name">{displayName ?? "Empty"}</strong>
              <span className="pitch-player-summary">
                {p ? (
                  <>
                    <b>{p.slotOvr}</b> OVR · {p.condition}%
                    {p.injury ? " · injured" : p.suspension ? " · suspended" : ""}
                  </>
                ) : (
                  "Choose a player"
                )}
              </span>
            </div>
          );
        })}
      </Pitch>
      <p className="small text-body-secondary mt-2 mb-0">
        {view.editable
          ? "Drag between pitch slots and table rows, or select a player or slot and then another to swap. Ratings include fit for the slot. While you move a player, green marks where he fits: darker for a natural position, lighter where he can cover."
          : "Starting XI and ratings in each slot. See the table below for player details."}
      </p>
    </section>
  );
}
