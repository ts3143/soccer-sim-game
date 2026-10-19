/** Injuries (SPEC §11): every injured player in the world, longest out first. */
import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { PlayerLink, TeamLink } from "../components/links";
import { formatDate } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function Injuries() {
  const { shell } = useShell();
  const { data: view, error } = useView("injuries", () => toWorker("getInjuries", shell.lid));
  const [league, setLeague] = useState("all");
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const rows = view.rows.filter((r) => league === "all" || r.leagueId === league);
  return (
    <>
      <PageHeader title="Injuries">
        <span className="small text-body-secondary">{view.rows.length} players out</span>
      </PageHeader>
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
      <DataTable
        key={league}
        testId="injuries"
        rows={rows}
        rowKey={(r) => r.pid}
        pageSize={50}
        search={(r) => `${r.name} ${r.club.name} ${r.type}`}
        empty="No one is injured."
        rowClass={(r) => (r.club.cid === shell.userCid ? "table-primary" : "")}
        columns={[
          {
            key: "name",
            label: "Name",
            value: (r) => r.name,
            render: (r) => <PlayerLink pid={r.pid} name={r.name} />,
          },
          {
            key: "club",
            label: "Club",
            value: (r) => r.club.name,
            render: (r) => <TeamLink team={r.club} />,
          },
          { key: "pos", label: "Pos", value: (r) => r.position },
          { key: "ovr", label: "OVR", value: (r) => r.ovr, align: "end" },
          { key: "type", label: "Injury", value: (r) => r.type },
          {
            key: "until",
            label: "Back",
            value: (r) => r.until,
            render: (r) => formatDate(r.until),
            desc: false,
          },
          { key: "days", label: "Days out", value: (r) => r.daysLeft, align: "end" },
        ]}
      />
    </>
  );
}
