/**
 * "You're fired" (SPEC §6.5): the board has sacked the user. His record, and one to three
 * job offers at clubs of lower reputation; or he starts a new league.
 */
import { useState } from "react";
import { crestUrl } from "../crests";
import { formatDate } from "../format";
import { leaguePath, Link, navigate } from "../router";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export function Fired() {
  const { shell } = useShell();
  // Wrapped: useView's null means "loading", the worker's null means "not sacked".
  const { data, error } = useView("fired", async () => ({
    view: await toWorker("getJobOffers", shell.lid),
  }));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <p>Loading…</p>;
  const { view } = data;
  if (view === null) {
    return (
      <p className="text-body-secondary">
        You're in a job. <Link to={leaguePath(shell.lid)}>Back to the Dashboard</Link>.
      </p>
    );
  }
  const take = async (cid: number) => {
    setBusy(true);
    setProblem(null);
    try {
      await toWorker("acceptJobOffer", shell.lid, cid);
      navigate(leaguePath(shell.lid));
    } catch (e) {
      setProblem(errorText(e));
      setBusy(false);
    }
  };
  const r = view.record;
  return (
    <div className="mx-auto" style={{ maxWidth: 860 }} data-testid="fired">
      <div className="text-center my-4">
        <img src={crestUrl(view.club.code)} alt="" width={60} height={70} />
        <h1 className="display-6 fw-bold mt-2">You're fired</h1>
        <p className="lead mb-1">
          The board of {view.club.name} sacked you on {formatDate(view.date)}.
        </p>
        <p className="text-body-secondary">
          {r.position ? `${ordinal(r.position)} in the ${view.leagueName}` : view.leagueName} · P
          {r.played} W{r.won} D{r.drawn} L{r.lost} · board confidence {view.confidence} of 100
        </p>
      </div>
      <h2 className="h5">
        {view.offers.length === 1 ? "One club wants you" : `${view.offers.length} clubs want you`}
      </h2>
      {problem && <div className="alert alert-danger py-2 small">{problem}</div>}
      <div className="row g-3 mb-4" data-testid="job-offers">
        {view.offers.map((o) => (
          <div key={o.team.cid} className="col-md-4">
            <section className="card h-100">
              <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <img src={crestUrl(o.team.code)} alt="" width={34} height={40} />
                  <h3 className="h6 mb-0">{o.team.name}</h3>
                </div>
                <ul className="list-unstyled small mb-3">
                  <li>
                    {o.leagueName}
                    {o.position ? `, ${ordinal(o.position)}` : ""}
                  </li>
                  <li>Squad strength {o.strength.toFixed(1)}</li>
                  <li>Reputation {o.reputation}</li>
                  {o.expectation && <li>The board expects: {o.expectation.toLowerCase()}</li>}
                </ul>
                <button
                  type="button"
                  className="btn btn-primary btn-sm w-100"
                  disabled={busy}
                  onClick={() => void take(o.team.cid)}
                >
                  Take the job
                </button>
              </div>
            </section>
          </div>
        ))}
      </div>
      <p className="text-center small text-body-secondary">
        Or <Link to="/new">start a new league</Link>, or go back to{" "}
        <Link to="/">Manage Leagues</Link>. You can look around this league meanwhile; play resumes
        once you take a job.
      </p>
    </div>
  );
}
