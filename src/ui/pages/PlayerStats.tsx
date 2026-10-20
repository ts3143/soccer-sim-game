/** Player Stats (SPEC §11): a season's stats per player and club, per competition, per 90. */
import { useState } from "react";
import type { PlayerStatsView } from "../../common/api";
import { POSITIONS } from "../../common/config/ratings";
import { DataTable, type Column } from "../components/DataTable";
import { PlayerLink, TeamLink } from "../components/links";
import { leaguePath, navigate } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

type Row = PlayerStatsView["rows"][number];

export function PlayerStats({ params }: { params: string[] }) {
  const { shell } = useShell();
  const season = params[0] ? Number(params[0]) : shell.state.season;
  const competition = params[1] ?? null;
  const { data: view, error } = useView(`player-stats/${season}/${competition}`, () =>
    toWorker("getPlayerStats", shell.lid, season, competition),
  );
  const [league, setLeague] = useState("all");
  const [position, setPosition] = useState("all");
  const [per90, setPer90] = useState(false);
  const [minMinutes, setMinMinutes] = useState(0);
  const p90 = (r: Row, v: number) => (per90 ? (v / Math.max(1, r.minutes)) * 90 : v);
  const fmt = (v: number) => (per90 ? v.toFixed(2) : String(Math.round(v * 10) / 10));
  const count = (
    key: string,
    label: string,
    title: string,
    get: (r: Row) => number,
  ): Column<Row> => ({
    key,
    label,
    title: per90 ? `${title} per 90 minutes` : title,
    value: (r) => p90(r, get(r)),
    render: (r) => fmt(p90(r, get(r))),
    align: "end",
  });
  const columns: Column<Row>[] = [
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
      render: (r) => <TeamLink team={r.club} short />,
    },
    { key: "pos", label: "Pos", value: (r) => r.position },
    { key: "age", label: "Age", value: (r) => r.age, align: "end" },
    { key: "apps", label: "Apps", title: "Appearances", value: (r) => r.appearances, align: "end" },
    { key: "min", label: "Min", title: "Minutes", value: (r) => r.minutes, align: "end" },
    count("g", "G", "Goals", (r) => r.goals),
    count("a", "A", "Assists", (r) => r.assists),
    count("xg", "xG", "Expected goals", (r) => r.xg),
    count("xa", "xA", "Expected assists", (r) => r.xa),
    count("sh", "Sh", "Shots", (r) => r.shots),
    count("sot", "SoT", "Shots on target", (r) => r.shotsOnTarget),
    count("kp", "KP", "Key passes", (r) => r.keyPasses),
    {
      key: "pass",
      label: "Pass%",
      title: "Passes completed",
      value: (r) => r.passesCompleted / Math.max(1, r.passes),
      render: (r) => `${Math.round((100 * r.passesCompleted) / Math.max(1, r.passes))}%`,
      align: "end",
    },
    count("tkl", "Tkl", "Tackles", (r) => r.tackles),
    count("int", "Int", "Interceptions", (r) => r.interceptions),
    { key: "yc", label: "YC", title: "Yellow cards", value: (r) => r.yellowCards, align: "end" },
    { key: "rc", label: "RC", title: "Red cards", value: (r) => r.redCards, align: "end" },
    {
      key: "rating",
      label: "Rating",
      title: "Average match rating",
      value: (r) => r.rating,
      render: (r) => r.rating?.toFixed(2) ?? "",
      align: "end",
    },
  ];
  return (
    <>
      <PageHeader
        title="Player Stats"
        season={{ season, to: (s) => leaguePath(shell.lid, "player-stats", s) }}
      />
      {error && <div className="alert alert-danger">{error}</div>}
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <select
              className="form-select form-select-sm w-auto"
              aria-label="Competition"
              data-testid="competition-picker"
              value={competition ?? "all"}
              onChange={(e) =>
                navigate(
                  e.target.value === "all"
                    ? leaguePath(shell.lid, "player-stats", season)
                    : leaguePath(shell.lid, "player-stats", season, e.target.value),
                )
              }
            >
              <option value="all">All competitions</option>
              {view.competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="form-select form-select-sm w-auto"
              aria-label="League"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
            >
              <option value="all">Players in every league</option>
              {shell.leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} clubs
                </option>
              ))}
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
            <div className="form-check form-switch small mb-0 ms-2">
              <input
                id="per-90"
                className="form-check-input"
                type="checkbox"
                checked={per90}
                onChange={(e) => {
                  setPer90(e.target.checked);
                  if (e.target.checked && minMinutes < 450) setMinMinutes(450);
                }}
              />
              <label className="form-check-label" htmlFor="per-90">
                Per 90 minutes
              </label>
            </div>
            <label className="small ms-2" htmlFor="min-minutes">
              Min. minutes
            </label>
            <input
              id="min-minutes"
              className="form-control form-control-sm"
              style={{ width: "6em" }}
              value={minMinutes}
              onChange={(e) => setMinMinutes(Number(e.target.value.replace(/\D/g, "")) || 0)}
            />
          </div>
          <DataTable
            key={`${league}/${position}/${minMinutes}`}
            testId="player-stats"
            rows={view.rows.filter(
              (r) =>
                (league === "all" || r.leagueId === league) &&
                (position === "all" || r.position === position) &&
                r.minutes >= minMinutes,
            )}
            rowKey={(r) => `${r.pid}/${r.club.cid}`}
            pageSize={50}
            search={(r) => `${r.name} ${r.club.name}`}
            initialSort={{ key: "g", desc: true }}
            rowClass={(r) => (r.club.cid === shell.userCid ? "fw-semibold" : "")}
            columns={columns}
            empty={
              view.rows.length === 0
                ? "No matches played in this season yet."
                : "Nobody matches these filters."
            }
          />
        </>
      )}
    </>
  );
}
