/**
 * Player profile (SPEC §11): bio, contract, value, mood with its breakdown, condition and
 * injury, ratings, position OVRs, transfer history, the ratings radar, OVR/POT history and
 * career stats.
 */
import type { ReactNode } from "react";
import type { PlayerView } from "../../common/api";
import { RadarChart, RatingHistoryChart } from "../components/charts";
import { TeamLink } from "../components/links";
import { formatDate, formatEuros } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { seasonLabel, useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const MOOD_LABELS: Record<string, string> = {
  success: "Team success",
  hype: "Hype",
  facilities: "Facilities",
  market: "Market size",
  playingTime: "Playing time",
  loyalty: "Loyalty",
  ambition: "Ambition",
};
const TRANSFER_LABELS: Record<string, string> = {
  transfer: "Transfer",
  loan: "Loan",
  freeAgent: "Free transfer",
  academyPromotion: "Academy promotion",
  release: "Released",
};
const STATUS_LABELS: Record<string, string> = {
  club: "",
  loan: "On loan",
  academy: "Academy",
  freeAgent: "Free agent",
  retired: "Retired",
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="col-6 col-md-4 col-xl-3 mb-2">
      <div className="small text-body-secondary">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function MoodBar({ value }: { value: number }) {
  const width = Math.abs(value) * 50;
  return (
    <div className="position-relative bg-body-secondary rounded" style={{ height: 8, width: 120 }}>
      <div
        className="position-absolute top-0 bottom-0 border-start border-dark"
        style={{ left: "50%" }}
      />
      <div
        className={`position-absolute top-0 bottom-0 rounded ${value >= 0 ? "bg-success" : "bg-danger"}`}
        style={
          value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }
        }
      />
    </div>
  );
}

function Ratings({ view }: { view: PlayerView }) {
  const groups = [...new Set(view.ratings.map((r) => r.group))];
  return (
    <div className="row" data-testid="ratings">
      {groups.map((g) => (
        <div key={g} className="col-sm-6 col-lg-4 mb-3">
          <h3 className="h6 small text-uppercase text-body-secondary">{g}</h3>
          <table className="table table-sm small mb-0">
            <tbody>
              {view.ratings
                .filter((r) => r.group === g)
                .map((r) => (
                  <tr key={r.code}>
                    <td>{r.name}</td>
                    <td className="text-end fw-semibold">{r.value}</td>
                    <td className="text-end" style={{ width: "3em" }}>
                      {r.change ? (
                        <span className={r.change > 0 ? "text-success" : "text-danger"}>
                          {r.change > 0 ? `+${r.change}` : r.change}
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function Player({ params }: { params: string[] }) {
  const { shell } = useShell();
  const pid = Number(params[0]);
  const { data: view, error } = useView(`player/${pid}`, () =>
    toWorker("getPlayer", shell.lid, pid),
  );
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const status = STATUS_LABELS[view.status] ?? view.status;
  return (
    <>
      <PageHeader title={view.name}>
        {view.team && <TeamLink team={view.team} />}
        {status && <span className="badge text-bg-secondary">{status}</span>}
      </PageHeader>
      <section className="card mb-3" data-testid="player-bio">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-center gap-4 mb-3">
            <div className="text-center">
              <div className="display-6 fw-semibold lh-1">{view.ovr}</div>
              <div className="small text-body-secondary">OVR</div>
            </div>
            <div className="text-center">
              <div className="display-6 lh-1 text-body-secondary">{view.pot}</div>
              <div className="small text-body-secondary">POT</div>
            </div>
            <div>
              <div className="h5 mb-0">
                {view.position}
                {view.secondary.length > 0 && (
                  <span className="text-body-secondary fw-normal">
                    {" "}
                    · also {view.secondary.join(", ")}
                  </span>
                )}
              </div>
              <div className="small text-body-secondary">Value {formatEuros(view.value)}</div>
            </div>
          </div>
          <div className="row">
            <Fact label="Age">
              {view.age} (born {formatDate(view.birthDate)})
            </Fact>
            <Fact label="Nationality">
              {view.nationality}
              {view.nationality2 ? ` / ${view.nationality2}` : ""}
            </Fact>
            <Fact label="Foot">{view.foot === "L" ? "Left" : "Right"}</Fact>
            <Fact label="Height">{view.heightCm} cm</Fact>
            {view.shirtNumber !== null && <Fact label="Shirt">{view.shirtNumber}</Fact>}
            {view.retiredSeason !== null && <Fact label="Retired">{view.retiredSeason}</Fact>}
            {view.freeAgentSince && (
              <Fact label="Free agent since">{formatDate(view.freeAgentSince)}</Fact>
            )}
          </div>
        </div>
      </section>
      <div className="row g-3 mb-3">
        <section className="col-md-6 col-xl-4" data-testid="player-contract">
          <div className="card h-100">
            <div className="card-body small">
              <h2 className="h6">Contract</h2>
              {view.contract ? (
                <>
                  <div>
                    {formatEuros(view.contract.wage)} a year until{" "}
                    {formatDate(view.contract.expires)}
                  </div>
                  <div className="text-body-secondary">
                    {view.contract.yearsLeft} season{view.contract.yearsLeft === 1 ? "" : "s"} left
                    {view.contract.yearsLeft === 1 && (
                      <span className="badge text-bg-warning ms-2">expires this June</span>
                    )}
                  </div>
                  {view.contract.feeRemaining > 0 && (
                    <div className="text-body-secondary">
                      Transfer fee still to amortise: {formatEuros(view.contract.feeRemaining)}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-body-secondary">No contract.</div>
              )}
              {view.loan && (
                <div className="mt-2">
                  On loan at <TeamLink team={view.loan.at} /> from{" "}
                  <TeamLink team={view.loan.parent} /> until {formatDate(view.loan.until)} (
                  {Math.round(view.loan.wageShare * 100)}% of his wage paid by the loan club)
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="col-md-6 col-xl-4" data-testid="player-condition">
          <div className="card h-100">
            <div className="card-body small">
              <h2 className="h6">Condition</h2>
              <div
                className="progress mb-1"
                role="progressbar"
                aria-label="Condition"
                aria-valuenow={view.condition}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`progress-bar ${view.condition < 75 ? "bg-danger" : view.condition < 90 ? "bg-warning" : "bg-success"}`}
                  style={{ width: `${view.condition}%` }}
                />
              </div>
              <div>{view.condition}%</div>
              {view.injury ? (
                <div className="mt-2 text-danger">
                  Injured: {view.injury.type}, back {formatDate(view.injury.until)}
                </div>
              ) : (
                <div className="mt-2 text-body-secondary">Not injured.</div>
              )}
            </div>
          </div>
        </section>
        <section className="col-md-12 col-xl-4" data-testid="player-mood">
          <div className="card h-100">
            <div className="card-body small">
              <h2 className="h6">Mood</h2>
              {view.mood ? (
                <>
                  <div className="mb-2">
                    {view.mood.value.toFixed(2)}{" "}
                    {view.mood.willing ? (
                      <span className="text-body-secondary">(would talk about a new contract)</span>
                    ) : (
                      <span className="text-danger">(won't negotiate)</span>
                    )}
                  </div>
                  <table className="table table-sm mb-2">
                    <tbody>
                      {Object.entries(view.mood.components).map(([k, v]) => (
                        <tr key={k}>
                          <td>{MOOD_LABELS[k] ?? k}</td>
                          <td>
                            <MoodBar value={v} />
                          </td>
                          <td className="text-end">{v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-body-secondary">
                    Traits:{" "}
                    {view.mood.traits.length
                      ? view.mood.traits
                          .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
                          .join(", ")
                      : "none"}
                  </div>
                </>
              ) : (
                <div className="text-body-secondary">Not at a senior club.</div>
              )}
            </div>
          </div>
        </section>
      </div>
      <section className="card mb-3">
        <div className="card-body">
          <h2 className="h6">Ratings</h2>
          <Ratings view={view} />
          <h3 className="h6 small text-uppercase text-body-secondary mt-2">OVR by position</h3>
          <div className="d-flex flex-wrap gap-2 small" data-testid="position-ovrs">
            {view.positionOvrs.map((o) => (
              <span
                key={o.position}
                className={`badge ${o.position === view.position ? "text-bg-primary" : "text-bg-light"}`}
              >
                {o.position} {o.ovr}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="card mb-3" data-testid="player-transfers">
        <div className="card-body">
          <h2 className="h6">Transfer history</h2>
          {view.transfers.length === 0 ? (
            <p className="small text-body-secondary mb-0">No moves yet.</p>
          ) : (
            <table className="table table-sm small mb-0">
              <tbody>
                {view.transfers.map((t, i) => (
                  <tr key={i}>
                    <td className="text-nowrap text-body-secondary">{formatDate(t.date)}</td>
                    <td>{TRANSFER_LABELS[t.type] ?? t.type}</td>
                    <td>{t.from ? <TeamLink team={t.from} /> : "—"}</td>
                    <td>→</td>
                    <td>
                      {t.to ? <TeamLink team={t.to} /> : t.type === "release" ? "Free agency" : "—"}
                    </td>
                    <td className="text-end">{t.fee > 0 ? formatEuros(t.fee) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <div className="row g-3 mb-3">
        <section className="col-lg-5">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6">Profile</h2>
              <div className="d-flex justify-content-center">
                <RadarChart axes={view.radar} />
              </div>
            </div>
          </div>
        </section>
        <section className="col-lg-7">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6">OVR and POT over time</h2>
              <RatingHistoryChart points={view.history} />
            </div>
          </div>
        </section>
      </div>
      <Career view={view} />
    </>
  );
}

/** Career stats: a row per season, club and competition, season totals and the career's. */
function Career({ view }: { view: PlayerView }) {
  if (view.career.length === 0) {
    return <p className="small text-body-secondary">No senior appearances yet.</p>;
  }
  const seasons = [...new Set(view.career.map((r) => r.season))];
  const total = (rows: PlayerView["career"]) => {
    const apps = rows.reduce((s, r) => s + r.appearances, 0);
    const ratingSum = rows.reduce((s, r) => s + (r.rating ?? 0) * r.appearances, 0);
    return {
      appearances: apps,
      starts: rows.reduce((s, r) => s + r.starts, 0),
      minutes: rows.reduce((s, r) => s + r.minutes, 0),
      goals: rows.reduce((s, r) => s + r.goals, 0),
      assists: rows.reduce((s, r) => s + r.assists, 0),
      yellowCards: rows.reduce((s, r) => s + r.yellowCards, 0),
      redCards: rows.reduce((s, r) => s + r.redCards, 0),
      rating: apps > 0 ? ratingSum / apps : null,
    };
  };
  const cells = (t: ReturnType<typeof total>) => (
    <>
      <td className="text-end">{t.appearances}</td>
      <td className="text-end">{t.starts}</td>
      <td className="text-end">{t.minutes}</td>
      <td className="text-end">{t.goals}</td>
      <td className="text-end">{t.assists}</td>
      <td className="text-end">{t.rating === null ? "" : t.rating.toFixed(2)}</td>
      <td className="text-end">{t.yellowCards}</td>
      <td className="text-end">{t.redCards}</td>
    </>
  );
  return (
    <section className="card mb-3" data-testid="career">
      <div className="card-body">
        <h2 className="h6">Career</h2>
        <div className="table-responsive">
          <table className="table table-sm small align-middle mb-0">
            <thead>
              <tr>
                <th>Season</th>
                <th>Club</th>
                <th>Competition</th>
                <th className="text-end">Apps</th>
                <th className="text-end">Starts</th>
                <th className="text-end">Min</th>
                <th className="text-end">G</th>
                <th className="text-end">A</th>
                <th className="text-end">Rating</th>
                <th className="text-end">YC</th>
                <th className="text-end">RC</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((season) => {
                const rows = view.career.filter((r) => r.season === season);
                return [
                  ...rows.map((r) => (
                    <tr key={`${season}-${r.club.cid}-${r.competition}`}>
                      <td>{seasonLabel(season)}</td>
                      <td>
                        <TeamLink team={r.club} />
                      </td>
                      <td>{r.competitionName}</td>
                      {cells(total([r]))}
                    </tr>
                  )),
                  rows.length > 1 ? (
                    <tr key={`${season}-total`} className="table-light fw-semibold">
                      <td>{seasonLabel(season)}</td>
                      <td colSpan={2}>Season total</td>
                      {cells(total(rows))}
                    </tr>
                  ) : null,
                ];
              })}
              <tr className="fw-semibold border-top">
                <td colSpan={3}>Career</td>
                {cells(total(view.career))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
