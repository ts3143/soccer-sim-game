/**
 * Finances overview of all clubs (SPEC §11): revenue, costs, cash, squad cost and FFP; under
 * a soft cap (SPEC §17.7) the payroll against each club's cap, or a past season's luxury tax.
 */
import { useState } from "react";
import type { FinancesView } from "../../common/api";
import { type Column, DataTable } from "../components/DataTable";
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
  const capped = shell.world.switches.moneyRule === "softCap";
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
            {capped
              ? view.current
                ? "This season so far; cash now; each payroll a year at today's contracts against the club's cap."
                : "The season's books; cash at the season's end; the luxury tax paid by clubs over their cap and shared by those under it."
              : view.current
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
              ...(capped ? capColumns(view) : ffpColumns(view)),
              { key: "rep", label: "Reputation", value: (r) => r.reputation, align: "end" },
            ]}
          />
        </>
      )}
    </>
  );
}

type Row = FinancesView["rows"][number];

/** Under a soft cap: payroll and cap now; a past season's tax paid and received. */
function capColumns(view: FinancesView): Column<Row>[] {
  if (!view.current) {
    return [
      {
        key: "taxPaid",
        label: "Tax paid",
        value: (r) => r.taxPaid,
        render: (r) => (r.taxPaid ? formatEuros(r.taxPaid) : ""),
        align: "end",
      },
      {
        key: "taxReceived",
        label: "Tax share",
        title: "The luxury tax shared among the tier's clubs under the cap",
        value: (r) => r.taxReceived,
        render: (r) => (r.taxReceived ? formatEuros(r.taxReceived) : ""),
        align: "end",
      },
    ];
  }
  return [
    {
      key: "payroll",
      label: "Payroll",
      title: "Wages under contract and those still owed to released players, a year",
      value: (r) => r.payroll,
      render: (r) =>
        r.payroll === null ? (
          ""
        ) : (
          <span className={r.cap !== null && r.payroll > r.cap ? "text-danger" : ""}>
            {formatEuros(r.payroll)}
          </span>
        ),
      align: "end",
    },
    {
      key: "cap",
      label: "Cap",
      value: (r) => r.cap,
      render: (r) => (r.cap === null ? "" : formatEuros(r.cap)),
      align: "end",
    },
    {
      key: "room",
      label: "Room",
      title: "Cap less payroll (negative: over the cap)",
      value: (r) => (r.cap === null || r.payroll === null ? null : r.cap - r.payroll),
      render: (r) =>
        r.cap === null || r.payroll === null ? (
          ""
        ) : (
          <span className={r.payroll > r.cap ? "text-danger" : ""}>
            {formatEuros(r.cap - r.payroll)}
          </span>
        ),
      align: "end",
    },
  ];
}

function ffpColumns(view: FinancesView): Column<Row>[] {
  return [
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
              r.ffp ? <span className={`badge ${FFP_BADGE[r.ffp] ?? ""}`}>{r.ffp}</span> : "",
          },
        ]
      : []),
  ];
}
