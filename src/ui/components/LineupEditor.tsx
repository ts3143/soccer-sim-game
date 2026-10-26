import { FormationPitch } from "./FormationPitch";
import { InjuryTag } from "./InjuryTag";
import { PlayerStatusTags } from "./PlayerStatusTags";
import { SkillTags } from "./SkillTags";
/**
 * The line-up editor, shared by the Tactics page, the pre-match screen of a live match and
 * its pause screen (the live tactics board).
 */
import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type {
  LiveBoardView,
  TacticsMode,
  TacticsPlayerView,
  TacticsSetup,
  TacticsView,
} from "../../common/api";
import { formationsConfig } from "../../common/config/formations";
import type { Position } from "../../common/config/ratings";
import { addDays } from "../../common/dates";
import { PlayerRatings, RatingChange, NationalityFlag } from "./PlayerDetails";
import { PlayerLink } from "./links";
import { errorText } from "../errors";
import { moveFit, samePlace, type Fit, type Place } from "./lineupFit";

const MVP_FORMATIONS = formationsConfig.formations.filter((f) => f.mvp).map((f) => f.id);

/** Swaps the players at two places; a reserve dropped in takes the place, the other drops out. */
function swap(setup: TacticsSetup, a: Place, b: Place, benchSize: number): TacticsSetup {
  if (a.area === "reserve" && b.area === "reserve") return setup;
  const slots = [...setup.slots];
  const bench = Array.from({ length: benchSize }, (_, i) => setup.bench[i] ?? null);
  const get = (p: Place): number | null => {
    if (p.area === "reserve") return p.pid;
    return (p.area === "slot" ? slots[p.index] : bench[p.index]) ?? null;
  };
  const set = (p: Place, pid: number | null) => {
    if (p.area === "slot") slots[p.index] = pid;
    else if (p.area === "bench") bench[p.index] = pid;
  };
  const [pa, pb] = [get(a), get(b)];
  set(a, pb);
  set(b, pa);
  return { ...setup, slots, bench: bench.filter((pid): pid is number => pid !== null) };
}

/** Takes the player at a place out of the XI or off the bench. */
function remove(setup: TacticsSetup, at: Place): TacticsSetup {
  if (at.area === "slot")
    return { ...setup, slots: setup.slots.map((pid, i) => (i === at.index ? null : pid)) };
  if (at.area === "bench") return { ...setup, bench: setup.bench.filter((_, i) => i !== at.index) };
  return setup;
}

function conditionClass(c: number) {
  return c < 75 ? "text-danger" : c < 90 ? "text-warning-emphasis" : "";
}

function energyClass(e: number) {
  return e < 50 ? "text-danger" : e < 70 ? "text-warning-emphasis" : "";
}

/** The live tactics board (a paused match) carries each player's match so far. */
const isLiveBoard = (view: TacticsView): view is LiveBoardView => "match" in view;

/** The save button's wording and test id. */
export interface SaveText {
  label: (setup: TacticsSetup) => string;
  done: string;
  pending: string;
  testId: string;
}

const TACTICS_SAVE: SaveText = {
  label: () => "Save",
  done: "Saved. Every match starts from it, watched or simulated.",
  pending: "Unsaved changes",
  testId: "save-tactics",
};

export interface LineupEditorProps {
  initial: TacticsView;
  /** Shows a change: a preview (Tactics page) or applied at once (before a live match). */
  apply: (setup: TacticsSetup, mode: TacticsMode) => Promise<TacticsView>;
  /** Saves the line-up (Tactics page). Without it, each change applies as it is made. */
  save?: (setup: TacticsSetup) => Promise<TacticsView>;
  note: string;
  /** The Auto button's tooltip; without it there's no Auto button (a paused live match). */
  autoTitle?: string;
  /** What the ratings' bracketed changes compare with. */
  baselineLabel: string;
  /** The save button's wording (the Tactics page's "Save" by default). */
  saveText?: SaveText;
  /** More buttons after the save button (the live pause screen's Resume). */
  actions?: (dirty: boolean) => ReactNode;
  /** Called with each view the worker shows (before a live match: can it kick off?). */
  onView?: (view: TacticsView) => void;
}

/**
 * The line-up editor (SPEC §11 Tactics): the formation, the XI by slot, the bench and the
 * sliders, with slot OVRs and live team ratings. Drag a player onto another place to swap
 * them, or click one and then the other. On the live tactics board (a LiveBoardView) it
 * shows energy and each player's match so far instead of condition and the season, and
 * no reserves: only the bench can come on.
 */
export function LineupEditor({
  initial,
  apply,
  save: saveSetup,
  note,
  autoTitle,
  baselineLabel,
  saveText = TACTICS_SAVE,
  actions,
  onView,
}: LineupEditorProps) {
  const [view, setView] = useState(initial);
  // The line-up as edited: it changes at once; the worker's view (slot OVRs, ratings,
  // warnings) follows a moment later.
  const [setup, setSetup] = useState(initial.setup);
  const [baseline, setBaseline] = useState(initial);
  const [picked, setPicked] = useState<Place | null>(null);
  // The player being dragged: like a picked one, the places where he fits light up.
  const [dragging, setDragging] = useState<Place | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);
  // The line-up last shown by the worker: a change it refuses goes back to it.
  const shownSetup = useRef(initial.setup);
  const edit = view.editable;
  const live = isLiveBoard(view) ? view : null;
  const dirty = JSON.stringify(setup) !== JSON.stringify(baseline.setup);

  const preview = async (next: TacticsSetup, mode: TacticsMode = "asIs") => {
    const n = ++request.current;
    setSetup(next);
    setMessage(null);
    try {
      const shown = await apply(next, mode);
      if (n !== request.current) return;
      shownSetup.current = shown.setup;
      setView(shown);
      setSetup(shown.setup);
      onView?.(shown);
    } catch (e) {
      if (n !== request.current) return;
      setSetup(shownSetup.current);
      setMessage({ ok: false, text: errorText(e) });
    }
  };
  const save = async () => {
    if (!saveSetup) return;
    setSaving(true);
    try {
      const next = await saveSetup(setup);
      shownSetup.current = next.setup;
      setView(next);
      setSetup(next.setup);
      setBaseline(next);
      setMessage({ ok: true, text: saveText.done });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
    } finally {
      setSaving(false);
    }
  };
  const moveTo = (to: Place, from: Place | null = picked) => {
    setPicked(null);
    if (!from || samePlace(from, to)) return;
    void preview(swap(setup, from, to, view.benchSize));
  };
  const takeOut = (from: Place | null = picked) => {
    setPicked(null);
    if (from && from.area !== "reserve") void preview(remove(setup, from));
  };

  /** Drag-and-drop and click-to-swap handlers for one place in the tables. */
  const handlers = (place: Place, filled: boolean) =>
    edit
      ? {
          draggable: filled,
          tabIndex: 0,
          role: "button",
          "aria-pressed": picked !== null && samePlace(picked, place),
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData("text/plain", JSON.stringify(place));
            e.dataTransfer.effectAllowed = "move";
            // After the browser has taken its drag image, so the image isn't highlighted.
            setTimeout(() => setDragging(place), 0);
          },
          // Also deferred, so it always lands after the deferred start.
          onDragEnd: () => setTimeout(() => setDragging(null), 0),
          onDragOver: (e: DragEvent) => e.preventDefault(),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDragging(null);
            moveTo(place, JSON.parse(e.dataTransfer.getData("text/plain")) as Place);
          },
          onClick: () => (picked ? moveTo(place) : filled && setPicked(place)),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            if (picked) moveTo(place);
            else if (filled) setPicked(place);
          },
        }
      : {};
  /** Where the dragged or picked player fits (T, 2026-10-21): natural, cover, or plain. */
  const active = dragging ?? picked;
  const fitAt = (place: Place): Fit =>
    edit && active ? moveFit(view, active, place, live !== null) : null;
  const rowClass = (place: Place) => {
    if (picked && samePlace(picked, place)) return "table-primary";
    const fit = fitAt(place);
    return [edit ? "tactics-row" : "", fit ? `fit-${fit}` : ""].join(" ").trim();
  };

  const playerCells = (p: TacticsPlayerView, slot: Position | null): ReactNode => {
    const m = live?.match[p.pid];
    return (
      <>
        <td className="text-nowrap">
          <PlayerLink pid={p.pid} name={p.name} />
          {m?.booked && (
            <span className="badge text-bg-warning ms-1" title="Booked">
              Y
            </span>
          )}
          {m?.injured && (
            <InjuryTag
              injury={{ type: "Match injury", until: addDays(p.today, m.injuryDays) }}
              today={p.today}
            />
          )}
          <SkillTags ratings={p.ratings} position={p.position} />
          <PlayerRatings player={p} slot={slot ?? undefined} />
          <PlayerStatusTags player={p} today={p.today} />
        </td>
        <td>{p.position}</td>
        {slot && (
          <td
            className={`text-end fw-semibold ${p.slotOvr < p.ovr - 3 ? "text-danger" : ""}`}
            title="OVR in this slot"
          >
            {p.slotOvr}
          </td>
        )}
        <td className="text-end text-nowrap">
          {p.ovr}
          <RatingChange value={p.ovrChange} />
        </td>
        <td className="text-end text-nowrap">
          {p.pot}
          <RatingChange value={p.potChange} />
        </td>
        {m ? (
          <td className={`text-end ${energyClass(m.energy)}`} data-testid="board-energy">
            {m.energy}%
          </td>
        ) : (
          <td className={`text-end ${conditionClass(p.condition)}`}>{p.condition}%</td>
        )}
        <td className="text-end">{p.age}</td>
        <td>
          <NationalityFlag nationality={p.nationality} />
        </td>
        {m ? (
          <>
            <td className="text-end">{m.minutes}</td>
            <td className="text-end">{m.goals}</td>
            <td className="text-end">{m.assists}</td>
            <td className="text-end fw-semibold" data-testid="rating-so-far">
              {m.rating?.toFixed(1) ?? "—"}
            </td>
          </>
        ) : (
          <>
            <td className="text-end">{p.season.appearances}</td>
            <td className="text-end">{p.season.minutes}</td>
            <td className="text-end">{p.season.goals}</td>
            <td className="text-end">{p.season.assists}</td>
            <td className="text-end">{p.season.rating?.toFixed(2) ?? "—"}</td>
          </>
        )}
      </>
    );
  };
  const head = (first: string, slot: boolean) => (
    <thead>
      <tr>
        <th>{first}</th>
        <th>Name</th>
        <th>Pos</th>
        {slot && (
          <th className="text-end" title="OVR in this slot (wrong foot counted)">
            Slot
          </th>
        )}
        <th className="text-end">OVR</th>
        <th className="text-end">POT</th>
        {live ? (
          <th className="text-end" title="Energy now">
            Energy
          </th>
        ) : (
          <th className="text-end">Cond</th>
        )}
        <th className="text-end">Age</th>
        <th title="Nationality">Nat</th>
        {!live && (
          <th title="Season appearances" className="text-end">
            Apps
          </th>
        )}
        <th className="text-end" title={live ? "Minutes in this match" : "Season minutes"}>
          Min
        </th>
        <th title="Goals" className="text-end">
          G
        </th>
        <th title="Assists" className="text-end">
          A
        </th>
        <th
          title={
            live
              ? "Match rating so far: what he'd get if the rest of his match were average"
              : "Average match rating"
          }
          className="text-end"
        >
          Rating
        </th>
      </tr>
    </thead>
  );
  /** Empty cells after the first column: the live board has no Apps column. */
  const emptyCells = (slot: boolean) => (
    <td colSpan={(slot ? 13 : 12) - (live ? 1 : 0)} className="text-body-tertiary fst-italic">
      empty
    </td>
  );

  return (
    <>
      <p className="small text-body-secondary">{note}</p>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <label className="small" htmlFor="formation">
          Formation
        </label>
        <select
          id="formation"
          className="form-select form-select-sm w-auto"
          value={setup.formation}
          disabled={!edit}
          onChange={(e) => void preview({ ...setup, formation: e.target.value }, "reslot")}
        >
          {MVP_FORMATIONS.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
        {edit && (
          <>
            {autoTitle && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => void preview(setup, "auto")}
                title={autoTitle}
              >
                Auto
              </button>
            )}
            {saveSetup ? (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={!dirty}
                  onClick={() => void preview(baseline.setup)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!dirty || saving}
                  onClick={() => void save()}
                  data-testid={saveText.testId}
                >
                  {saveText.label(setup)}
                </button>
                {actions?.(dirty)}
                {dirty ? (
                  <span className="small text-warning-emphasis">{saveText.pending}</span>
                ) : (
                  !view.saved && (
                    <span className="small text-body-secondary">
                      No line-up saved yet: this is the AI's pick.
                    </span>
                  )
                )}
              </>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => void preview(setup, "saved")}
                data-testid="use-saved"
              >
                My saved line-up
              </button>
            )}
          </>
        )}
      </div>
      {message && (
        <div
          className={`alert ${message.ok ? "alert-success" : "alert-danger"} py-2 small`}
          data-testid="tactics-message"
        >
          {message.text}
        </div>
      )}
      <div className="row g-3">
        <div className="col-xl-8">
          <FormationPitch
            view={view}
            selectedSlot={picked?.area === "slot" ? picked.index : undefined}
            slotProps={(index, filled) => handlers({ area: "slot", index }, filled)}
            fitAt={(index) => fitAt({ area: "slot", index })}
            match={live?.match}
          />
          <h2 className="h6">Starting XI</h2>
          <div className="table-responsive">
            <table
              className="table table-striped table-hover table-sm small align-middle"
              data-testid="tactics-xi"
            >
              {head("Slot", true)}
              <tbody>
                {view.slots.map((s, i) => {
                  const place: Place = { area: "slot", index: i };
                  return (
                    <tr
                      key={i}
                      className={rowClass(place)}
                      data-fit={fitAt(place) ?? undefined}
                      {...handlers(place, s.player !== null)}
                    >
                      <td className="fw-semibold">{s.label}</td>
                      {s.player ? playerCells(s.player, s.position) : emptyCells(true)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h2 className="h6">Bench</h2>
          <div className="table-responsive">
            <table
              className="table table-striped table-hover table-sm small align-middle"
              data-testid="tactics-bench"
            >
              {head("#", false)}
              <tbody>
                {Array.from({ length: view.benchSize }, (_, i) => {
                  const p = view.bench[i];
                  const place: Place = { area: "bench", index: i };
                  return (
                    <tr
                      key={i}
                      className={rowClass(place)}
                      data-fit={fitAt(place) ?? undefined}
                      {...handlers(place, p !== undefined)}
                    >
                      <td className="text-body-secondary">{i + 1}</td>
                      {p ? playerCells(p, null) : emptyCells(false)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!live && (
            <>
              <h2 className="h6">Not in the squad</h2>
              {edit && (
                <div
                  className="border border-dashed rounded small text-body-secondary px-2 py-1 mb-2"
                  data-testid="take-out"
                  role="button"
                  tabIndex={0}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(null);
                    takeOut(JSON.parse(e.dataTransfer.getData("text/plain")) as Place);
                  }}
                  onClick={() => takeOut()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      takeOut();
                    }
                  }}
                >
                  Drop a player here (or pick one, then click here) to leave him out.
                </div>
              )}
              <div className="table-responsive">
                <table
                  className="table table-striped table-hover table-sm small align-middle"
                  data-testid="tactics-reserves"
                >
                  {head("", false)}
                  <tbody>
                    {view.reserves.map((p) => {
                      const place: Place = { area: "reserve", pid: p.pid };
                      return (
                        <tr
                          key={p.pid}
                          className={rowClass(place)}
                          data-fit={fitAt(place) ?? undefined}
                          {...handlers(place, true)}
                        >
                          <td />
                          {playerCells(p, null)}
                        </tr>
                      );
                    })}
                    {view.unavailable?.map((p) => (
                      <tr
                        key={p.pid}
                        className="tactics-unavailable"
                        title="Can't play in this match"
                        data-testid="unavailable"
                      >
                        <td />
                        {playerCells(p, null)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="col-xl-4">
          <section className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Sliders</h2>
              {formationsConfig.sliders.map((s) => {
                const value = setup.sliders[s.key];
                return (
                  <div key={s.key} className="mb-3">
                    <label
                      htmlFor={`slider-${s.key}`}
                      className="form-label small fw-semibold text-capitalize mb-0"
                    >
                      {s.key}{" "}
                      <span className="fw-normal text-body-secondary">
                        ({value > 0 ? `+${value}` : value})
                      </span>
                    </label>
                    <input
                      id={`slider-${s.key}`}
                      type="range"
                      className="form-range"
                      min={-2}
                      max={2}
                      step={1}
                      value={value}
                      disabled={!edit}
                      onChange={(e) =>
                        void preview({
                          ...setup,
                          sliders: { ...setup.sliders, [s.key]: Number(e.target.value) },
                        })
                      }
                    />
                    <div className="d-flex justify-content-between small text-body-secondary">
                      <span>{s.low}</span>
                      <span>{s.high}</span>
                    </div>
                    <div className="small text-body-secondary">{s.effect}</div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Team ratings</h2>
              <p className="small text-body-secondary mb-2">
                {live
                  ? "As things stand, energy counted, on the player OVR scale"
                  : "At today's condition, on the player OVR scale"}
                {dirty ? `; the change since ${baselineLabel} in brackets` : ""}.
              </p>
              <table className="table table-sm small mb-0" data-testid="team-ratings">
                <tbody>
                  {view.ratings.map((r) => {
                    const before = baseline.ratings.find((b) => b.key === r.key)?.value ?? r.value;
                    const delta = Math.round((r.value - before) * 10) / 10;
                    return (
                      <tr key={r.key}>
                        <td className="text-nowrap">{r.label}</td>
                        <td className="w-100 align-middle">
                          <div className="progress" style={{ height: 6 }} aria-hidden="true">
                            <div
                              className="progress-bar"
                              style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }}
                            />
                          </div>
                        </td>
                        <td className="text-end fw-semibold">{r.value.toFixed(1)}</td>
                        <td
                          className={`text-end text-nowrap ${delta > 0 ? "text-success" : delta < 0 ? "text-danger" : ""}`}
                        >
                          {delta !== 0 ? `(${delta > 0 ? "+" : ""}${delta.toFixed(1)})` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {view.warnings.length > 0 && (
            <section className="card border-warning" data-testid="tactics-warnings">
              <div className="card-body small">
                <h2 className="h6">{live ? "Check before you resume" : "Check before you play"}</h2>
                <ul className="mb-0 ps-3">
                  {view.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
