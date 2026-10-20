/**
 * Free Agents (SPEC §7.5, §11): every unsigned player, what he asks a year at your club,
 * and whether he would talk. They can be signed at any time, inside or outside a window.
 */
import { useState } from "react";
import { POSITIONS } from "../../common/config/ratings";
import { ContractModal } from "../components/ContractModal";
import { DataTable } from "../components/DataTable";
import { PlayerLink } from "../components/links";
import { formatDate, formatEuros } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function FreeAgents() {
  const { shell } = useShell();
  const { data: view, error } = useView("free-agents", () => toWorker("getFreeAgents", shell.lid));
  const [position, setPosition] = useState("all");
  const [affordable, setAffordable] = useState(false);
  const [talking, setTalking] = useState<number | null>(null);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const rows = view.rows.filter(
    (r) =>
      (position === "all" || r.position === position) &&
      (!affordable || (r.willing && r.ask <= view.wageRoom)),
  );
  const full = view.seniors >= view.maxSeniors;
  return (
    <>
      <PageHeader title="Free Agents" />
      <p className="small text-body-secondary">
        Players without a club. They can be signed at any time, inside or outside a transfer window,
        with no fee; their asks fall the longer they go unsigned.
      </p>
      <div className="d-flex flex-wrap gap-3 small mb-2" data-testid="free-agents-summary">
        <span>
          Wage room <strong>{formatEuros(view.wageRoom)}</strong> a year
        </span>
        <span className={full ? "text-danger" : ""}>
          Seniors {view.seniors}/{view.maxSeniors}
        </span>
        {view.banned && (
          <span className="text-danger">FFP transfer ban until {formatDate(view.banned)}</span>
        )}
      </div>
      <div className="d-flex flex-wrap gap-2 mb-2 align-items-center">
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        >
          <option value="all">All positions</option>
          {POSITIONS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <div className="form-check form-switch small mb-0">
          <input
            id="fa-affordable"
            className="form-check-input"
            type="checkbox"
            checked={affordable}
            onChange={(e) => setAffordable(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="fa-affordable">
            Only willing players within my wage room
          </label>
        </div>
      </div>
      <DataTable
        key={`${position}/${affordable}`}
        testId="free-agents"
        rows={rows}
        rowKey={(r) => r.pid}
        pageSize={50}
        search={(r) => r.name}
        empty="No free agents match."
        columns={[
          {
            key: "name",
            label: "Name",
            value: (r) => r.name,
            render: (r) => <PlayerLink pid={r.pid} name={r.name} />,
          },
          { key: "pos", label: "Pos", value: (r) => r.position },
          { key: "age", label: "Age", value: (r) => r.age, align: "end", desc: false },
          { key: "ovr", label: "OVR", value: (r) => r.ovr, align: "end" },
          { key: "pot", label: "POT", value: (r) => r.pot, align: "end" },
          {
            key: "value",
            label: "Value",
            value: (r) => r.value,
            render: (r) => formatEuros(r.value),
            align: "end",
          },
          {
            key: "ask",
            label: "Asks from",
            title: "His lowest wage ask a year at your club (over 1–5 years)",
            value: (r) => r.ask,
            render: (r) => (
              <span className={r.ask > view.wageRoom ? "text-danger" : ""}>
                {formatEuros(r.ask)}
              </span>
            ),
            align: "end",
          },
          {
            key: "mood",
            label: "Mood",
            title: "His mood toward your club",
            value: (r) => r.mood,
            render: (r) =>
              r.willing ? (
                r.mood.toFixed(1)
              ) : (
                <span className="text-danger" title="Won't negotiate with your club">
                  {r.mood.toFixed(1)} ✕
                </span>
              ),
            align: "end",
          },
          {
            key: "days",
            label: "Unsigned",
            title: "Days without a club",
            value: (r) => r.daysFree,
            render: (r) => `${r.daysFree} d`,
            align: "end",
          },
          {
            key: "talk",
            label: "",
            render: (r) => (
              <button
                type="button"
                className="btn btn-outline-primary btn-sm py-0"
                disabled={view.fired}
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
