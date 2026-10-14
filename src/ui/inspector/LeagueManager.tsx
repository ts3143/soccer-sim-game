/** Save list and the New league form (M1 inspector). */
import { useEffect, useState } from "react";
import type { ClubChoice } from "../../common/api";
import type { LeagueSummary } from "../../common/schema";
import { formatDate } from "../format";
import { toWorker } from "../workerClient";

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface Props {
  leagues: LeagueSummary[];
  selected: number | null;
  onSelect: (lid: number | null) => void;
}

export function LeagueManager({ leagues, selected, onSelect }: Props) {
  const [choices, setChoices] = useState<ClubChoice[]>([]);
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [userCid, setUserCid] = useState(0);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    toWorker("getClubChoices")
      .then(setChoices)
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const league = await toWorker("createLeague", { name, seed, userCid });
      setName("");
      setSeed("");
      onSelect(league.lid);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (lid: number) => {
    setConfirmDelete(null);
    try {
      await toWorker("deleteLeague", lid);
      if (selected === lid) onSelect(null);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const leagueGroups = [...new Set(choices.map((c) => c.leagueId))].map((id) => ({
    id,
    name: choices.find((c) => c.leagueId === id)?.leagueName ?? id,
    clubs: choices.filter((c) => c.leagueId === id).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return (
    <section className="card mb-4">
      <div className="card-body">
        <h2 className="h5 card-title">Leagues</h2>
        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="col-md-3">
            <label className="form-label small mb-1" htmlFor="league-name">
              Name
            </label>
            <input
              id="league-name"
              className="form-control"
              placeholder={`League ${leagues.length + 1}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label small mb-1" htmlFor="league-club">
              Your club
            </label>
            <select
              id="league-club"
              className="form-select"
              value={userCid}
              onChange={(e) => setUserCid(Number(e.target.value))}
            >
              {leagueGroups.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  {group.clubs.map((club) => (
                    <option key={club.cid} value={club.cid}>
                      {club.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1" htmlFor="league-seed">
              Seed
            </label>
            <input
              id="league-seed"
              className="form-control"
              placeholder="random"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <button type="submit" className="btn btn-primary w-100" disabled={creating}>
              {creating ? "Generating…" : "New league"}
            </button>
          </div>
        </form>
        {creating && (
          <p className="small text-body-secondary">
            Generating 62 clubs and about 1,850 players. This takes a few seconds.
          </p>
        )}
        {error && <div className="alert alert-danger py-2">{error}</div>}

        {leagues.length === 0 ? (
          <p className="text-body-secondary mb-0">No leagues yet. Create one above.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>League</th>
                  <th>Your club</th>
                  <th>Season</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leagues.map((league) => (
                  <tr key={league.lid} className={league.lid === selected ? "table-active" : ""}>
                    <td>{league.name}</td>
                    <td>{league.clubName}</td>
                    <td>
                      {league.season}/{String((league.season + 1) % 100).padStart(2, "0")}
                    </td>
                    <td>{formatDate(league.createdAt)}</td>
                    <td className="text-end text-nowrap">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm me-2"
                        onClick={() => onSelect(league.lid)}
                      >
                        Open
                      </button>
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
      </div>
    </section>
  );
}
