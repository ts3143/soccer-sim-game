/**
 * The Draft (SPEC §17.5, §17.8): this season's lottery pool and its draw, the prospects
 * left and the draft board; on the clock, the user picks here. The drafts held and the
 * classes to come are a dropdown away. A draft is named by the year it's held (June).
 */
import { useState } from "react";
import type { DraftView } from "../../common/api";
import { DataTable } from "../components/DataTable";
import { PlayerLink, TeamLink } from "../components/links";
import { errorText } from "../errors";
import { formatDate, ordinal } from "../format";
import { leaguePath, navigate } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export const draftName = (season: number) => `${season + 1} draft`;

export function Draft({ params }: { params: string[] }) {
  const { shell, reload } = useShell();
  const season = params[0] !== undefined ? Number(params[0]) : null;
  const { data: view, error } = useView(`draft/${season ?? "now"}`, () =>
    toWorker("getDraft", shell.lid, season),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const pick = async (pid: number) => {
    setBusy(true);
    setNote(null);
    try {
      await toWorker("draftProspect", shell.lid, pid);
      reload();
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const current = view.season === shell.state.season;
  return (
    <>
      <PageHeader title="Draft">
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Draft"
          data-testid="draft-picker"
          value={view.season}
          onChange={(e) => {
            const s = Number(e.target.value);
            navigate(
              s === shell.state.season
                ? leaguePath(shell.lid, "draft")
                : leaguePath(shell.lid, "draft", s),
            );
          }}
        >
          {view.seasons.map((s) => (
            <option key={s} value={s}>
              {draftName(s)}
              {s > shell.state.season ? " (class)" : ""}
            </option>
          ))}
        </select>
      </PageHeader>
      <DraftStatus view={view} current={current} />
      {note && <div className="alert alert-danger py-2 small">{note}</div>}
      {view.lottery && <Lottery view={view} />}
      <div className="row g-3">
        {view.status !== "over" && (
          <div className={view.slots.length > 0 ? "col-xl-7" : "col-12"}>
            <h2 className="h6">
              {view.status === "class" ? "The class" : "Prospects"}{" "}
              <span className="text-body-secondary fw-normal">({view.prospects.length})</span>
            </h2>
            <DataTable
              testId="draft-prospects"
              rows={view.prospects}
              rowKey={(r) => r.pid}
              pageSize={25}
              search={(r) => r.name}
              small
              empty="No prospects left."
              columns={[
                {
                  key: "name",
                  label: "Name",
                  value: (r) => r.name,
                  render: (r) => (
                    <PlayerLink pid={r.pid} name={r.name} nationality={r.nationality} />
                  ),
                },
                { key: "pos", label: "Pos", value: (r) => r.position },
                { key: "age", label: "Age", value: (r) => r.age, align: "end", desc: false },
                { key: "ovr", label: "OVR", value: (r) => r.ovr, align: "end" },
                { key: "pot", label: "POT", value: (r) => r.pot, align: "end" },
                ...(view.yourTurn
                  ? [
                      {
                        key: "draft",
                        label: "",
                        render: (r: (typeof view.prospects)[number]) => (
                          <button
                            type="button"
                            className="btn btn-success btn-sm py-0"
                            disabled={busy}
                            onClick={() => void pick(r.pid)}
                          >
                            Draft
                          </button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}
        {view.slots.length > 0 && (
          <div className={view.status === "over" ? "col-12" : "col-xl-5"}>
            <Board view={view} />
          </div>
        )}
      </div>
    </>
  );
}

function DraftStatus({ view, current }: { view: DraftView; current: boolean }) {
  const { shell } = useShell();
  const onClock = view.slots.find((s) => s.pick === view.onTheClock);
  let text: string;
  let tone = "light";
  if (view.status === "class") {
    text = `Prospects for the ${draftName(view.season)} (${formatDate(view.draftDate)}). They develop each summer until then; undrafted, they become free agents on 1 July.`;
  } else if (!current) {
    text = `The ${draftName(view.season)}, held on ${formatDate(view.draftDate)}.`;
  } else if (view.status === "notOrdered") {
    text = `The lottery is drawn on ${formatDate(view.lotteryDate)} and the draft held on ${formatDate(view.draftDate)}: two rounds, the order from this season's tables.`;
  } else if (view.status === "over") {
    text = "The draft is over. Your picks have signed rookie contracts and joined your squad.";
  } else if (view.yourTurn) {
    tone = "success";
    text = `You're on the clock with pick ${view.onTheClock}: draft a prospect below, or Play “To the end of the draft” to let your scouts pick for you.`;
  } else if (shell.state.phase !== "draft") {
    text = `The lottery has set the order. The draft is held on ${formatDate(view.draftDate)}.`;
  } else {
    text = `Pick ${view.onTheClock} is on the clock${onClock ? ` (${onClock.club.name})` : ""}. Play “Until your pick” or “To the end of the draft”.`;
  }
  return (
    <div className={`alert alert-${tone} py-2 small`} data-testid="draft-status">
      {text}
    </div>
  );
}

function Lottery({ view }: { view: DraftView }) {
  const lottery = view.lottery ?? [];
  const drawn = lottery.some((r) => r.pick !== null);
  return (
    <section className="mb-3" data-testid="draft-lottery">
      <h2 className="h6">
        Lottery{" "}
        <span className="text-body-secondary fw-normal small">
          {drawn
            ? `drawn on ${formatDate(view.lotteryDate)}`
            : "if the season ended today: the lottery draws the first picks by these odds; the rest of the pool follow in odds order"}
        </span>
      </h2>
      <div className="table-responsive">
        <table className="table table-sm table-hover small w-auto">
          <thead>
            <tr>
              <th>Club</th>
              <th>Finished</th>
              <th className="text-end" title="Chance at the first pick">
                Odds
              </th>
              {drawn && <th className="text-end">Pick</th>}
            </tr>
          </thead>
          <tbody>
            {lottery.map((r, i) => (
              <tr key={r.club.cid} className={r.club.cid === view.userCid ? "table-primary" : ""}>
                <td>
                  <TeamLink team={r.club} />
                  {r.owner && (
                    <span className="text-body-secondary"> (pick held by {r.owner.name})</span>
                  )}
                </td>
                <td>
                  {r.league}, {ordinal(r.position)}
                </td>
                <td className="text-end">{r.odds}%</td>
                {drawn && (
                  <td className="text-end fw-semibold">
                    {r.pick}
                    {r.pick !== null && r.pick < i + 1 && (
                      <span className="text-success ms-1" title={`Up from ${i + 1} in odds order`}>
                        ▲{i + 1 - r.pick}
                      </span>
                    )}
                    {r.pick !== null && r.pick > i + 1 && (
                      <span className="text-danger ms-1" title={`Down from ${i + 1} in odds order`}>
                        ▼{r.pick - (i + 1)}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Board({ view }: { view: DraftView }) {
  const rounds = [...new Set(view.slots.map((s) => s.round))];
  return (
    <section data-testid="draft-board">
      {rounds.map((round) => (
        <div key={round}>
          <h2 className="h6">Round {round}</h2>
          <div className="table-responsive">
            <table className="table table-sm table-hover small">
              <thead>
                <tr>
                  <th className="text-end">Pick</th>
                  <th>Club</th>
                  <th>Player</th>
                  <th>Pos</th>
                  <th className="text-end">Age</th>
                  <th className="text-end">OVR</th>
                  <th className="text-end">POT</th>
                </tr>
              </thead>
              <tbody>
                {view.slots
                  .filter((s) => s.round === round)
                  .map((s) => (
                    <tr
                      key={s.pick}
                      data-pick={s.pick}
                      className={
                        s.pick === view.onTheClock
                          ? "table-warning"
                          : s.club.cid === view.userCid
                            ? "table-primary"
                            : ""
                      }
                    >
                      <td className="text-end">{s.pick}</td>
                      <td>
                        <TeamLink team={s.club} short />
                        {s.from && (
                          <span className="text-body-secondary" title={`${s.from.name}'s pick`}>
                            {" "}
                            via {s.from.abbr}
                          </span>
                        )}
                      </td>
                      {s.player ? (
                        <>
                          <td>
                            <PlayerLink
                              pid={s.player.pid}
                              name={s.player.name}
                              nationality={s.player.nationality}
                            />
                          </td>
                          <td>{s.player.position}</td>
                          <td className="text-end">{s.player.age}</td>
                          <td className="text-end">{s.player.ovr}</td>
                          <td className="text-end">{s.player.pot}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="text-body-secondary">
                          {s.pick === view.onTheClock ? "On the clock" : ""}
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
