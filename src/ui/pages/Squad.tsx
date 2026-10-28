import { PlayerStatusTags } from "../components/PlayerStatusTags";
import { SkillTags } from "../components/SkillTags";
/** Squad (SPEC §11): any club's players, contracts with expiry badges, condition, value, form. */
import type { SquadPlayerView } from "../../common/api";
import { useState } from "react";
import { ContractModal } from "../components/ContractModal";
import { DataTable, type Column } from "../components/DataTable";
import { PlayerRatings, RatingChange, NationalityFlag } from "../components/PlayerDetails";
import { PlayerLink } from "../components/links";
import { formatDate, formatEuros, ordinal } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

function NameCell({ p }: { p: SquadPlayerView }) {
  const { shell } = useShell();
  return (
    <span className="text-nowrap">
      <PlayerLink pid={p.pid} name={p.name} />
      <SkillTags ratings={p.ratings} position={p.position} />
      <PlayerRatings player={p} />
      <PlayerStatusTags player={p} today={shell.state.date} />
    </span>
  );
}

const senior: Column<SquadPlayerView>[] = [
  { key: "no", label: "#", value: (p) => p.shirtNumber, align: "end", desc: false },
  { key: "name", label: "Name", value: (p) => p.name, render: (p) => <NameCell p={p} /> },
  {
    key: "pos",
    label: "Pos",
    value: (p) => p.position,
    render: (p) => (
      <span title={p.secondary.length ? `Also ${p.secondary.join(", ")}` : undefined}>
        {p.position}
        {p.secondary.length > 0 && (
          <span className="text-body-secondary small"> +{p.secondary.length}</span>
        )}
      </span>
    ),
  },
  { key: "age", label: "Age", value: (p) => p.age, align: "end" },
  {
    key: "ovr",
    label: "OVR",
    value: (p) => p.ovr,
    render: (p) => (
      <span className="text-nowrap">
        {p.ovr}
        <RatingChange value={p.ovrChange} />
      </span>
    ),
    align: "end",
  },
  {
    key: "pot",
    label: "POT",
    value: (p) => p.pot,
    render: (p) => (
      <span className="text-nowrap">
        {p.pot}
        <RatingChange value={p.potChange} />
      </span>
    ),
    align: "end",
  },
  {
    key: "cond",
    label: "Cond",
    title: "Condition",
    value: (p) => p.condition,
    render: (p) => (
      <span
        className={
          p.condition < 75 ? "text-danger" : p.condition < 90 ? "text-warning-emphasis" : ""
        }
      >
        {p.condition}%
      </span>
    ),
    align: "end",
  },
  {
    key: "value",
    label: "Value",
    value: (p) => p.value,
    render: (p) => formatEuros(p.value),
    align: "end",
  },
  {
    key: "wage",
    label: "Wage/yr",
    value: (p) => p.wage,
    render: (p) => (p.wage ? formatEuros(p.wage) : ""),
    align: "end",
  },
  {
    key: "until",
    label: "Until",
    value: (p) => p.expires,
    render: (p) => (p.expires ? formatDate(p.expires) : ""),
    desc: false,
  },
  {
    key: "mood",
    label: "Mood",
    title: "Mood toward the club, −1 to 1",
    value: (p) => p.mood,
    render: (p) =>
      p.mood === null ? (
        ""
      ) : (
        <span className={p.mood < 0 ? "text-danger" : ""}>{p.mood.toFixed(2)}</span>
      ),
    align: "end",
  },
  {
    key: "nat",
    label: "Nat",
    title: "Nationality",
    value: (p) => p.nationality,
    render: (p) => <NationalityFlag nationality={p.nationality} />,
  },
  {
    key: "apps",
    label: "Apps",
    title: "Appearances this season",
    value: (p) => p.season.appearances,
    align: "end",
  },
  { key: "g", label: "G", title: "Goals", value: (p) => p.season.goals, align: "end" },
  { key: "a", label: "A", title: "Assists", value: (p) => p.season.assists, align: "end" },
  {
    key: "rating",
    label: "Rating",
    title: "Average match rating this season",
    value: (p) => p.season.rating,
    render: (p) => p.season.rating?.toFixed(2) ?? "",
    align: "end",
  },
];

const academyColumns: Column<SquadPlayerView>[] = [
  {
    key: "name",
    label: "Name",
    value: (p) => p.name,
    render: (p) => <NameCell p={p} />,
  },
  { key: "pos", label: "Pos", value: (p) => p.position },
  { key: "age", label: "Age", value: (p) => p.age, align: "end" },
  {
    key: "ovr",
    label: "OVR",
    value: (p) => p.ovr,
    render: (p) => (
      <span className="text-nowrap">
        {p.ovr}
        <RatingChange value={p.ovrChange} />
      </span>
    ),
    align: "end",
  },
  {
    key: "pot",
    label: "POT",
    value: (p) => p.pot,
    render: (p) => (
      <span className="text-nowrap">
        {p.pot}
        <RatingChange value={p.potChange} />
      </span>
    ),
    align: "end",
  },
  {
    key: "nat",
    label: "Nat",
    value: (p) => p.nationality,
    render: (p) => <NationalityFlag nationality={p.nationality} />,
  },
  { key: "apps", label: "Apps", value: (p) => p.season.appearances, align: "end" },
];

export function Squad({ params }: { params: string[] }) {
  const { shell } = useShell();
  const cid = params[0] !== undefined ? Number(params[0]) : shell.userCid;
  const [talking, setTalking] = useState<number | null>(null);
  const own = cid === shell.userCid;
  // Talks: a new contract for your own players, a bid for another club's (not loanees).
  const talks: Column<SquadPlayerView> = {
    key: "talks",
    label: "",
    render: (p) =>
      p.status === "club" ? (
        <button
          type="button"
          className="btn btn-outline-primary btn-sm py-0"
          onClick={() => setTalking(p.pid)}
          data-testid="talks-button"
        >
          {own ? "Contract" : "Bid"}
        </button>
      ) : null,
  };
  const { data: view, error } = useView(`squad/${cid}`, () =>
    toWorker("getTeamSquad", shell.lid, cid),
  );
  return (
    <>
      <PageHeader title="Squad" team={{ cid, page: "squad" }} />
      {error && <div className="alert alert-danger">{error}</div>}
      {!view ? (
        <p>Loading…</p>
      ) : (
        <>
          <p className="small text-body-secondary" data-testid="squad-summary">
            {view.team.position ? `${ordinal(view.team.position)} in the ` : ""}
            {view.team.leagueName} · {view.formation} · best XI {view.strength.toFixed(1)} · average
            age {view.averageAge.toFixed(1)} · wages {formatEuros(view.wageBill)} a year ·{" "}
            {view.players.length} seniors, {view.academy.length} in the academy
          </p>
          <DataTable
            testId="squad-table"
            rows={view.players}
            rowKey={(p) => p.pid}
            pageSize={0}
            columns={shell.state.fired ? senior : [...senior, talks]}
          />
          {view.loanedOut.length > 0 && (
            <>
              <h2 className="h6 mt-4">Out on loan</h2>
              <DataTable
                testId="loaned-out"
                rows={view.loanedOut}
                rowKey={(p) => p.pid}
                pageSize={0}
                columns={senior.filter((c) =>
                  ["name", "pos", "age", "ovr", "pot", "wage", "until"].includes(c.key),
                )}
              />
            </>
          )}
          <h2 className="h6 mt-4">Academy</h2>
          <DataTable
            testId="academy-table"
            rows={view.academy}
            rowKey={(p) => p.pid}
            pageSize={0}
            columns={academyColumns}
            empty="No academy players."
          />
        </>
      )}
      {talking !== null && <ContractModal pid={talking} onClose={() => setTalking(null)} />}
    </>
  );
}
