/** Manage Leagues (SPEC §11 Tools): the saves on this device; open, delete, or start a new one. */
import { useEffect, useState } from "react";
import type { LeagueSummary } from "../../common/schema";
import { formatDate } from "../format";
import { leaguePath, Link } from "../router";
import { seasonLabel } from "../shell/Shell";
import { APP_VERSION } from "../version";
import { onWorkerEvent, toWorker } from "../workerClient";
import { errorText } from "../errors";

export function Home() {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = onWorkerEvent("leaguesChanged", ({ leagues: list }) => setLeagues(list));
    toWorker("listLeagues")
      .then(setLeagues)
      .catch((e: unknown) => setError(errorText(e)));
    return off;
  }, []);

  const remove = async (lid: number) => {
    setConfirmDelete(null);
    try {
      await toWorker("deleteLeague", lid);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const sorted = [...(leagues ?? [])].sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
  return (
    <main className="container py-4" style={{ maxWidth: 960 }}>
      <div className="d-flex align-items-center gap-3 mb-4">
        <h1 className="h3 mb-0">Soccer Sim</h1>
        <Link to="/how-to-play" className="ms-auto" data-testid="how-to-play-link">
          How to play
        </Link>
        <Link to="/new" className="btn btn-primary" data-testid="new-league-link">
          New league
        </Link>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {leagues === null ? (
        <p>Loading your leagues…</p>
      ) : leagues.length === 0 ? (
        <div className="text-center py-5" data-testid="no-leagues">
          <p className="lead">No leagues yet.</p>
          <p className="text-body-secondary">
            New here? Read <Link to="/how-to-play">How to play</Link> first, or just start.
          </p>
          <Link to="/new" className="btn btn-lg btn-primary">
            Start a new league
          </Link>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle" data-testid="league-list">
            <thead>
              <tr>
                <th>League</th>
                <th>Your club</th>
                <th>Season</th>
                <th>Last played</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((league) => (
                <tr key={league.lid}>
                  <td>
                    <Link to={leaguePath(league.lid)} className="fw-semibold">
                      {league.name}
                    </Link>
                  </td>
                  <td>{league.clubName}</td>
                  <td>{seasonLabel(league.season)}</td>
                  <td>{formatDate(league.lastPlayedAt)}</td>
                  <td className="text-end text-nowrap">
                    <Link to={leaguePath(league.lid)} className="btn btn-sm btn-primary me-2">
                      Play
                    </Link>
                    {confirmDelete === league.lid ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm me-1"
                          onClick={() => void remove(league.lid)}
                        >
                          Delete for good
                        </button>
                        <button
                          type="button"
                          className="btn btn-link btn-sm"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setConfirmDelete(league.lid)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small text-body-secondary mt-4">
        Saves stay on this device. Soccer Sim v{APP_VERSION}.
      </p>
    </main>
  );
}
