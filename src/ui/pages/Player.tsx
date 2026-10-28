import { StatusBadge } from "../components/StatusBadge";
import { PlayerPositionMap } from "../components/PlayerPositionMap";
import { SkillTags } from "../components/SkillTags";
/**
 * Player profile (SPEC §11): bio, contract, value, mood with its breakdown, condition and
 * injury, ratings, position OVRs, transfer history, the ratings radar, OVR/POT history and
 * career stats.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import type { PlayerView } from "../../common/api";
import { RATING_CODES, ratingsConfig } from "../../common/config/ratings";
import { RadarChart } from "../components/charts";
import { NationalityFlag, RatingChange, RatingsGrid } from "../components/PlayerDetails";
import { ScoreLink, TeamLink } from "../components/links";
import { leaguePath, Link } from "../router";
import { resultRowClass } from "../components/results";
import { HonourBadge, HonoursCard } from "../components/Honours";
import { formatDate, formatEuros } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { seasonLabel, useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";
import { MOOD_LABELS, MoodBar } from "../components/Mood";
import { ContractModal } from "../components/ContractModal";
import { ListDialog, LoanDialog, ReleaseDialog } from "../components/MarketDialogs";

const TRANSFER_LABELS: Record<string, string> = {
  transfer: "Transfer",
  loan: "Loan",
  freeAgent: "Free transfer",
  academyPromotion: "Academy promotion",
  release: "Released",
  trade: "Trade",
};
const STATUS_LABELS: Record<string, string> = {
  club: "",
  loan: "On loan",
  academy: "Academy",
  freeAgent: "Free agent",
  retired: "Retired",
};

/** His last five matches this season, newest first, with his rating. */
function Form({ view }: { view: PlayerView }) {
  return (
    <section className="card mb-3" data-testid="player-form">
      <div className="card-body">
        <h2 className="h6">Form</h2>
        {view.form.length === 0 ? (
          <p className="small text-body-secondary mb-0">No matches this season.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm small align-middle mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Competition</th>
                  <th title="Home, away or neutral">Venue</th>
                  <th>Opponent</th>
                  <th>Score</th>
                  <th className="text-end">Min</th>
                  <th className="text-end">G</th>
                  <th className="text-end">A</th>
                  <th className="text-end">Rating</th>
                </tr>
              </thead>
              <tbody>
                {view.form.map((m) => (
                  <tr key={m.match.fid} className={resultRowClass(m.result)}>
                    <td className="text-nowrap">{formatDate(m.match.date)}</td>
                    <td>{m.match.competitionName}</td>
                    <td>{m.venue}</td>
                    <td>
                      <TeamLink team={m.opponent} />
                    </td>
                    <td>
                      {m.result && <span className="fw-semibold me-1">{m.result}</span>}
                      <ScoreLink fid={m.match.fid} score={m.match.score} />
                    </td>
                    <td className="text-end">{m.minutes}</td>
                    <td className="text-end">{m.goals}</td>
                    <td className="text-end">{m.assists}</td>
                    <td className="text-end fw-semibold text-nowrap" data-testid="form-rating">
                      {m.rating.toFixed(1)}
                      {m.motm && (
                        <span className="motm-star ms-1" title="Man of the match">
                          ★
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** "4 days", "3 weeks": how long an injury kept him out. */
const timeOut = (days: number) =>
  days < 14 ? `${days} day${days === 1 ? "" : "s"}` : `${Math.round(days / 7)} weeks`;

/** Every injury since the history began, newest first: in a match (and whose) or training. */
function InjuryHistory({ view }: { view: PlayerView }) {
  const { shell } = useShell();
  return (
    <section className="card mb-3" data-testid="player-injuries">
      <div className="card-body">
        <h2 className="h6">Injury history</h2>
        {view.injuries.length === 0 ? (
          <p className="small text-body-secondary mb-0">
            No injuries since {formatDate(view.injuriesSince)}.
          </p>
        ) : (
          <>
            <table className="table table-sm small mb-1">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Injury</th>
                  <th>Out</th>
                  <th>How</th>
                </tr>
              </thead>
              <tbody>
                {view.injuries.map((i, n) => (
                  <tr key={n} data-testid="injury-row">
                    <td className="text-nowrap text-body-secondary">{formatDate(i.date)}</td>
                    <td>{i.type}</td>
                    <td className="text-nowrap">{timeOut(i.days)}</td>
                    <td>
                      {i.fid !== null ? (
                        <>
                          <Link to={leaguePath(shell.lid, "box-score", i.fid)}>In a match</Link>
                          {i.opponent && (
                            <>
                              {" "}
                              against <TeamLink team={i.opponent} />
                            </>
                          )}
                        </>
                      ) : (
                        "In training"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small text-body-secondary mb-0">
              Since {formatDate(view.injuriesSince)}.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="col-6 col-md-4 col-xl-3 mb-2">
      <div className="small text-body-secondary">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Ratings({ view }: { view: PlayerView }) {
  return (
    <div className="profile-rating-groups" data-testid="ratings">
      <RatingsGrid
        ratings={view.ratings.map((r) => r.value)}
        changes={view.ratings.map((r) => r.change)}
        position={view.position}
      />
    </div>
  );
}

export function Player({ params }: { params: string[] }) {
  const { shell } = useShell();
  const pid = Number(params[0]);
  const [talking, setTalking] = useState(false);
  const [dialog, setDialog] = useState<"list" | "release" | "loan" | null>(null);
  const { data: view, error } = useView(`player/${pid}`, () =>
    toWorker("getPlayer", shell.lid, pid),
  );
  if (error) {
    // A long-retired player pruned from the save, or an address that names no player.
    const gone = /no longer in the save|There's no player/.test(error);
    return (
      <div
        className={`alert ${gone ? "alert-secondary" : "alert-danger"}`}
        data-testid="player-gone"
      >
        {error}
      </div>
    );
  }
  if (!view) return <p>Loading…</p>;
  const status = STATUS_LABELS[view.status] ?? view.status;
  const own = view.status === "club" && view.team?.cid === shell.userCid;
  const talk =
    view.status === "freeAgent"
      ? "Offer a contract"
      : view.status === "club" && view.team
        ? view.team.cid === shell.userCid
          ? "New contract"
          : "Make a bid"
        : null;
  return (
    <>
      <PageHeader title={view.name}>
        <NationalityFlag nationality={view.nationality} />
        {view.team && <TeamLink team={view.team} />}
        {status && <span className="badge text-bg-secondary">{status}</span>}
        {talk && !shell.state.fired && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setTalking(true)}
            data-testid="profile-talks"
          >
            {talk}
          </button>
        )}
        {own && !shell.state.fired && (
          <>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => setDialog("list")}
              data-testid="profile-list"
            >
              {view.listed ? `Listed at ${formatEuros(view.listed.asking)}` : "List for transfer"}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setDialog("loan")}
            >
              Loan out
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => setDialog("release")}
              data-testid="profile-release"
            >
              Release
            </button>
          </>
        )}
      </PageHeader>
      {talking && <ContractModal pid={view.pid} onClose={() => setTalking(false)} />}
      {dialog === "list" && (
        <ListDialog
          player={{ pid: view.pid, name: view.name, value: view.value, listed: view.listed }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "release" && (
        <ReleaseDialog
          player={{
            pid: view.pid,
            name: view.name,
            wage: view.contract?.wage ?? 0,
            expires: view.contract?.expires ?? null,
          }}
          today={view.today}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "loan" && (
        <LoanDialog
          player={{ pid: view.pid, name: view.name }}
          direction="out"
          onClose={() => setDialog(null)}
        />
      )}
      <div className="player-profile-top mb-3">
        <section className="card profile-bio" data-testid="player-bio">
          <div className="card-body small">
            <div className="d-flex flex-wrap align-items-center gap-4 mb-3">
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
            <p className="small mb-2">
              {view.contract
                ? `${formatEuros(view.contract.wage)}/yr until ${formatDate(view.contract.expires)}`
                : "No professional contract"}
            </p>
            <div className="row">
              <Fact label="Age">
                {view.age} (born {formatDate(view.birthDate)})
              </Fact>
              {view.birthplace && (
                <Fact label="Birthplace">
                  <span data-testid="birthplace">{view.birthplace}</span>
                </Fact>
              )}
              <Fact label="Nationality">
                <NationalityFlag nationality={view.nationality} /> {view.nationality}
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
            <PlayerPositionMap ovrs={view.positionOvrs} />
          </div>
        </section>
        <section className="card profile-ratings">
          <div className="card-body">
            <div className="d-flex flex-wrap gap-4 mb-3">
              <h2 className="h5 mb-0">
                Overall: {view.ovr}
                <RatingChange value={view.ovrChange} />
              </h2>
              <h2 className="h5 mb-0">
                Potential: {view.pot}
                <RatingChange value={view.potChange} />
              </h2>
            </div>
            <div className="mb-2">
              <SkillTags ratings={view.ratings.map((r) => r.value)} position={view.position} />
            </div>
            <div className="profile-ratings-content">
              <div>
                <Ratings view={view} />
                <h3 className="h6 small text-uppercase text-body-secondary mt-2">
                  OVR by position
                </h3>
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
              <div className="profile-radar">
                <RadarChart axes={view.radar} />
              </div>
            </div>
          </div>
        </section>
      </div>
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
                      <StatusBadge
                        label="E"
                        tone="warning"
                        className="ms-2"
                        description={`Contract expires ${formatDate(view.contract.expires)}`}
                      />
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
                  <details className="mb-2">
                    <summary className="text-body-secondary">Mood breakdown</summary>
                    <table className="table table-sm mb-2">
                      <tbody>
                        {Object.entries(view.mood.components).map(([k, v]) => (
                          <tr key={k}>
                            <td>{MOOD_LABELS[k] ?? k}</td>
                            <td>
                              <MoodBar value={v} />
                            </td>
                            <td className="text-end">
                              {v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
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
      <Form view={view} />
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
      <InjuryHistory view={view} />
      <div className="row g-3 mb-3">
        <section className="col-12">
          <div className="card h-100">
            <div className="card-body">
              <h2 className="h6">Ratings history</h2>
              <div className="table-responsive">
                <table className="table table-sm small text-nowrap" data-testid="ratings-history">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Age</th>
                      <th>OVR</th>
                      <th>POT</th>
                      {RATING_CODES.map((code) => (
                        <th key={code} title={ratingsConfig.ratingNames[code]}>
                          {code.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...view.history].reverse().map((h) => (
                      <tr key={h.date}>
                        <td>{formatDate(h.date)}</td>
                        <td>{h.age}</td>
                        <td className="fw-semibold">{h.ovr}</td>
                        <td>{h.pot}</td>
                        {RATING_CODES.map((code, i) => (
                          <td key={code}>{Math.round(h.ratings[i] ?? 0)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
      <HonoursCard honours={view.honours} />
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
      motm: rows.reduce((s, r) => s + r.motm, 0),
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
      <td className="text-end">{t.motm}</td>
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
                <th className="text-end" title="Man of the match">
                  MotM
                </th>
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
                      <td>
                        {r.competitionName}
                        {view.honours
                          .filter(
                            (h) =>
                              h.season === season &&
                              h.club.cid === r.club.cid &&
                              h.competition === r.competition,
                          )
                          .map((h) => (
                            <span key={h.type}>
                              {" "}
                              <HonourBadge honour={h} />
                            </span>
                          ))}
                      </td>
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
