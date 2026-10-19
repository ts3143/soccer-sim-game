/**
 * M4 Club lab (developer-only; the game screens replace it in M5/M6): every club's
 * finances, FFP and board, the user's budgets and squad, contract talks (renew, bid,
 * sign, loan), bids for his players, the season's transfer log and the inbox.
 */
import { useCallback, useEffect, useState } from "react";
import type { ClubLabView, ContractTalks, PlayerSearch, PlayerSearchRow } from "../../common/api";
import { POSITIONS } from "../../common/config/ratings";
import { crestUrl } from "../crests";
import { formatDate, formatEuros, formatPercent } from "../format";
import { onWorkerEvent, toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const STRATEGY: Record<string, string> = {
  contending: "Contending",
  developing: "Developing",
  selling: "Selling",
};
const FFP_BADGE: Record<string, string> = {
  ok: "text-bg-success",
  warned: "text-bg-warning",
  banned: "text-bg-danger",
};

function Talks({
  lid,
  talks,
  clubs,
  onDone,
  onError,
}: {
  lid: number;
  talks: ContractTalks;
  clubs: ClubLabView["clubs"];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [fee, setFee] = useState(String(Math.round(talks.value / 100_000) * 100_000));
  const [reply, setReply] = useState<string | null>(null);
  const [loanTo, setLoanTo] = useState<number>(clubs.find((c) => !c.user)?.cid ?? 0);
  const [length, setLength] = useState<"half" | "season">("season");
  const [share, setShare] = useState(0.5);
  const run = async (work: () => Promise<string>) => {
    try {
      onDone(await work());
    } catch (e) {
      onError(errorText(e));
    }
  };
  const sign = (years: number) =>
    run(async () => {
      if (talks.kind === "renewal") await toWorker("renewContract", lid, talks.pid, years);
      else await toWorker("signPlayer", lid, talks.pid, years);
      return `${talks.name}: ${talks.kind === "renewal" ? "renewed" : "signed"} for ${years} year(s).`;
    });
  const bid = () =>
    run(async () => {
      const r = await toWorker("bidForPlayer", lid, talks.pid, Number(fee));
      setReply(r.message);
      return r.message;
    });
  const loan = () =>
    run(async () => {
      const cid = talks.kind === "renewal" ? loanTo : (clubs.find((c) => c.user)?.cid ?? 0);
      const r = await toWorker("proposeLoan", lid, talks.pid, cid, length, share);
      return r.message;
    });
  const canSign = talks.kind !== "transfer" || talks.feeAgreed !== null;
  const moodText = Object.entries(talks.mood.components)
    .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`)
    .join(" · ");
  return (
    <section className="card mb-4 border-primary" data-testid="club-talks">
      <div className="card-body">
        <h3 className="h5">
          {talks.name}{" "}
          <span className="badge text-bg-secondary">
            {talks.kind === "renewal"
              ? "Renewal"
              : talks.kind === "transfer"
                ? "Transfer"
                : "Free agent"}
          </span>
        </h3>
        <p className="small mb-2">
          {talks.position} · {talks.age} · OVR {talks.ovr} / POT {talks.pot} ·{" "}
          {talks.club ?? "free agent"} · value {formatEuros(talks.value)}
          {talks.expires
            ? ` · ${formatEuros(talks.wage)} a year until ${formatDate(talks.expires)}`
            : ""}
        </p>
        <p className="small mb-2">
          Mood {talks.mood.value.toFixed(2)}{" "}
          {talks.mood.willing ? "" : <strong className="text-danger">(won't negotiate)</strong>}
          <br />
          <span className="text-body-secondary">{moodText}</span>
        </p>
        {talks.kind === "transfer" && (
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            {talks.feeAgreed !== null ? (
              <span className="badge text-bg-success">
                Fee agreed: {formatEuros(talks.feeAgreed)}
              </span>
            ) : (
              <>
                <label className="small" htmlFor="bid-fee">
                  Bid (€)
                </label>
                <input
                  id="bid-fee"
                  className="form-control form-control-sm"
                  style={{ width: "10em" }}
                  value={fee}
                  onChange={(e) => setFee(e.target.value.replace(/\D/g, ""))}
                />
                <button className="btn btn-sm btn-primary" onClick={() => void bid()}>
                  Bid
                </button>
              </>
            )}
            {reply && <span className="small">{reply}</span>}
          </div>
        )}
        <table className="table table-sm w-auto mb-3">
          <thead>
            <tr>
              <th>Length</th>
              <th className="text-end">Wage a year</th>
              <th>Until</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {talks.asks.map((a) => (
              <tr key={a.years}>
                <td>{a.years} yr</td>
                <td className="text-end">{formatEuros(a.wage)}</td>
                <td>{formatDate(a.expires)}</td>
                <td>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    disabled={!talks.windowOpen || !talks.mood.willing || !canSign}
                    onClick={() => void sign(a.years)}
                  >
                    {talks.kind === "renewal" ? "Renew" : "Sign"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {talks.kind !== "freeAgent" && (
          <div className="d-flex flex-wrap align-items-center gap-2 small">
            <span>{talks.kind === "renewal" ? "Loan out to" : "Loan in"}</span>
            {talks.kind === "renewal" && (
              <select
                className="form-select form-select-sm w-auto"
                value={loanTo}
                onChange={(e) => setLoanTo(Number(e.target.value))}
              >
                {clubs
                  .filter((c) => !c.user)
                  .map((c) => (
                    <option key={c.cid} value={c.cid}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
            <select
              className="form-select form-select-sm w-auto"
              value={length}
              onChange={(e) => setLength(e.target.value as "half" | "season")}
            >
              <option value="season">to the season's end</option>
              <option value="half">half a season</option>
            </select>
            <select
              className="form-select form-select-sm w-auto"
              value={share}
              onChange={(e) => setShare(Number(e.target.value))}
            >
              <option value={0}>loan club pays 0%</option>
              <option value={0.5}>loan club pays 50%</option>
              <option value={1}>loan club pays 100%</option>
            </select>
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={!talks.windowOpen}
              onClick={() => void loan()}
            >
              Propose loan
            </button>
          </div>
        )}
        {!talks.windowOpen && (
          <p className="small text-body-secondary mt-2 mb-0">
            The transfer window is closed: renewals, signings and loans wait for the next one.
          </p>
        )}
      </div>
    </section>
  );
}

export function ClubLab({ lid }: { lid: number }) {
  const [view, setView] = useState<ClubLabView | null>(null);
  const [talks, setTalks] = useState<ContractTalks | null>(null);
  const [search, setSearch] = useState<PlayerSearch>({ freeAgents: false, minOvr: 60, maxOvr: 75 });
  const [results, setResults] = useState<PlayerSearchRow[] | null>(null);
  const [league, setLeague] = useState<string>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    toWorker("getClubLab", lid)
      .then(setView)
      .catch((e: unknown) => setError(errorText(e)));
  }, [lid]);

  useEffect(() => {
    load();
    return onWorkerEvent("gameChanged", (event) => {
      if (event.lid === lid) load();
    });
  }, [lid, load]);

  /** Opens talks with a player (`refresh`: after an action, keeping its message). */
  const openTalks = (pid: number, refresh = false) => {
    if (!refresh) {
      setError(null);
      setNotice(null);
    }
    toWorker("getContractTalks", lid, pid)
      .then(setTalks)
      .catch((e: unknown) => setError(errorText(e)));
  };
  const runSearch = () => {
    toWorker("searchPlayers", lid, search)
      .then(setResults)
      .catch((e: unknown) => setError(errorText(e)));
  };
  const respond = async (oid: number, accept: boolean) => {
    setError(null);
    try {
      await toWorker("respondToOffer", lid, oid, accept);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const afterAction = (message: string) => {
    setNotice(message);
    setError(null);
    load();
    if (talks) openTalks(talks.pid, true);
    if (results) runSearch();
  };

  if (!view)
    return error ? <div className="alert alert-danger">{error}</div> : <p>Loading club…</p>;
  const b = view.user.budget;
  const leagues = [...new Set(view.clubs.map((c) => c.leagueId))];
  const rows = view.clubs.filter((c) => league === "all" || c.leagueId === league);

  return (
    <>
      <section className="card mb-4" data-testid="club-header">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <img src={crestUrl(view.user.code)} alt="" width={28} height={33} />
            <h3 className="h5 mb-0 me-2">{view.user.name}</h3>
            <span className="badge text-bg-secondary">{formatDate(view.date)}</span>
            <span className={`badge ${view.window ? "text-bg-success" : "text-bg-light"}`}>
              {view.window
                ? `${view.window.id} window until ${formatDate(view.window.closes)}`
                : "window closed"}
            </span>
            {b.warned && <span className="badge text-bg-warning">FFP warning</span>}
            {b.bannedUntil && (
              <span className="badge text-bg-danger">
                Transfer ban until {formatDate(b.bannedUntil)}
              </span>
            )}
          </div>
          <p className="mb-2" data-testid="club-budgets">
            Transfer budget <strong>{formatEuros(b.transfer)}</strong> · Wage room{" "}
            <strong>{formatEuros(b.wageRoom)}</strong> a year · Squad cost{" "}
            <strong>{formatPercent(b.squadCostRatio, 0)}</strong> of revenue (FFP limit{" "}
            {formatPercent(b.ffpLimit, 0)})
          </p>
          <div className="d-flex align-items-center gap-2 small">
            <label htmlFor="wage-share">Fees</label>
            <input
              id="wage-share"
              type="range"
              className="form-range"
              style={{ maxWidth: "16em" }}
              min={0}
              max={100}
              step={10}
              value={Math.round(view.user.wageShare * 100)}
              onChange={(e) =>
                void toWorker("setWageShare", lid, Number(e.target.value) / 100)
                  .then(setView)
                  .catch((err: unknown) => setError(errorText(err)))
              }
            />
            <label htmlFor="wage-share">Wages</label>
            <span className="text-body-secondary">
              ({Math.round(view.user.wageShare * 100)}% of FFP headroom kept for wages)
            </span>
          </div>
          {view.fired && (
            <div className="alert alert-warning mt-2 mb-0">
              You have been sacked: take a job in the Season lab first.
            </div>
          )}
        </div>
      </section>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && <div className="alert alert-info">{notice}</div>}
      {talks && (
        <Talks
          key={talks.pid}
          lid={lid}
          talks={talks}
          clubs={view.clubs}
          onDone={afterAction}
          onError={setError}
        />
      )}

      <section className="card mb-4" data-testid="club-offers">
        <div className="card-body">
          <h3 className="h5">Bids</h3>
          {view.offers.length === 0 ? (
            <p className="small text-body-secondary mb-0">No bids this season.</p>
          ) : (
            <table className="table table-sm mb-0">
              <tbody>
                {view.offers.map((o) => (
                  <tr key={o.oid}>
                    <td>{o.incoming ? "For" : "By you for"}</td>
                    <td>{o.name}</td>
                    <td>{o.incoming ? o.from : o.to}</td>
                    <td className="text-end">{formatEuros(o.fee)}</td>
                    <td>
                      <span className="badge text-bg-light">{o.status}</span>
                    </td>
                    <td>
                      {o.incoming && o.status === "open" && (
                        <span className="d-flex gap-1">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => void respond(o.oid, true)}
                          >
                            Accept
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => void respond(o.oid, false)}
                          >
                            Reject
                          </button>
                        </span>
                      )}
                      {!o.incoming && o.status === "accepted" && (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openTalks(o.pid)}
                        >
                          Personal terms
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="card mb-4" data-testid="club-squad">
        <div className="card-body">
          <h3 className="h5">Squad and contracts</h3>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Pos</th>
                  <th className="text-end">Age</th>
                  <th className="text-end">OVR</th>
                  <th className="text-end">POT</th>
                  <th className="text-end">Wage/yr</th>
                  <th>Until</th>
                  <th className="text-end">Value</th>
                  <th className="text-end">Mood</th>
                  <th className="text-end">Fee left</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {view.squad.map((p) => (
                  <tr key={p.pid} className={p.status === "academy" ? "text-body-secondary" : ""}>
                    <td>
                      {p.name}{" "}
                      {p.yearsLeft === 1 && p.status !== "academy" && (
                        <span className="badge text-bg-warning">expires</span>
                      )}{" "}
                      {p.loan && <span className="badge text-bg-info">loan {p.loan}</span>}
                      {p.status === "academy" && (
                        <span className="badge text-bg-light">academy</span>
                      )}
                    </td>
                    <td>{p.position}</td>
                    <td className="text-end">{p.age}</td>
                    <td className="text-end">{p.ovr}</td>
                    <td className="text-end">{p.pot}</td>
                    <td className="text-end">{p.wage ? formatEuros(p.wage) : ""}</td>
                    <td>{p.expires ? formatDate(p.expires) : ""}</td>
                    <td className="text-end">{formatEuros(p.value)}</td>
                    <td className={`text-end ${p.willing ? "" : "text-danger"}`}>
                      {p.status === "academy" ? "" : p.mood.toFixed(2)}
                    </td>
                    <td className="text-end">
                      {p.feeRemaining ? formatEuros(p.feeRemaining) : ""}
                    </td>
                    <td>
                      {p.status !== "academy" && (
                        <button
                          className="btn btn-sm btn-outline-secondary py-0"
                          onClick={() => openTalks(p.pid)}
                        >
                          Talks
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card mb-4" data-testid="club-market">
        <div className="card-body">
          <h3 className="h5">Market</h3>
          <div className="d-flex flex-wrap align-items-center gap-2 small mb-2">
            <select
              className="form-select form-select-sm w-auto"
              value={search.freeAgents ? "free" : "clubs"}
              onChange={(e) => setSearch({ ...search, freeAgents: e.target.value === "free" })}
            >
              <option value="clubs">At other clubs</option>
              <option value="free">Free agents</option>
            </select>
            <select
              className="form-select form-select-sm w-auto"
              value={search.position ?? ""}
              onChange={(e) => setSearch({ ...search, position: e.target.value || undefined })}
            >
              <option value="">Any position</option>
              {POSITIONS.map((pos) => (
                <option key={pos}>{pos}</option>
              ))}
            </select>
            <span>OVR</span>
            <input
              className="form-control form-control-sm"
              style={{ width: "4.5em" }}
              value={search.minOvr ?? 0}
              onChange={(e) => setSearch({ ...search, minOvr: Number(e.target.value) || 0 })}
            />
            <span>to</span>
            <input
              className="form-control form-control-sm"
              style={{ width: "4.5em" }}
              value={search.maxOvr ?? 99}
              onChange={(e) => setSearch({ ...search, maxOvr: Number(e.target.value) || 99 })}
            />
            <span>max age</span>
            <input
              className="form-control form-control-sm"
              style={{ width: "4.5em" }}
              value={search.maxAge ?? ""}
              onChange={(e) =>
                setSearch({
                  ...search,
                  maxAge: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
            <button className="btn btn-sm btn-primary" onClick={runSearch}>
              Search
            </button>
          </div>
          {results && (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Pos</th>
                    <th className="text-end">Age</th>
                    <th className="text-end">OVR</th>
                    <th className="text-end">POT</th>
                    <th>Club</th>
                    <th className="text-end">Value</th>
                    <th className="text-end">Wage/yr</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {results.map((p) => (
                    <tr key={p.pid}>
                      <td>{p.name}</td>
                      <td>{p.position}</td>
                      <td className="text-end">{p.age}</td>
                      <td className="text-end">{p.ovr}</td>
                      <td className="text-end">{p.pot}</td>
                      <td>{p.club ?? `free for ${p.daysFree ?? 0} days`}</td>
                      <td className="text-end">{formatEuros(p.value)}</td>
                      <td className="text-end">{p.wage ? formatEuros(p.wage) : ""}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-secondary py-0"
                          onClick={() => openTalks(p.pid)}
                        >
                          Talks
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="card mb-4" data-testid="club-finances">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-2">
            <h3 className="h5 mb-0">All clubs</h3>
            <select
              className="form-select form-select-sm w-auto"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
            >
              <option value="all">All leagues</option>
              {leagues.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </div>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0 small">
              <thead>
                <tr>
                  <th>Club</th>
                  <th className="text-end">Cash</th>
                  <th className="text-end">Budget base</th>
                  <th className="text-end">Revenue</th>
                  <th className="text-end">Expenses</th>
                  <th className="text-end">Wages/yr</th>
                  <th className="text-end">Amort./yr</th>
                  <th className="text-end">Squad cost</th>
                  <th className="text-end">Last FFP</th>
                  <th>FFP</th>
                  <th>Strategy</th>
                  <th>Board</th>
                  <th className="text-end">Transfer budget</th>
                  <th className="text-end">Wage room</th>
                  <th className="text-end">Seniors</th>
                  <th className="text-end">Loans in/out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.cid} className={c.user ? "table-primary" : ""}>
                    <td className="text-nowrap">
                      <img src={crestUrl(c.code)} alt="" width={14} height={16} /> {c.name}
                    </td>
                    <td className={`text-end ${c.cash < 0 ? "text-danger" : ""}`}>
                      {formatEuros(c.cash)}
                    </td>
                    <td className="text-end">{formatEuros(c.budgetBase)}</td>
                    <td className="text-end">{formatEuros(c.revenue)}</td>
                    <td className="text-end">{formatEuros(c.expenses)}</td>
                    <td className="text-end">{formatEuros(c.wages)}</td>
                    <td className="text-end">{formatEuros(c.amortisation)}</td>
                    <td className={`text-end ${c.squadCostRatio > 0.7 ? "text-danger" : ""}`}>
                      {formatPercent(c.squadCostRatio, 0)}
                    </td>
                    <td className="text-end">
                      {c.lastSquadCostRatio === null ? "" : formatPercent(c.lastSquadCostRatio, 0)}
                    </td>
                    <td>
                      <span className={`badge ${FFP_BADGE[c.ffp]}`}>{c.ffp}</span>
                    </td>
                    <td>{STRATEGY[c.strategy]}</td>
                    <td className="text-nowrap">
                      {c.boardTarget ?? ""}{" "}
                      {c.confidence === null ? "" : `(${Math.round(c.confidence)})`}
                    </td>
                    <td className="text-end">{formatEuros(c.transferBudget)}</td>
                    <td className="text-end">{formatEuros(c.wageRoom)}</td>
                    <td className="text-end">{c.seniors}</td>
                    <td className="text-end">
                      {c.loansIn}/{c.loansOut}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="row">
        <section className="col-lg-7 mb-4" data-testid="club-transfers">
          <div className="card h-100">
            <div className="card-body">
              <h3 className="h5">Transfer log this season</h3>
              {view.transfers.length === 0 ? (
                <p className="small text-body-secondary mb-0">Nothing yet.</p>
              ) : (
                <ul className="list-unstyled small mb-0">
                  {view.transfers.map((t, i) => (
                    <li key={i}>
                      <span className="text-body-secondary">{formatDate(t.date)}</span> {t.text}
                      {t.fee > 0 ? ` (${formatEuros(t.fee)})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
        <section className="col-lg-5 mb-4" data-testid="club-inbox">
          <div className="card h-100">
            <div className="card-body">
              <h3 className="h5">Inbox</h3>
              <ul className="list-unstyled small mb-0">
                {view.inbox.map((m) => (
                  <li key={m.mid} className={`mb-2 ${m.read ? "text-body-secondary" : ""}`}>
                    <strong>{m.subject}</strong>{" "}
                    <span className="text-body-secondary">{formatDate(m.date)}</span>
                    <br />
                    {m.body}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
