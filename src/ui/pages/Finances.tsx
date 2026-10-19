/** Finances overview of all clubs (SPEC §11): revenue, costs, cash, squad cost and FFP. */
import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { TeamLink } from "../components/links";
import { formatEuros, formatPercent } from "../format";
import { leaguePath } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const FFP_BADGE: Record<string, string> = {
  ok: "text-bg-success",
  warned: "text-bg-warning",
  banned: "text-bg-danger",
};

export function Finances({ params }: { params: string[] }) {
  const { shell } = useShell();
  const season = params[0] ? Number(params[0]) : shell.state.season;
  const [league, setLeague] = useState("all");
  const { data: view, error } = useView(`finances/${season}`, () =>
    toWorker("getFinances", shell.lid, season),
  );
  return (
    <>
      <PageHeader
        title="Finances"
        season={{ season, to: (s) => leaguePath(shell.lid, "finances", s) }}
      />
      {error && <div className="alert alert-danger">{error}</div>}
      <select
        className="form-select form-select-sm w-auto mb-2"
        aria-label="League"
        value={league}
        onChange={(e) => setLeague(e.target.value)}
      >
        <option value="all">All leagues</option>
        {shell.leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          <p className="small text-body-secondary">
            {view.current
              ? "This season so far; cash now; wages and squad cost a year at today's contracts."
              : "The season's books; cash at the season's end; squad cost as the 30 June FFP check measured it."}
          </p>
          <DataTable
            key={league}
            testId="finances"
            rows={view.rows.filter((r) => league === "all" || r.leagueId === league)}
            rowKey={(r) => r.team.cid}
            pageSize={0}
            initialSort={{ key: "rev", desc: true }}
            rowClass={(r) => (r.team.cid === shell.userCid ? "fw-semibold" : "")}
            columns={[
              {
                key: "club",
                label: "Club",
                value: (r) => r.team.name,
                render: (r) => <TeamLink team={r.team} />,
              },
              {
                key: "rev",
                label: "Revenue",
                value: (r) => r.revenue,
                render: (r) => formatEuros(r.revenue),
                align: "end",
              },
              {
                key: "exp",
                label: "Expenses",
                value: (r) => r.expenses,
                render: (r) => formatEuros(r.expenses),
                align: "end",
              },
              {
                key: "profit",
                label: "Profit",
                value: (r) => r.profit,
                render: (r) => (
                  <span className={r.profit < 0 ? "text-danger" : "text-success"}>
                    {formatEuros(r.profit)}
                  </span>
                ),
                align: "end",
              },
              {
                key: "cash",
                label: "Cash",
                value: (r) => r.cash,
                render: (r) => (
                  <span className={r.cash < 0 ? "text-danger" : ""}>{formatEuros(r.cash)}</span>
                ),
                align: "end",
              },
              ...(view.current
                ? [
                    {
                      key: "wages",
                      label: "Wages/yr",
                      value: (r: (typeof view.rows)[number]) => r.wages,
                      render: (r: (typeof view.rows)[number]) =>
                        r.wages === null ? "" : formatEuros(r.wages),
                      align: "end" as const,
                    },
                  ]
                : []),
              {
                key: "scr",
                label: "Squad cost",
                title: "Wages and fee amortisation over revenue (FFP limit 70%)",
                value: (r) => r.squadCostRatio,
                render: (r) =>
                  r.squadCostRatio === null ? (
                    ""
                  ) : (
                    <span className={r.squadCostRatio > 0.7 ? "text-danger" : ""}>
                      {formatPercent(r.squadCostRatio, 0)}
                    </span>
                  ),
                align: "end",
              },
              ...(view.current
                ? [
                    {
                      key: "ffp",
                      label: "FFP",
                      value: (r: (typeof view.rows)[number]) => r.ffp,
                      render: (r: (typeof view.rows)[number]) =>
                        r.ffp ? (
                          <span className={`badge ${FFP_BADGE[r.ffp] ?? ""}`}>{r.ffp}</span>
                        ) : (
                          ""
                        ),
                    },
                  ]
                : []),
              { key: "rep", label: "Reputation", value: (r) => r.reputation, align: "end" },
            ]}
          />
        </>
      )}
    </>
  );
}
