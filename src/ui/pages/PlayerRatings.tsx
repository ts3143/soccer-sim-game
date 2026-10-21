/** Player Ratings (SPEC §11): every player's 22 ratings, filterable by league and position. */
import { useState } from "react";
import type { PlayerRatingsView } from "../../common/api";
import { POSITIONS } from "../../common/config/ratings";
import { DataTable, type Column } from "../components/DataTable";
import { PlayerLink, TeamLink } from "../components/links";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

type Row = PlayerRatingsView["rows"][number];

export function PlayerRatings() {
  const { shell } = useShell();
  const { data: view, error } = useView("player-ratings", () =>
    toWorker("getPlayerRatings", shell.lid),
  );
  const [league, setLeague] = useState("all");
  const [position, setPosition] = useState("all");
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const rows = view.rows.filter(
    (r) =>
      (league === "all" ||
        (league === "free" ? r.status === "freeAgent" : r.leagueId === league)) &&
      (position === "all" || r.position === position),
  );
  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Name",
      value: (r) => r.name,
      render: (r) => <PlayerLink pid={r.pid} name={r.name} nationality={r.nationality} />,
    },
    {
      key: "club",
      label: "Club",
      value: (r) => r.club?.name ?? "",
      render: (r) =>
        r.club ? (
          <TeamLink team={r.club} short />
        ) : (
          <span className="text-body-secondary">free</span>
        ),
    },
    { key: "pos", label: "Pos", value: (r) => r.position },
    { key: "age", label: "Age", value: (r) => r.age, align: "end" },
    { key: "ovr", label: "OVR", value: (r) => r.ovr, align: "end" },
    { key: "pot", label: "POT", value: (r) => r.pot, align: "end" },
    ...view.codes.map((c, i): Column<Row> => ({
      key: c.code,
      label: c.code.toUpperCase(),
      title: c.name,
      value: (r) => r.ratings[i] ?? 0,
      align: "end",
    })),
  ];
  return (
    <>
      <PageHeader title="Player Ratings" />
      <div className="d-flex flex-wrap gap-2 mb-2">
        <select
          className="form-select form-select-sm w-auto"
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
          <option value="free">Free agents</option>
        </select>
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
      </div>
      <DataTable
        key={`${league}/${position}`}
        testId="player-ratings"
        rows={rows}
        rowKey={(r) => r.pid}
        pageSize={50}
        search={(r) => `${r.name} ${r.club?.name ?? ""}`}
        initialSort={{ key: "ovr", desc: true }}
        rowClass={(r) => (r.club?.cid === shell.userCid ? "fw-semibold" : "")}
        columns={columns}
      />
    </>
  );
}
