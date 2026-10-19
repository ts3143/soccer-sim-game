/** Power Rankings (SPEC §11): clubs by current strength and form. */
import { useState } from "react";
import { DataTable } from "../components/DataTable";
import { FormBadges, TeamLink } from "../components/links";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function PowerRankings() {
  const { shell } = useShell();
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  const [league, setLeague] = useState(user?.leagueId ?? "all");
  const { data: view, error } = useView("power", () => toWorker("getPowerRankings", shell.lid));
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const rows = view.rows
    .filter((r) => league === "all" || r.leagueId === league)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const leagueName = (id: string) => shell.leagues.find((l) => l.id === id)?.name ?? id;
  return (
    <>
      <PageHeader title="Power Rankings" />
      <p className="small text-body-secondary">
        Score = the strength of the best XI available now, plus three points per goal of league goal
        difference a game (up to ±2).
      </p>
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
        testId="power-rankings"
        rows={rows}
        rowKey={(r) => r.team.cid}
        pageSize={0}
        initialSort={{ key: "rank", desc: false }}
        rowClass={(r) => (r.team.cid === shell.userCid ? "fw-semibold" : "")}
        columns={[
          { key: "rank", label: "#", value: (r) => r.rank, align: "end", desc: false },
          {
            key: "club",
            label: "Club",
            value: (r) => r.team.name,
            render: (r) => <TeamLink team={r.team} />,
          },
          ...(league === "all"
            ? [
                {
                  key: "league",
                  label: "League",
                  value: (r: (typeof rows)[number]) => leagueName(r.leagueId),
                },
              ]
            : []),
          {
            key: "score",
            label: "Score",
            value: (r) => r.score,
            render: (r) => r.score.toFixed(1),
            align: "end",
          },
          {
            key: "str",
            label: "Strength",
            title: "Best XI available now",
            value: (r) => r.strength,
            render: (r) => r.strength.toFixed(1),
            align: "end",
          },
          {
            key: "full",
            label: "Full strength",
            title: "Best XI with nobody injured",
            value: (r) => r.fullStrength,
            render: (r) => r.fullStrength.toFixed(1),
            align: "end",
          },
          { key: "form", label: "Form", render: (r) => <FormBadges form={r.form} /> },
          {
            key: "gd",
            label: "GD/game",
            title: "League goal difference per game",
            value: (r) => r.goalDifferencePerGame,
            render: (r) =>
              (r.goalDifferencePerGame > 0 ? "+" : "") + r.goalDifferencePerGame.toFixed(2),
            align: "end",
          },
          {
            key: "pos",
            label: "Pos",
            title: "League position",
            value: (r) => r.position,
            align: "end",
            desc: false,
          },
        ]}
      />
    </>
  );
}
