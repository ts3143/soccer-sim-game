/**
 * Finances and Facilities for the user's club (SPEC §6, §11): the season's books, cash over
 * the seasons, the FFP gauge, the fees/wages control, the four budget dials and the
 * ticket price (set in preseason, locked after the first home match; Auto = the AI's).
 */
import { useState } from "react";
import type { ClubFinancesView } from "../../common/api";
import { SeasonLineChart } from "../components/charts";
import { formatDate, formatEuros, formatPercent } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ClubFinances() {
  const { shell } = useShell();
  const { data: view, error } = useView("club-finances", () =>
    toWorker("getClubFinances", shell.lid),
  );
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  return (
    <>
      <PageHeader title="Finances & Facilities" />
      <Overview view={view} />
      <div className="row g-3">
        <div className="col-xl-6">
          <Dials view={view} />
        </div>
        <div className="col-xl-6">
          <Tickets view={view} />
          <Budgets view={view} />
        </div>
      </div>
    </>
  );
}

function Overview({ view }: { view: ClubFinancesView }) {
  const status = { ok: "text-bg-success", warned: "text-bg-warning", banned: "text-bg-danger" }[
    view.ffp.status
  ];
  const share = Math.min(1, view.ffp.ratio / 1);
  return (
    <div className="row g-3 mb-3">
      <div className="col-lg-7">
        <section className="card h-100">
          <div className="card-body small" data-testid="books">
            <div className="d-flex flex-wrap gap-4 mb-2">
              <div>
                <div className="text-body-secondary">Cash</div>
                <div className={`h5 mb-0 ${view.cash < 0 ? "text-danger" : ""}`}>
                  {formatEuros(view.cash)}
                </div>
              </div>
              <div>
                <div className="text-body-secondary">This season's profit so far</div>
                <div className={`h5 mb-0 ${view.profit < 0 ? "text-danger" : "text-success"}`}>
                  {formatEuros(view.profit)}
                </div>
              </div>
            </div>
            <div className="row">
              <div className="col-sm-6">
                <h2 className="h6 mt-2">Income this season</h2>
                <table className="table table-sm mb-0">
                  <tbody>
                    {view.revenue.map((r) => (
                      <tr key={r.kind}>
                        <td>{r.label}</td>
                        <td className="text-end">{formatEuros(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="col-sm-6">
                <h2 className="h6 mt-2">Spending this season</h2>
                <table className="table table-sm mb-0">
                  <tbody>
                    {view.expenses.map((r) => (
                      <tr key={r.kind}>
                        <td>{r.label}</td>
                        <td className="text-end">{formatEuros(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-body-secondary mt-1">
                  Fee amortisation booked (an FFP cost, not cash): {formatEuros(view.amortisation)}
                </div>
              </div>
            </div>
            <h2 className="h6 mt-3">Cash at the end of each season</h2>
            <SeasonLineChart
              points={view.cashHistory.map((c) => ({
                season: c.season,
                value: c.cash,
                current: c.current,
              }))}
              format={formatEuros}
              label="Hover a season for its cash; the open point is now."
            />
          </div>
        </section>
      </div>
      <div className="col-lg-5">
        <section className="card h-100" data-testid="ffp">
          <div className="card-body small">
            <h2 className="h6">
              Financial fair play <span className={`badge ${status}`}>{view.ffp.status}</span>
            </h2>
            <p className="mb-2">
              Squad cost (wages and fee amortisation) this season:{" "}
              <strong>{formatPercent(view.ffp.ratio, 0)}</strong> of revenue. The limit is{" "}
              {formatPercent(view.ffp.limit, 0)}, checked on 30 June.
            </p>
            <div
              className="position-relative mb-1"
              style={{ height: 12 }}
              aria-label={`Squad cost ${formatPercent(view.ffp.ratio, 0)} of revenue`}
            >
              <div className="progress" style={{ height: 12 }}>
                <div
                  className={`progress-bar ${view.ffp.ratio > view.ffp.limit ? "bg-danger" : view.ffp.ratio > view.ffp.limit - 0.05 ? "bg-warning" : "bg-success"}`}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
              <div
                className="position-absolute top-0 bottom-0 border-start border-2 border-dark"
                style={{ left: `${view.ffp.limit * 100}%` }}
                title="FFP limit"
              />
            </div>
            <div className="d-flex justify-content-between text-body-secondary mb-2">
              <span>0%</span>
              <span>limit {formatPercent(view.ffp.limit, 0)}</span>
              <span>100%</span>
            </div>
            {view.ffp.lastSeason !== null && (
              <p className="mb-1">Last season: {formatPercent(view.ffp.lastSeason, 0)}.</p>
            )}
            {view.ffp.bannedUntil && (
              <p className="text-danger mb-1">
                Transfer ban until {formatDate(view.ffp.bannedUntil)}.
              </p>
            )}
            <p className="text-body-secondary mb-0">
              Over the limit at the check: a warning first, then a one-window transfer ban.
              Facilities level {view.facilitiesLevel} (50 = average), following your Facilities dial
              slowly.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function useSave() {
  const { reload } = useShell();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (action: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
      setNote({ ok: true, text: ok });
      reload();
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const message = note && (
    <div
      className={`alert ${note.ok ? "alert-success" : "alert-danger"} py-1 small mt-2 mb-0`}
      data-testid="save-note"
    >
      {note.text}
    </div>
  );
  return { save, busy, message };
}

function Dials({ view }: { view: ClubFinancesView }) {
  const { shell } = useShell();
  const [levels, setLevels] = useState(
    Object.fromEntries(view.dials.map((d) => [d.key, d.level])) as Record<string, number>,
  );
  const { save, busy, message } = useSave();
  const { at0, at100 } = view.dialCostRange;
  const cost = (level: number) => at0 + ((at100 - at0) * level) / 100;
  const total = view.dials.reduce((sum, d) => sum + cost(levels[d.key] ?? d.level), 0);
  const changed = view.dials.some((d) => levels[d.key] !== d.level);
  return (
    <section className="card" data-testid="dials">
      <div className="card-body small">
        <h2 className="h6">Budget dials</h2>
        <p className="text-body-secondary">
          Spending levels from 0 to 100. Costs change at once; what a dial does depends on how it
          compares with other clubs, measured each preseason (50 = average).
        </p>
        {view.dials.map((d) => {
          const level = levels[d.key] ?? d.level;
          return (
            <div key={d.key} className="mb-3">
              <div className="d-flex justify-content-between">
                <label htmlFor={`dial-${d.key}`} className="fw-semibold">
                  {d.label} {level}
                </label>
                <span>{formatEuros(cost(level))} a season</span>
              </div>
              <input
                id={`dial-${d.key}`}
                type="range"
                className="form-range"
                min={0}
                max={100}
                step={1}
                value={level}
                onChange={(e) => setLevels({ ...levels, [d.key]: Number(e.target.value) })}
              />
              <div className="text-body-secondary">
                {d.what} Effect now {d.effect}.
              </div>
            </div>
          );
        })}
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !changed}
            onClick={() =>
              void save(
                () =>
                  toWorker("setBudgetDials", shell.lid, {
                    coaching: levels.coaching ?? 50,
                    youth: levels.youth ?? 50,
                    medical: levels.medical ?? 50,
                    facilities: levels.facilities ?? 50,
                  }),
                "Dials saved.",
              )
            }
            data-testid="save-dials"
          >
            Save dials
          </button>
          <span className="text-body-secondary">
            All four: {formatEuros(total)} a season ({formatPercent(total / view.budget.base, 0)} of
            revenue)
          </span>
        </div>
        {message}
      </div>
    </section>
  );
}

function Tickets({ view }: { view: ClubFinancesView }) {
  const { shell } = useShell();
  const t = view.ticket;
  const [auto, setAuto] = useState(t.auto);
  const [price, setPrice] = useState(String(t.price));
  const { save, busy, message } = useSave();
  return (
    <section className="card mb-3" data-testid="tickets">
      <div className="card-body small">
        <h2 className="h6">Ticket price</h2>
        <p className="text-body-secondary">
          One price for the season, set in preseason and fixed once your first home match is played.
          Dearer tickets mean smaller crowds unless the ground would be full anyway. Auto charges
          the fair price for your club ({formatEuros(t.fair)}).
        </p>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <div className="form-check form-switch mb-0">
            <input
              id="ticket-auto"
              className="form-check-input"
              type="checkbox"
              checked={auto}
              disabled={t.locked}
              onChange={(e) => setAuto(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="ticket-auto">
              Auto
            </label>
          </div>
          <div className="input-group input-group-sm w-auto">
            <span className="input-group-text">€</span>
            <input
              id="ticket-price"
              type="number"
              min={1}
              className="form-control"
              style={{ width: 90 }}
              aria-label="Ticket price"
              value={auto ? t.fair : price}
              disabled={auto || t.locked}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || t.locked}
            onClick={() =>
              void save(
                () =>
                  toWorker("setTicketPrice", shell.lid, auto ? null : Math.round(Number(price))),
                "Ticket price saved.",
              )
            }
            data-testid="save-ticket"
          >
            Set price
          </button>
          <span>
            Now {formatEuros(t.price)}
            {t.auto ? " (Auto)" : ""}
          </span>
        </div>
        {t.locked && (
          <p className="text-body-secondary" data-testid="ticket-locked">
            Set for this season: you can change it next preseason.
          </p>
        )}
        <table className="table table-sm mb-0" data-testid="ticket-curve">
          <thead>
            <tr>
              <th>Price</th>
              <th className="text-end">Crowd (of {t.capacity.toLocaleString("en-GB")})</th>
              <th className="text-end">Gate a match</th>
            </tr>
          </thead>
          <tbody>
            {t.curve.map((c) => (
              <tr key={c.price} className={c.price === t.price ? "fw-semibold" : ""}>
                <td>
                  {formatEuros(c.price)}
                  {c.price === t.fair ? " (fair)" : ""}
                </td>
                <td className="text-end">{c.attendance.toLocaleString("en-GB")}</td>
                <td className="text-end">{formatEuros(c.gate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-body-secondary mt-1">
          For a league match against an average side, at today's hype.
        </div>
        {message}
      </div>
    </section>
  );
}

function Budgets({ view }: { view: ClubFinancesView }) {
  const { shell } = useShell();
  const [share, setShare] = useState(Math.round(view.budget.wageShare * 100));
  const { save, busy, message } = useSave();
  return (
    <section className="card" data-testid="budgets">
      <div className="card-body small">
        <h2 className="h6">Transfer budget and wage room</h2>
        <p className="mb-2">
          Transfer budget <strong>{formatEuros(view.budget.transfer)}</strong> · wage room{" "}
          <strong>{formatEuros(view.budget.wageRoom)}</strong> a year.
        </p>
        <p className="text-body-secondary">
          Both come from your FFP headroom. Move it toward wages (more room for salaries) or toward
          fees (a bigger transfer budget).
        </p>
        <label htmlFor="wage-share" className="d-flex justify-content-between fw-semibold">
          <span>Fees {100 - share}%</span>
          <span>Wages {share}%</span>
        </label>
        <input
          id="wage-share"
          type="range"
          className="form-range"
          min={0}
          max={100}
          step={5}
          value={share}
          onChange={(e) => setShare(Number(e.target.value))}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || share === Math.round(view.budget.wageShare * 100)}
          onClick={() =>
            void save(
              () => toWorker("setClubWageShare", shell.lid, share / 100),
              "Budget split saved.",
            )
          }
          data-testid="save-split"
        >
          Apply
        </button>
        {message}
      </div>
    </section>
  );
}
