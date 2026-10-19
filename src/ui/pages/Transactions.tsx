/** Transactions (SPEC §11): a season's moves, signings, renewals, releases and retirements. */
import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { formatDate, formatEuros } from "../format";
import { leaguePath } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export const TYPE_LABELS: Record<string, string> = {
  transfer: "Transfer",
  loan: "Loan",
  freeAgent: "Free agent",
  renewal: "Renewal",
  release: "Release",
  academyPromotion: "Promotion",
  retirement: "Retirement",
};

export function Transactions({ params }: { params: string[] }) {
  const { shell } = useShell();
  const season = params[0] ? Number(params[0]) : shell.state.season;
  const { data: view, error } = useView(`transactions/${season}`, () =>
    toWorker("getTransactions", shell.lid, season),
  );
  const [type, setType] = useState("all");
  const [club, setClub] = useState("all");
  const rows = (view?.rows ?? []).filter(
    (r) => (type === "all" || r.type === type) && (club === "all" || r.cids.includes(Number(club))),
  );
  return (
    <>
      <PageHeader
        title="Transactions"
        season={{ season, to: (s) => leaguePath(shell.lid, "transactions", s) }}
      />
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="d-flex flex-wrap gap-2 mb-2">
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Club"
          value={club}
          onChange={(e) => setClub(e.target.value)}
        >
          <option value="all">All clubs</option>
          {shell.clubs.map((c) => (
            <option key={c.cid} value={c.cid}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {!view ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          key={`${type}/${club}`}
          testId="transactions"
          rows={rows}
          rowKey={(r) => r.xid}
          pageSize={50}
          search={(r) => r.text}
          empty="No transactions."
          rowClass={(r) => (r.cids.includes(shell.userCid) ? "table-primary" : "")}
          columns={[
            { key: "date", label: "Date", value: (r) => r.date, render: (r) => formatDate(r.date) },
            { key: "type", label: "Type", value: (r) => TYPE_LABELS[r.type] ?? r.type },
            { key: "text", label: "", value: (r) => r.text },
            {
              key: "fee",
              label: "Fee",
              value: (r) => r.fee,
              render: (r) => (r.fee > 0 ? formatEuros(r.fee) : ""),
              align: "end",
            },
          ]}
        />
      )}
    </>
  );
}
