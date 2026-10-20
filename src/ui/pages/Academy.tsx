/**
 * Youth Academy (SPEC §7.2, §11): the user's prospects. Promote one (his first professional
 * contract, three seasons) or release him. Those 18 or older on 1 July must be decided by
 * then; the ones left are decided by the club's rule (T, 2026-10-19).
 */
import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { PlayerLink } from "../components/links";
import { formatDate, formatEuros } from "../format";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Academy() {
  const { shell, reload } = useShell();
  const { data: view, error } = useView("academy", () => toWorker("getAcademy", shell.lid));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [releasing, setReleasing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const full = view.seniors >= view.maxSeniors;
  const decide = async (pid: number, decision: "promote" | "release") => {
    setBusy(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await toWorker("decideAcademyPlayer", shell.lid, pid, decision) });
      setReleasing(null);
      reload();
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const due = view.players.filter((p) => p.mustDecide).length;
  return (
    <>
      <PageHeader title="Youth Academy" />
      <p className="small text-body-secondary">
        Promote a prospect to give him his first professional contract (three seasons); he joins
        your seniors. Release him and he joins the free-agent pool. To loan a prospect out, promote
        him first, then use Loan out. Players 18 or older on {formatDate(view.decideBy)} must be
        decided by then: any you leave are promoted if they're good enough and there's room,
        otherwise released.
      </p>
      <div className="d-flex flex-wrap gap-3 small mb-2" data-testid="academy-summary">
        <span className={full ? "text-danger" : ""}>
          Seniors {view.seniors}/{view.maxSeniors}
        </span>
        <span>
          Youth academy dial {view.youthDial} (
          <Link to={leaguePath(shell.lid, "club-finances")}>Finances</Link>): more and better
          youngsters each 1 July
        </span>
        {due > 0 && (
          <span className="text-warning-emphasis">
            {due} to decide by {formatDate(view.decideBy)}
          </span>
        )}
      </div>
      {note && (
        <div
          className={`alert ${note.ok ? "alert-success" : "alert-danger"} py-2 small`}
          data-testid="academy-note"
        >
          {note.text}
        </div>
      )}
      <DataTable
        testId="academy"
        rows={view.players}
        rowKey={(p) => p.pid}
        pageSize={0}
        initialSort={{ key: "pot", desc: true }}
        empty="No one in the academy. New youngsters arrive each 1 July."
        columns={[
          {
            key: "name",
            label: "Name",
            value: (p) => p.name,
            render: (p) => (
              <>
                <PlayerLink pid={p.pid} name={p.name} />
                {p.mustDecide && (
                  <span
                    className="badge text-bg-warning ms-1"
                    title={`18 or older on ${formatDate(view.decideBy)}`}
                  >
                    decide by 1 July
                  </span>
                )}
              </>
            ),
          },
          { key: "pos", label: "Pos", value: (p) => p.position },
          { key: "age", label: "Age", value: (p) => p.age, align: "end", desc: false },
          { key: "nat", label: "Nat", value: (p) => p.nationality },
          { key: "ovr", label: "OVR", value: (p) => p.ovr, align: "end" },
          { key: "pot", label: "POT", value: (p) => p.pot, align: "end" },
          {
            key: "change",
            label: "Last update",
            title: "OVR change at the last development update",
            value: (p) => p.change,
            render: (p) =>
              p.change === null ? (
                ""
              ) : (
                <span className={p.change > 0 ? "text-success" : p.change < 0 ? "text-danger" : ""}>
                  {p.change > 0 ? `+${p.change}` : p.change}
                </span>
              ),
            align: "end",
          },
          {
            key: "wage",
            label: "Pro wage",
            title: "His wage a year on a first professional contract now",
            value: (p) => p.wage,
            render: (p) => formatEuros(p.wage),
            align: "end",
          },
          {
            key: "act",
            label: "",
            render: (p) =>
              releasing === p.pid ? (
                <span className="text-nowrap">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm py-0 me-1"
                    disabled={busy}
                    onClick={() => void decide(p.pid, "release")}
                  >
                    Confirm release
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm py-0"
                    onClick={() => setReleasing(null)}
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <span className="text-nowrap">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm py-0 me-1"
                    disabled={busy || full || shell.state.fired !== null}
                    title={full ? "Your squad is full" : undefined}
                    onClick={() => void decide(p.pid, "promote")}
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm py-0"
                    disabled={busy || shell.state.fired !== null}
                    onClick={() => setReleasing(p.pid)}
                  >
                    Release
                  </button>
                </span>
              ),
          },
        ]}
      />
    </>
  );
}
