/**
 * A club's squad and draft picks with a tick box each (the Trade page and the Trading
 * Block, SPEC §17.8), and how a pick reads. A player his club can't trade has no box.
 */
import type { DraftPickRow, TradeAssets, TradeSideView } from "../../common/api";
import { draftName, formatEuros } from "../format";
import { PlayerLink } from "./links";

export type PickKey = TradeAssets["picks"][number];

/** The key a pick row is traded by (its slot's club: the holder's own unless traded in). */
export const pickRef = (row: DraftPickRow, holder: number): PickKey => ({
  season: row.season,
  round: row.round,
  originalCid: row.from?.cid ?? holder,
});

const samePick = (a: PickKey, b: PickKey) =>
  a.season === b.season && a.round === b.round && a.originalCid === b.originalCid;

export const hasPick = (assets: TradeAssets, ref: PickKey) =>
  assets.picks.some((p) => samePick(p, ref));

/** Adds or removes a player or pick. */
export function toggled(
  assets: TradeAssets,
  item: { pid: number } | { pick: PickKey },
): TradeAssets {
  if ("pid" in item) {
    return {
      ...assets,
      pids: assets.pids.includes(item.pid)
        ? assets.pids.filter((p) => p !== item.pid)
        : [...assets.pids, item.pid],
    };
  }
  return {
    ...assets,
    picks: hasPick(assets, item.pick)
      ? assets.picks.filter((p) => !samePick(p, item.pick))
      : [...assets.picks, item.pick],
  };
}

/** "2027 draft, round 1: pick 12" (or ~12 projected), with the slot's club when traded in. */
export function pickText(row: DraftPickRow): string {
  const number =
    row.pick !== null
      ? `: pick ${row.pick}`
      : row.projected
        ? `: ~${row.projected.pick}${row.projected.lottery ? " (lottery)" : ""}`
        : "";
  return `${draftName(row.season)}, round ${row.round}${number}${row.from ? ` (${row.from.abbr}'s)` : ""}`;
}

export function TradeAssetsTable({
  side,
  selected,
  onToggle,
  disabled,
  testId,
}: {
  side: TradeSideView;
  selected: TradeAssets;
  onToggle: (item: { pid: number } | { pick: PickKey }) => void;
  disabled: boolean;
  testId: string;
}) {
  const holder = side.club.cid;
  return (
    <div data-testid={testId}>
      <div className="table-responsive">
        <table className="table table-sm table-hover small mb-2">
          <thead>
            <tr>
              <th aria-label="Trade" />
              <th>Name</th>
              <th>Pos</th>
              <th className="text-end">Age</th>
              <th className="text-end">OVR</th>
              <th className="text-end">POT</th>
              <th className="text-end">Wage</th>
              <th className="text-end">Until</th>
            </tr>
          </thead>
          <tbody>
            {side.players.map((p) => {
              const on = selected.pids.includes(p.pid);
              return (
                <tr key={p.pid} className={on ? "table-active" : ""} data-pid={p.pid}>
                  <td>
                    {p.untradable ? (
                      <span className="text-body-secondary" title={`Can't trade ${p.untradable}`}>
                        ✕
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        className="form-check-input"
                        aria-label={`Trade ${p.name}`}
                        checked={on}
                        disabled={disabled}
                        onChange={() => onToggle({ pid: p.pid })}
                      />
                    )}
                  </td>
                  <td className="text-nowrap">
                    <PlayerLink pid={p.pid} name={p.name} nationality={p.nationality} />
                    {p.injured && <span className="badge text-bg-danger ms-1">Inj</span>}
                  </td>
                  <td>{p.position}</td>
                  <td className="text-end">{p.age}</td>
                  <td className="text-end">{p.ovr}</td>
                  <td className="text-end">{p.pot}</td>
                  <td className="text-end">{formatEuros(p.wage)}</td>
                  <td className="text-end">{p.expires.slice(0, 4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="small">
        <div className="fw-semibold mb-1">Draft picks</div>
        {side.picks.length === 0 && <div className="text-body-secondary">No picks.</div>}
        {side.picks.map((row) => {
          const ref = pickRef(row, holder);
          const id = `${testId}-pick-${ref.season}-${ref.round}-${ref.originalCid}`;
          return (
            <div key={id} className="form-check">
              <input
                id={id}
                type="checkbox"
                className="form-check-input"
                checked={hasPick(selected, ref)}
                disabled={disabled}
                onChange={() => onToggle({ pick: ref })}
              />
              <label className="form-check-label" htmlFor={id}>
                {pickText(row)}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
