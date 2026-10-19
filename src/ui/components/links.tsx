/** Links used across the game pages: clubs (crest + name), players, match scores; form badges. */
import type { FormResult, TeamRef } from "../../common/api";
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

export function PlayerLink({ pid, name }: { pid: number; name: string }) {
  const { shell } = useShell();
  return (
    <Link to={leaguePath(shell.lid, "player", pid)} className="text-decoration-none">
      {name}
    </Link>
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
  D: "text-bg-secondary",
  L: "text-bg-danger",
};

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
