/**
 * Re-sign Players (SPEC §17.6, §17.8; ZenGM's page): the user's players whose contracts end
 * this 30 June, whether each would talk and what he asks, against the cap. They can be
 * re-signed only in the re-signing period (from the draft to 30 June), over the cap too;
 * anyone not re-signed leaves on 1 July.
 */
import { useState } from "react";
import { CapSummary } from "../components/CapSummary";
import { ContractModal } from "../components/ContractModal";
import { DataTable } from "../components/DataTable";
import { PlayerLink } from "../components/links";
import { formatDate, formatEuros } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function ResignPlayers() {
  const { shell } = useShell();
  const { data: view, error } = useView("resigning", () => toWorker("getResigning", shell.lid));
  const [talking, setTalking] = useState<number | null>(null);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const { next } = view;
  return (
    <>
      <PageHeader title="Re-sign Players" />
      <div
        className={`alert ${view.open ? "alert-success" : "alert-light"} py-2 small`}
        data-testid="resigning-status"
      >
        {view.open
          ? `The re-signing period is open until ${formatDate(view.closes)}. Anyone not re-signed leaves on 1 July, and AI clubs decide on their own players as it closes.`
          : `Contracts are renewed only in the re-signing period, from ${formatDate(view.opens)} (after the draft) to ${formatDate(view.closes)}. Until then, here is who would talk.`}
      </div>
      {view.cap && (
        <div className="mb-2">
          <CapSummary cap={view.cap} />
        </div>
      )}
      <p className="small" data-testid="resigning-next">
        Next season: <strong>{formatEuros(next.committed)}</strong> already committed (contracts
        running past {formatDate(view.closes)} and wages owed to released players)
        {next.cap !== null && (
          <>
            {" "}
            against a cap of <strong>{formatEuros(next.cap)}</strong> in {next.league}:{" "}
            {next.committed <= next.cap
              ? `${formatEuros(next.cap - next.committed)} of room`
              : `${formatEuros(next.committed - next.cap)} over`}
          </>
        )}
        . You can re-sign your own players over the cap; their wages count toward the luxury tax.
      </p>
      <DataTable
        testId="resigning"
        rows={view.players}
        rowKey={(r) => r.pid}
        pageSize={0}
        empty="None of your players' contracts end this June."
        columns={[
          {
            key: "name",
            label: "Name",
            value: (r) => r.name,
            render: (r) => <PlayerLink pid={r.pid} name={r.name} nationality={r.nationality} />,
          },
          { key: "pos", label: "Pos", value: (r) => r.position },
          { key: "age", label: "Age", value: (r) => r.age, align: "end", desc: false },
          { key: "ovr", label: "OVR", value: (r) => r.ovr, align: "end" },
          { key: "pot", label: "POT", value: (r) => r.pot, align: "end" },
          {
            key: "wage",
            label: "Wage now",
            value: (r) => r.wage,
            render: (r) => formatEuros(r.wage),
            align: "end",
          },
          {
            key: "mood",
            label: "Mood",
            title: "His mood toward your club",
            value: (r) => r.mood,
            render: (r) =>
              r.willing ? (
                r.mood.toFixed(2)
              ) : (
                <span className="text-danger" title="Won't negotiate with your club">
                  {r.mood.toFixed(2)} ✕
                </span>
              ),
            align: "end",
          },
          {
            key: "ask",
            label: "Asks from",
            title: "His lowest wage ask a year for a new contract (over 1–5 years)",
            value: (r) => r.ask,
            render: (r) => formatEuros(r.ask),
            align: "end",
          },
          {
            key: "talk",
            label: "",
            render: (r) => (
              <button
                type="button"
                className="btn btn-outline-primary btn-sm py-0"
                disabled={shell.state.fired !== null}
                onClick={() => setTalking(r.pid)}
              >
                Negotiate
              </button>
            ),
          },
        ]}
      />
      {talking !== null && <ContractModal pid={talking} onClose={() => setTalking(null)} />}
    </>
  );
}
