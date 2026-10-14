/** One saved league: summary, OVR distribution, checks, club table and squads (M1 inspector). */
import { useEffect, useState } from "react";
import type { LeagueOverview, SquadView } from "../../common/api";
import { crestUrl } from "../crests";
import { formatEuros, formatPercent } from "../format";
import { toWorker } from "../workerClient";
import { OvrHistogram } from "./OvrHistogram";
import { MatchLab } from "./MatchLab";
import { SquadTable } from "./SquadTable";

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function LeagueView({ lid }: { lid: number }) {
  const [overview, setOverview] = useState<LeagueOverview | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [squad, setSquad] = useState<SquadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"generation" | "lab">("generation");

  useEffect(() => {
    // The parent remounts this view per league (key={lid}), so state starts empty.
    let current = true;
    toWorker("getLeagueOverview", lid)
      .then((result) => {
        if (!current) return;
        setOverview(result);
        setLeagueId((id) => id ?? result.leagues[0]?.id ?? null);
      })
      .catch((e: unknown) => current && setError(errorText(e)));
    return () => {
      current = false;
    };
  }, [lid]);

  const openSquad = (cid: number) => {
    toWorker("getSquad", lid, cid)
      .then((result) => {
        setSquad(result);
        requestAnimationFrame(() =>
          document.getElementById("squad")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      })
      .catch((e: unknown) => setError(errorText(e)));
  };

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!overview) return <p>Loading league…</p>;

  const clubs = overview.clubs.filter((c) => c.leagueId === leagueId);
  const failed = overview.checks.filter((c) => !c.pass).length;
  const { counts } = overview;

  return (
    <>
      <section className="mb-4">
        <h2 className="h4 mb-1">{overview.name}</h2>
        <p className="text-body-secondary mb-3">
          Season {overview.season}/{String((overview.season + 1) % 100).padStart(2, "0")} · seed{" "}
          <code>{overview.seed}</code> · {counts.clubs} clubs ·{" "}
          {(counts.seniors + counts.academy).toLocaleString("en-GB")} club players (
          {counts.seniors.toLocaleString("en-GB")} senior, {counts.academy} academy) ·{" "}
          {counts.freeAgents} free agents
        </p>
        <ul className="nav nav-pills mb-3">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === "generation" ? "active" : ""}`}
              onClick={() => setTab("generation")}
            >
              Generation (M1)
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link ${tab === "lab" ? "active" : ""}`}
              onClick={() => setTab("lab")}
            >
              Match lab (M2)
            </button>
          </li>
        </ul>
      </section>
      {tab === "lab" && <MatchLab lid={lid} clubs={overview.clubs} leagues={overview.leagues} />}
      {tab === "generation" && (
        <>
          <section className="mb-4">
            <div className="row g-3">
              <div className="col-lg-8">
                <div className="card h-100">
                  <div className="card-body">
                    <h3 className="h6 text-uppercase text-body-secondary">OVR distribution</h3>
                    <OvrHistogram
                      counts={overview.ovrCounts}
                      thresholds={overview.bands.map((b) => b.min).filter((m) => m > 0)}
                    />
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-body">
                    <h3 className="h6 text-uppercase text-body-secondary">OVR bands (seniors)</h3>
                    <table className="table table-sm mb-0">
                      <tbody>
                        {overview.bands.map((band) => (
                          <tr key={band.min}>
                            <td className="text-nowrap">
                              {band.max >= 100 ? `${band.min}+` : `${band.min}–${band.max}`}
                            </td>
                            <td>{band.label}</td>
                            <td className="text-end">{band.count}</td>
                            <td className="text-end text-body-secondary">
                              {formatPercent(band.count / counts.seniors)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card mb-4">
            <div className="card-body">
              <h3 className="h6 text-uppercase text-body-secondary">
                M1 acceptance checks:{" "}
                {failed === 0 ? (
                  <span className="text-success">✓ all {overview.checks.length} pass</span>
                ) : (
                  <span className="text-danger">✗ {failed} failing</span>
                )}
              </h3>
              <ul className="list-unstyled row row-cols-md-2 mb-0 small">
                {overview.checks.map((check) => (
                  <li key={check.name} className="col">
                    <span className={check.pass ? "text-success" : "text-danger"}>
                      {check.pass ? "✓ PASS" : "✗ FAIL"}
                    </span>{" "}
                    {check.name} <span className="text-body-secondary">({check.detail})</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="card mb-4">
            <div className="card-body">
              <ul className="nav nav-tabs mb-3">
                {overview.leagues.map((league) => (
                  <li className="nav-item" key={league.id}>
                    <button
                      type="button"
                      className={`nav-link ${league.id === leagueId ? "active" : ""}`}
                      onClick={() => setLeagueId(league.id)}
                    >
                      {league.name}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="small text-body-secondary">
                Best XI = mean slot OVR of the best XI in the club's default formation, recomputed
                from the save. Click a club to see its squad.
              </p>
              <div className="table-responsive">
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th colSpan={2}>Club</th>
                      <th>Formation</th>
                      <th className="text-end">Target</th>
                      <th className="text-end">Best XI</th>
                      <th className="text-end">Δ</th>
                      <th className="text-end">Seniors</th>
                      <th className="text-end">Academy</th>
                      <th className="text-end">Avg age</th>
                      <th className="text-end">Best OVR</th>
                      <th className="text-end">Wages/yr</th>
                      <th className="text-end">Revenue</th>
                      <th className="text-end">Wages % rev.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.map((club) => {
                      const delta = club.xiStrength - club.strengthTarget;
                      return (
                        <tr
                          key={club.cid}
                          role="button"
                          className={squad?.cid === club.cid ? "table-active" : ""}
                          onClick={() => openSquad(club.cid)}
                        >
                          <td style={{ width: 28 }}>
                            <img src={crestUrl(club.code)} alt="" width={20} height={23} />
                          </td>
                          <td>
                            {club.name}
                            {club.cid === overview.userCid && (
                              <span className="badge text-bg-primary ms-2">You</span>
                            )}
                          </td>
                          <td>{club.formation}</td>
                          <td className="text-end">{club.strengthTarget}</td>
                          <td className="text-end">{club.xiStrength.toFixed(2)}</td>
                          <td className="text-end">
                            {Math.abs(delta) <= 1 ? "✓ " : "✗ "}
                            {delta >= 0 ? "+" : "−"}
                            {Math.abs(delta).toFixed(2)}
                          </td>
                          <td className="text-end">{club.seniors}</td>
                          <td className="text-end">{club.academy}</td>
                          <td className="text-end">{club.averageAge.toFixed(1)}</td>
                          <td className="text-end">{club.topOvr}</td>
                          <td className="text-end">{formatEuros(club.wageBill)}</td>
                          <td className="text-end">{formatEuros(club.revenue)}</td>
                          <td className="text-end">{formatPercent(club.squadCostRatio)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {squad && <SquadTable squad={squad} />}
        </>
      )}
    </>
  );
}
