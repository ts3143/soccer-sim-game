/** Weekly Schedule (SPEC §11): one week's fixtures in every competition, day by day. */
import { useState } from "react";
import type { MatchView } from "../../common/api";
import { ScoreLink, TeamLink } from "../components/links";
import { formatDate } from "../format";
import { leaguePath, navigate } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function Schedule({ params }: { params: string[] }) {
  const { shell } = useShell();
  const week = params[0] ?? null;
  const [competition, setCompetition] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const { data: view, error } = useView(`schedule/${week}`, () =>
    toWorker("getSchedule", shell.lid, week),
  );
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const index = view.weeks.findIndex((w) => w.start === view.week);
  const go = (i: number) => {
    const w = view.weeks[i];
    if (w) navigate(leaguePath(shell.lid, "schedule", w.start));
  };
  const competitions = [...new Map(view.matches.map((m) => [m.competition, m.competitionName]))];
  const mine = (m: MatchView) => m.home.cid === shell.userCid || m.away.cid === shell.userCid;
  const shown = view.matches.filter(
    (m) => (competition === "all" || m.competition === competition) && (!onlyMine || mine(m)),
  );
  const days = [...new Set(shown.map((m) => m.date))];
  return (
    <>
      <PageHeader title="Schedule" />
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={index <= 0}
          onClick={() => go(index - 1)}
        >
          ‹ Previous week
        </button>
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Week"
          data-testid="week-picker"
          value={view.week}
          onChange={(e) => navigate(leaguePath(shell.lid, "schedule", e.target.value))}
        >
          {view.weeks.map((w) => (
            <option key={w.start} value={w.start}>
              {formatDate(w.start)} – {formatDate(w.end)} ({w.matches} matches)
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={index >= view.weeks.length - 1}
          onClick={() => go(index + 1)}
        >
          Next week ›
        </button>
        <select
          className="form-select form-select-sm w-auto ms-lg-3"
          aria-label="Competition"
          value={competition}
          onChange={(e) => setCompetition(e.target.value)}
        >
          <option value="all">All competitions</option>
          {competitions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div className="form-check form-switch small mb-0">
          <input
            id="only-mine"
            className="form-check-input"
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="only-mine">
            Only my club
          </label>
        </div>
      </div>
      {days.length === 0 ? (
        <p className="text-body-secondary">No matches this week.</p>
      ) : (
        days.map((day) => (
          <section key={day} className="mb-3" data-testid="schedule-day">
            <h2 className="h6 border-bottom pb-1">
              {dayFormat.format(new Date(`${day}T00:00:00Z`))}
            </h2>
            <table className="table table-sm small mb-0">
              <tbody>
                {shown
                  .filter((m) => m.date === day)
                  .map((m) => (
                    <tr key={m.fid} className={mine(m) ? "table-primary" : ""}>
                      <td className="text-body-secondary text-nowrap" style={{ width: "14em" }}>
                        {m.competitionName}
                        {m.round && !/^\d+$/.test(m.round) ? ` · ${m.round}` : ""}
                      </td>
                      <td className="text-end">
                        <TeamLink team={m.home} />
                      </td>
                      <td className="text-center" style={{ width: "9em" }}>
                        <ScoreLink fid={m.fid} score={m.score} />
                      </td>
                      <td>
                        <TeamLink team={m.away} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </>
  );
}
