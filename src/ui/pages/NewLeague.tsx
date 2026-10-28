/**
 * New league (SPEC §11, §17.1): pick a world (Classic or Super League; the switches behind
 * them aren't shown), then your club from its leagues (with crest, city, squad strength and
 * revenue), name the save, and start. The seed is optional.
 */
import { useEffect, useState } from "react";
import type { ClubChoice } from "../../common/api";
import type { WorldId } from "../../common/config/worlds";
import { crestUrl } from "../crests";
import { formatEuros } from "../format";
import { leaguePath, Link, navigate } from "../router";
import { toWorker } from "../workerClient";
import { errorText } from "../errors";

/** The two ways to play (SPEC §17.1), as offered at New game. */
const WORLDS: { id: WorldId; name: string; blurb: string }[] = [
  {
    id: "classic",
    name: "Classic",
    blurb:
      "England's top two divisions and Germany's top flight: transfers, loans, youth academies and Financial Fair Play.",
  },
  {
    id: "superLeague",
    name: "Super League",
    blurb:
      "48 clubs in three tiers of 16 with promotion and relegation: a draft with a lottery, trades instead of transfers, and a soft salary cap.",
  },
];

export function NewLeague() {
  const [world, setWorld] = useState<WorldId>("classic");
  const [choices, setChoices] = useState<ClubChoice[]>([]);
  const [league, setLeague] = useState<string>("");
  const [userCid, setUserCid] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [seed, setSeed] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    toWorker("getClubChoices", world)
      .then((loaded) => {
        setChoices(loaded);
        setLeague(loaded[0]?.leagueId ?? "");
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [world]);

  const leagues = [...new Map(choices.map((c) => [c.leagueId, c.leagueName])).entries()];
  const clubs = choices
    .filter((c) => c.leagueId === league)
    .sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name));
  const chosen = choices.find((c) => c.cid === userCid);

  const create = async () => {
    if (userCid === null) return;
    setCreating(true);
    setError(null);
    try {
      const created = await toWorker("createLeague", { world, name, seed, userCid });
      navigate(leaguePath(created.lid), { replace: true });
    } catch (e) {
      setError(errorText(e));
      setCreating(false);
    }
  };

  return (
    <main className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center gap-3 mb-3">
        <h1 className="h3 mb-0">New league</h1>
        <Link to="/" className="ms-auto">
          Back to your leagues
        </Link>
      </div>
      <div className="row g-2 mb-3" data-testid="world-choices">
        {WORLDS.map((w) => (
          <div key={w.id} className="col-md-6">
            <button
              type="button"
              className={`card w-100 h-100 text-start ${w.id === world ? "border-primary border-2 shadow-sm" : ""}`}
              onClick={() => {
                if (w.id === world) return;
                setWorld(w.id);
                setChoices([]);
                setUserCid(null);
              }}
              aria-pressed={w.id === world}
              data-testid={`world-${w.id}`}
            >
              <div className="card-body py-2">
                <div className="fw-semibold">{w.name}</div>
                <div className="small text-body-secondary">{w.blurb}</div>
              </div>
            </button>
          </div>
        ))}
      </div>
      <p className="text-body-secondary">
        Pick the club you'll manage. Every other club is run by the computer.
      </p>
      <ul className="nav nav-tabs mb-3">
        {leagues.map(([id, leagueName]) => (
          <li key={id} className="nav-item">
            <button
              type="button"
              className={`nav-link ${id === league ? "active" : ""}`}
              onClick={() => setLeague(id)}
            >
              {leagueName}
            </button>
          </li>
        ))}
      </ul>
      <div className="row g-2 mb-4" data-testid="club-choices">
        {clubs.map((c) => (
          <div key={c.cid} className="col-sm-6 col-lg-4 col-xl-3">
            <button
              type="button"
              className={`card w-100 text-start h-100 ${c.cid === userCid ? "border-primary border-2 shadow-sm" : ""}`}
              style={{ borderLeft: `6px solid ${c.primaryColor}` }}
              onClick={() => setUserCid(c.cid)}
              aria-pressed={c.cid === userCid}
            >
              <div className="card-body py-2 d-flex align-items-center gap-2">
                <img src={crestUrl(c.code)} alt="" width={30} height={35} />
                <div className="small">
                  <div className="fw-semibold">{c.name}</div>
                  <div className="text-body-secondary">
                    {c.city} · strength {c.strength} · {formatEuros(c.revenue)}
                  </div>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
      <form
        className="row g-2 align-items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="col-md-4">
          <label className="form-label small mb-1" htmlFor="new-league-name">
            League name
          </label>
          <input
            id="new-league-name"
            className="form-control"
            placeholder={chosen ? `${chosen.name} save` : "My league"}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label small mb-1" htmlFor="new-league-seed">
            Seed (optional)
          </label>
          <input
            id="new-league-seed"
            className="form-control"
            placeholder="random"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </div>
        <div className="col-md-5">
          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={userCid === null || creating}
            data-testid="start-league"
          >
            {creating
              ? "Generating the world…"
              : chosen
                ? `Start as ${chosen.name}`
                : "Pick a club to start"}
          </button>
        </div>
      </form>
      {error && <div className="alert alert-danger mt-3">{error}</div>}
    </main>
  );
}
