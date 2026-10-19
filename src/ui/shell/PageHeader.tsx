/**
 * A page's title row: the title, and on team pages a team dropdown (any club, grouped by
 * league), on season pages a season dropdown (SPEC §11). Changing either navigates.
 */
import type { ReactNode } from "react";
import { crestUrl } from "../crests";
import { leaguePath, navigate } from "../router";
import { seasonLabel, useShell } from "./Shell";

interface Props {
  title: string;
  /** Team pages: the club shown, and how to build the URL for another club. */
  team?: { cid: number; page: string; extra?: (string | number)[] };
  /** Season pages: the season shown and the page's URL builder for another season. */
  season?: { season: number; to: (season: number) => string };
  children?: ReactNode;
}

export function PageHeader({ title, team, season, children }: Props) {
  const { shell } = useShell();
  const club = team ? shell.clubs.find((c) => c.cid === team.cid) : undefined;
  const seasons = Array.from(
    { length: shell.state.season - shell.firstSeason + 1 },
    (_, i) => shell.state.season - i,
  );
  return (
    <div
      className="d-flex flex-wrap align-items-center gap-2 mb-3 pb-2 border-bottom"
      style={club ? { borderBottomColor: club.colors.primary } : undefined}
      data-testid="page-header"
    >
      {club && <img src={crestUrl(club.code)} alt="" width={32} height={37} />}
      <h1 className="h4 mb-0 me-2">{club ? `${club.name} · ${title}` : title}</h1>
      {team && (
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Team"
          data-testid="team-picker"
          value={team.cid}
          onChange={(e) =>
            navigate(
              leaguePath(shell.lid, team.page, Number(e.target.value), ...(team.extra ?? [])),
            )
          }
        >
          {shell.leagues.map((league) => (
            <optgroup key={league.id} label={league.name}>
              {shell.clubs
                .filter((c) => c.leagueId === league.id)
                .map((c) => (
                  <option key={c.cid} value={c.cid}>
                    {c.name}
                    {c.cid === shell.userCid ? " (you)" : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      )}
      {season && (
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Season"
          data-testid="season-picker"
          value={season.season}
          onChange={(e) => navigate(season.to(Number(e.target.value)))}
        >
          {seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
            </option>
          ))}
        </select>
      )}
      {children}
    </div>
  );
}
