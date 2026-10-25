/** Links used across the game pages: clubs (crest + name), players, match scores; form badges. */
import type { ClubMatchView, FormResult, TeamRef } from "../../common/api";
import { formatDate } from "../format";
import { RESULT_LABEL } from "./results";
import { NationalityFlag } from "./PlayerDetails";
import { crestUrl } from "../crests";
import { leaguePath, Link } from "../router";
import { useShell } from "../shell/Shell";

/** A club with its crest, linking to its squad. */
export function TeamLink({ team, short = false }: { team: TeamRef; short?: boolean }) {
  const { shell } = useShell();
  const user = team.cid === shell.userCid;
  return (
    <Link
      to={leaguePath(shell.lid, "squad", team.cid)}
      className={`text-decoration-none text-nowrap ${user ? "fw-semibold" : ""}`}
    >
      <img
        src={crestUrl(team.code)}
        alt=""
        width={16}
        height={18}
        className="me-1 align-text-bottom"
      />
      {short ? team.abbr : team.name}
    </Link>
  );
}

export function PlayerLink({
  pid,
  name,
  nationality,
}: {
  pid: number;
  name: string;
  nationality?: string;
}) {
  const { shell } = useShell();
  return (
    <>
      {nationality && <NationalityFlag nationality={nationality} />}
      <Link to={leaguePath(shell.lid, "player", pid)} className="text-decoration-none">
        {name}
      </Link>
    </>
  );
}

/** A played match's score, linking to its box score; "v" for a fixture still to come. */
export function ScoreLink({ fid, score }: { fid: number; score: string | null }) {
  const { shell } = useShell();
  if (score === null) return <span className="text-body-secondary">v</span>;
  return (
    <Link to={leaguePath(shell.lid, "box-score", fid)} className="font-monospace text-nowrap">
      {score}
    </Link>
  );
}

const FORM_CLASS: Record<FormResult, string> = {
  W: "text-bg-success",
  D: "text-bg-warning",
  L: "text-bg-danger",
};

/** A club's recent matches as W/D/L badges, each linking to its box score. */
export function FormStrip({ matches }: { matches: ClubMatchView[] }) {
  const { shell } = useShell();
  if (matches.length === 0) return <span className="text-body-secondary small">no games yet</span>;
  return (
    <span className="d-inline-flex gap-1">
      {matches.map(({ match, result }) => {
        const r = result ?? "D";
        const label = `${RESULT_LABEL[r]}: ${match.home.name} ${match.score ?? ""} ${match.away.name}, ${match.competitionName}, ${formatDate(match.date)}`;
        return (
          <Link
            key={match.fid}
            to={leaguePath(shell.lid, "box-score", match.fid)}
            className={`badge text-decoration-none ${FORM_CLASS[r]}`}
            style={{ width: "1.6em" }}
            title={label}
            aria-label={label}
          >
            {r}
          </Link>
        );
      })}
    </span>
  );
}

export function FormBadges({ form }: { form: FormResult[] }) {
  if (form.length === 0) return <span className="text-body-secondary small">no games yet</span>;
  return (
    <span className="d-inline-flex gap-1" aria-label={`Form ${form.join("")}`}>
      {form.map((r, i) => (
        <span key={i} className={`badge ${FORM_CLASS[r]}`} style={{ width: "1.6em" }}>
          {r}
        </span>
      ))}
    </span>
  );
}
