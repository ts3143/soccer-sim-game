/**
 * Trade (SPEC §17.6, §17.8; ZenGM style): the other club's squad and picks and yours side
 * by side, a tick box each; a summary of what changes hands, the payrolls against the cap
 * and the squads after, and the rules the trade breaks. "Propose trade" puts it to the
 * other club, which says yes (the trade is made at once) or no; "What would make this
 * work?" asks it what it would want added and loads that trade here.
 */
import { useState } from "react";
import type { TradeAssets, TradeProposal, TradeSideView, TradeView } from "../../common/api";
import { TradeAssetsTable, pickRef, pickText, toggled } from "../components/TradeAssets";
import { TeamLink } from "../components/links";
import { errorText } from "../errors";
import { formatDate, formatEuros } from "../format";
import { leaguePath, navigate } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { loadTrade, noAssets, saveTrade } from "../tradeDraft";
import { toWorker } from "../workerClient";

export function Trade({ params }: { params: string[] }) {
  const { shell } = useShell();
  const saved = loadTrade(shell.lid);
  const others = shell.clubs.filter((c) => c.cid !== shell.userCid);
  const league = shell.clubs.find((c) => c.cid === shell.userCid)?.leagueId;
  const cid =
    params[0] !== undefined
      ? Number(params[0])
      : (saved?.cid ?? (others.find((c) => c.leagueId === league) ?? others[0])?.cid ?? 0);
  const [stored, setStored] = useState<TradeProposal>(
    () => saved ?? { cid, give: noAssets(), get: noAssets() },
  );
  // Another club: its side starts empty, his own stays.
  const proposal: TradeProposal =
    stored.cid === cid ? stored : { cid, give: stored.give, get: noAssets() };
  const setProposal = (p: TradeProposal) => {
    saveTrade(shell.lid, p);
    setStored(p);
  };
  const key = JSON.stringify(proposal);
  const {
    data: view,
    error,
    fresh,
  } = useView(`trade/${key}`, () => toWorker("getTrade", shell.lid, proposal), { stale: true });
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ tone: string; text: string } | null>(null);
  if (error && !view) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  // The trade less what no longer belongs to either club (traded, released), as the
  // worker read it; the next change stores that.
  const current = fresh ? view.proposal : proposal;

  const act = async (run: () => Promise<void>) => {
    setBusy(true);
    setAnswer(null);
    try {
      await run();
    } catch (e) {
      setAnswer({ tone: "danger", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const propose = () =>
    act(async () => {
      const reply = await toWorker("proposeTrade", shell.lid, current);
      if (reply.accepted) setProposal({ cid, give: noAssets(), get: noAssets() });
      setAnswer({ tone: reply.accepted ? "success" : "danger", text: reply.message });
    });
  const work = () =>
    act(async () => {
      const reply = await toWorker("makeTradeWork", shell.lid, current);
      if (reply.proposal) setProposal(reply.proposal);
      setAnswer({ tone: reply.proposal ? "info" : "warning", text: reply.message });
    });
  const locked = busy || view.closed !== null || shell.state.fired !== null;
  const empty =
    current.give.pids.length +
      current.give.picks.length +
      current.get.pids.length +
      current.get.picks.length ===
    0;
  const change = (side: "give" | "get", assets: TradeAssets) => {
    setAnswer(null);
    setProposal({ ...current, [side]: assets });
  };
  return (
    <>
      <PageHeader title="Trade">
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Trade with"
          data-testid="trade-club"
          value={cid}
          onChange={(e) => navigate(leaguePath(shell.lid, "trade", Number(e.target.value)))}
        >
          {shell.leagues.map((l) => (
            <optgroup key={l.id} label={l.name}>
              {others
                .filter((c) => c.leagueId === l.id)
                .map((c) => (
                  <option key={c.cid} value={c.cid}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </PageHeader>
      {view.closed && (
        <div className="alert alert-warning py-2 small" data-testid="trade-closed">
          {view.closed}
        </div>
      )}
      <div className="row g-3">
        <div className="col-xl-8">
          <h2 className="h6">
            <TeamLink team={view.other.club} />
          </h2>
          <TradeAssetsTable
            side={view.other}
            selected={current.get}
            onToggle={(item) => change("get", toggled(current.get, item))}
            disabled={locked}
            testId="trade-other"
          />
          <h2 className="h6 mt-4">
            <TeamLink team={view.user.club} />
          </h2>
          <TradeAssetsTable
            side={view.user}
            selected={current.give}
            onToggle={(item) => change("give", toggled(current.give, item))}
            disabled={locked}
            testId="trade-user"
          />
        </div>
        <div className="col-xl-4">
          <section className="card trade-summary" data-testid="trade-summary">
            <div className="card-body small">
              <h2 className="h6">Summary</h2>
              <SummarySide view={view} side={view.user} gives={current.give} />
              <SummarySide view={view} side={view.other} gives={current.get} />
              {view.problems.length > 0 && (
                <ul className="text-danger ps-3 mb-2" data-testid="trade-problems">
                  {view.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="propose-trade"
                  disabled={locked || empty || view.problems.length > 0}
                  onClick={() => void propose()}
                >
                  Propose trade
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  data-testid="trade-work"
                  disabled={locked}
                  onClick={() => void work()}
                >
                  What would make this work?
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={busy || empty}
                  onClick={() => {
                    setAnswer(null);
                    setProposal({ cid, give: noAssets(), get: noAssets() });
                  }}
                >
                  Clear
                </button>
              </div>
              {answer && (
                <div
                  className={`alert alert-${answer.tone} py-2 mt-2 mb-0`}
                  data-testid="trade-answer"
                >
                  {answer.text}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/** What one club gives, and its payroll and squad after the trade. */
function SummarySide({
  view,
  side,
  gives,
}: {
  view: TradeView;
  side: TradeSideView;
  gives: TradeAssets;
}) {
  const players = side.players.filter((p) => gives.pids.includes(p.pid));
  const picks = side.picks.filter((row) =>
    gives.picks.some((ref) => {
      const own = pickRef(row, side.club.cid);
      return (
        own.season === ref.season && own.round === ref.round && own.originalCid === ref.originalCid
      );
    }),
  );
  const over = side.cap !== null && side.payrollAfter > side.cap;
  return (
    <div className="mb-3">
      <div className="fw-semibold">
        {side === view.user ? "You give" : `${side.club.name} give`}
      </div>
      {players.length + picks.length === 0 ? (
        <div className="text-body-secondary">Nothing</div>
      ) : (
        <ul className="ps-3 mb-1">
          {players.map((p) => (
            <li key={p.pid}>
              {p.name} ({p.position}, {p.ovr}/{p.pot}, {formatEuros(p.wage)} until{" "}
              {formatDate(p.expires)})
            </li>
          ))}
          {picks.map((row) => (
            <li key={pickText(row)}>{pickText(row)}</li>
          ))}
        </ul>
      )}
      <div className="text-body-secondary">
        Payroll {formatEuros(side.payroll)} →{" "}
        <span className={over ? "text-danger fw-semibold" : ""}>
          {formatEuros(side.payrollAfter)}
        </span>
        {side.cap !== null && <> (cap {formatEuros(side.cap)})</>}
        {" · "}
        Squad {side.squad} → {side.squadAfter}
      </div>
    </div>
  );
}
