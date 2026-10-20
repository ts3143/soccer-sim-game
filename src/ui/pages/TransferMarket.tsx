/**
 * Transfer Market (SPEC §11): Search (bid for or borrow other clubs' players), Your
 * listed players (the transfer list, releases, loans out), Incoming offers (answer bids
 * for your players) and Loans. Bids, transfers and loans need an open window.
 */
import { useEffect, useState } from "react";
import type { PlayerSearchRow, TransferMarketView } from "../../common/api";
import { POSITIONS } from "../../common/config/ratings";
import { ContractModal } from "../components/ContractModal";
import { DataTable } from "../components/DataTable";
import { PlayerLink, TeamLink } from "../components/links";
import { ListDialog, LoanDialog, ReleaseDialog } from "../components/MarketDialogs";
import { formatDate, formatEuros, formatPercent } from "../format";
import { leaguePath, Link } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";
import { errorText } from "../errors";

const TABS = [
  { key: "search", label: "Search" },
  { key: "listed", label: "Your listed players" },
  { key: "offers", label: "Incoming offers" },
  { key: "loans", label: "Loans" },
] as const;
type Tab = (typeof TABS)[number]["key"];

type Squad = TransferMarketView["squad"][number];
type Dialog =
  | { kind: "talks"; pid: number }
  | { kind: "list"; player: Squad }
  | { kind: "release"; player: Squad }
  | { kind: "loan"; player: { pid: number; name: string }; direction: "in" | "out" };

export function TransferMarket({ params }: { params: string[] }) {
  const { shell } = useShell();
  const tab: Tab = TABS.some((t) => t.key === params[0]) ? (params[0] as Tab) : "search";
  const { data: view, error } = useView("transfer-market", () =>
    toWorker("getTransferMarket", shell.lid),
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const b = view.budget;
  const openBids = view.offers.filter((o) => o.incoming && o.status === "open").length;
  return (
    <>
      <PageHeader title="Transfer Market" />
      <div className="d-flex flex-wrap gap-3 small mb-2" data-testid="market-summary">
        {view.window ? (
          <span className="badge text-bg-success">
            {view.window.id === "summer" ? "Summer" : "Winter"} window until{" "}
            {formatDate(view.window.closes)}
          </span>
        ) : (
          <span className="badge text-bg-secondary">Window closed</span>
        )}
        <span>
          Transfer budget <strong>{formatEuros(b.transfer)}</strong>
        </span>
        <span>
          Wage room <strong>{formatEuros(b.wageRoom)}</strong> a year
        </span>
        <span className={b.seniors >= b.maxSeniors ? "text-danger" : ""}>
          Seniors {b.seniors}/{b.maxSeniors}
        </span>
        <span>
          Squad cost {formatPercent(b.squadCostRatio, 0)} of revenue (FFP limit{" "}
          {formatPercent(b.ffpLimit, 0)})
        </span>
        {b.owed > 0 && <span>Owed to released players {formatEuros(b.owed)} a year</span>}
        {b.banned && <span className="text-danger">FFP ban until {formatDate(b.banned)}</span>}
        {b.cashFrozen && (
          <span className="text-danger" data-testid="cash-frozen">
            Cash below zero: transfers frozen
          </span>
        )}
      </div>
      {!view.window && (
        <p className="small text-body-secondary">
          The window is closed: bids, transfers and loans wait for the next one (1 July or 1
          January). Listing, releasing and free agents work at any time.
        </p>
      )}
      <ul className="nav nav-tabs mb-3" data-testid="market-tabs">
        {TABS.map((t) => (
          <li key={t.key} className="nav-item">
            <Link
              to={leaguePath(shell.lid, "transfer-market", t.key)}
              className={`nav-link ${tab === t.key ? "active" : ""}`}
            >
              {t.label}
              {t.key === "offers" && openBids > 0 && (
                <span className="badge rounded-pill text-bg-primary ms-1">{openBids}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {tab === "search" && <Search onDialog={setDialog} disabled={view.fired} />}
      {tab === "listed" && <Listed view={view} onDialog={setDialog} />}
      {tab === "offers" && <Offers view={view} />}
      {tab === "loans" && <Loans view={view} />}
      {dialog?.kind === "talks" && (
        <ContractModal pid={dialog.pid} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "list" && (
        <ListDialog player={dialog.player} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "release" && (
        <ReleaseDialog player={dialog.player} today={view.date} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "loan" && (
        <LoanDialog
          player={dialog.player}
          direction={dialog.direction}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

function Search({ onDialog, disabled }: { onDialog: (d: Dialog) => void; disabled: boolean }) {
  const { shell, version } = useShell();
  const [position, setPosition] = useState("");
  const [league, setLeague] = useState("");
  const [minOvr, setMinOvr] = useState(55);
  const [maxAge, setMaxAge] = useState(35);
  const [rows, setRows] = useState<PlayerSearchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    toWorker("searchPlayers", shell.lid, {
      position: position || undefined,
      leagueId: league || undefined,
      minOvr,
      maxAge,
      limit: 100,
    })
      .then((r) => alive && setRows(r))
      .catch((e: unknown) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [shell.lid, position, league, minOvr, maxAge, version]);
  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2 small">
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        >
          <option value="">All positions</option>
          {POSITIONS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          className="form-select form-select-sm w-auto"
          aria-label="League"
          value={league}
          onChange={(e) => setLeague(e.target.value)}
        >
          <option value="">All leagues</option>
          {shell.leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label htmlFor="search-min-ovr">OVR from</label>
        <input
          id="search-min-ovr"
          type="number"
          className="form-control form-control-sm"
          style={{ width: 70 }}
          value={minOvr}
          onChange={(e) => setMinOvr(Number(e.target.value) || 0)}
        />
        <label htmlFor="search-max-age">age up to</label>
        <input
          id="search-max-age"
          type="number"
          className="form-control form-control-sm"
          style={{ width: 70 }}
          value={maxAge}
          onChange={(e) => setMaxAge(Number(e.target.value) || 99)}
        />
        <span className="text-body-secondary">The best 100 matches, other clubs' players.</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {!rows ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          testId="market-search"
          rows={rows}
          rowKey={(r) => r.pid}
          pageSize={25}
          search={(r) => `${r.name} ${r.club ?? ""}`}
          empty="Nobody matches."
          columns={[
            {
              key: "name",
              label: "Name",
              value: (r) => r.name,
              render: (r) => <PlayerLink pid={r.pid} name={r.name} />,
            },
            { key: "club", label: "Club", value: (r) => r.club ?? "" },
            { key: "pos", label: "Pos", value: (r) => r.position },
            { key: "age", label: "Age", value: (r) => r.age, align: "end", desc: false },
            { key: "ovr", label: "OVR", value: (r) => r.ovr, align: "end" },
            { key: "pot", label: "POT", value: (r) => r.pot, align: "end" },
            {
              key: "value",
              label: "Value",
              value: (r) => r.value,
              render: (r) => formatEuros(r.value),
              align: "end",
            },
            {
              key: "wage",
              label: "Wage",
              value: (r) => r.wage,
              render: (r) => formatEuros(r.wage),
              align: "end",
            },
            {
              key: "until",
              label: "Until",
              value: (r) => r.expires ?? "",
              render: (r) => (r.expires ? r.expires.slice(0, 4) : ""),
            },
            {
              key: "act",
              label: "",
              render: (r) => (
                <span className="text-nowrap">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm py-0 me-1"
                    disabled={disabled}
                    onClick={() => onDialog({ kind: "talks", pid: r.pid })}
                  >
                    Bid
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm py-0"
                    disabled={disabled}
                    onClick={() =>
                      onDialog({
                        kind: "loan",
                        player: { pid: r.pid, name: r.name },
                        direction: "in",
                      })
                    }
                  >
                    Loan
                  </button>
                </span>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

function Listed({ view, onDialog }: { view: TransferMarketView; onDialog: (d: Dialog) => void }) {
  const listed = view.squad.filter((p) => p.listed !== null);
  const off = view.fired;
  const action = (label: string, d: Dialog, kind = "outline-primary") => (
    <button
      type="button"
      className={`btn btn-${kind} btn-sm py-0 me-1`}
      disabled={off}
      onClick={() => onDialog(d)}
    >
      {label}
    </button>
  );
  return (
    <>
      <h2 className="h6">On your transfer list</h2>
      <DataTable
        testId="listed-players"
        rows={listed}
        rowKey={(p) => p.pid}
        pageSize={0}
        empty="Nobody is listed. List a player below: clubs that need him bid near your price."
        columns={[
          {
            key: "name",
            label: "Name",
            value: (p) => p.name,
            render: (p) => <PlayerLink pid={p.pid} name={p.name} />,
          },
          { key: "pos", label: "Pos", value: (p) => p.position },
          { key: "ovr", label: "OVR", value: (p) => p.ovr, align: "end" },
          {
            key: "value",
            label: "Value",
            value: (p) => p.value,
            render: (p) => formatEuros(p.value),
            align: "end",
          },
          {
            key: "asking",
            label: "Asking",
            value: (p) => p.listed?.asking ?? 0,
            render: (p) => formatEuros(p.listed?.asking ?? 0),
            align: "end",
          },
          {
            key: "since",
            label: "Listed",
            value: (p) => p.listed?.date ?? "",
            render: (p) => (p.listed ? formatDate(p.listed.date) : ""),
          },
          { key: "bids", label: "Open bids", value: (p) => p.openBids, align: "end" },
          {
            key: "act",
            label: "",
            render: (p) => action("Change", { kind: "list", player: p }),
          },
        ]}
      />
      <h2 className="h6 mt-4">Your players</h2>
      <DataTable
        testId="market-squad"
        rows={view.squad}
        rowKey={(p) => p.pid}
        pageSize={0}
        columns={[
          {
            key: "name",
            label: "Name",
            value: (p) => p.name,
            render: (p) => (
              <>
                <PlayerLink pid={p.pid} name={p.name} />
                {p.listed && <span className="badge text-bg-info ms-1">listed</span>}
              </>
            ),
          },
          { key: "pos", label: "Pos", value: (p) => p.position },
          { key: "age", label: "Age", value: (p) => p.age, align: "end", desc: false },
          { key: "ovr", label: "OVR", value: (p) => p.ovr, align: "end" },
          { key: "pot", label: "POT", value: (p) => p.pot, align: "end" },
          {
            key: "value",
            label: "Value",
            value: (p) => p.value,
            render: (p) => formatEuros(p.value),
            align: "end",
          },
          {
            key: "wage",
            label: "Wage",
            value: (p) => p.wage,
            render: (p) => formatEuros(p.wage),
            align: "end",
          },
          {
            key: "until",
            label: "Until",
            value: (p) => p.expires ?? "",
            render: (p) => (p.expires ? p.expires.slice(0, 4) : ""),
          },
          {
            key: "act",
            label: "",
            render: (p) => (
              <span className="text-nowrap">
                {action(p.listed ? "Listed" : "List", { kind: "list", player: p })}
                {action(
                  "Loan out",
                  { kind: "loan", player: { pid: p.pid, name: p.name }, direction: "out" },
                  "outline-secondary",
                )}
                {action("Release", { kind: "release", player: p }, "outline-danger")}
              </span>
            ),
          },
        ]}
      />
      {view.released.length > 0 && (
        <>
          <h2 className="h6 mt-4">Released, still paid</h2>
          <table className="table table-sm small" data-testid="released">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-end">Wage a year</th>
                <th>Until</th>
              </tr>
            </thead>
            <tbody>
              {view.released.map((r) => (
                <tr key={r.pid}>
                  <td>
                    <PlayerLink pid={r.pid} name={r.name} />
                  </td>
                  <td className="text-end">{formatEuros(r.wage)}</td>
                  <td>{formatDate(r.until)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function Offers({ view }: { view: TransferMarketView }) {
  const { shell, reload } = useShell();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answer = async (oid: number, accept: boolean) => {
    setBusy(oid);
    setError(null);
    try {
      await toWorker("respondToOffer", shell.lid, oid, accept);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const open = view.offers.filter((o) => o.incoming && o.status === "open");
  return (
    <>
      <h2 className="h6">Bids for your players</h2>
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {open.length === 0 ? (
        <p className="small text-body-secondary" data-testid="no-offers">
          No open bids. AI clubs bid for players they need on their market days in the windows;
          listed players draw bids near your price.
        </p>
      ) : (
        <table className="table table-sm small align-middle" data-testid="open-offers">
          <thead>
            <tr>
              <th>Player</th>
              <th>From</th>
              <th className="text-end">Fee</th>
              <th>Until</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {open.map((o) => (
              <tr key={o.oid}>
                <td>
                  <PlayerLink pid={o.pid} name={o.name} />
                </td>
                <td>{o.from}</td>
                <td className="text-end">{formatEuros(o.fee)}</td>
                <td>{formatDate(o.expires)}</td>
                <td className="text-nowrap">
                  <button
                    type="button"
                    className="btn btn-success btn-sm py-0 me-1"
                    disabled={busy !== null || view.fired}
                    onClick={() => void answer(o.oid, true)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm py-0"
                    disabled={busy !== null || view.fired}
                    onClick={() => void answer(o.oid, false)}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 className="h6 mt-4">All bids this season</h2>
      <DataTable
        testId="all-offers"
        rows={view.offers}
        rowKey={(o) => o.oid}
        pageSize={25}
        empty="No bids yet."
        columns={[
          {
            key: "dir",
            label: "",
            value: (o) => (o.incoming ? "For yours" : "By you"),
          },
          {
            key: "name",
            label: "Player",
            value: (o) => o.name,
            render: (o) => <PlayerLink pid={o.pid} name={o.name} />,
          },
          { key: "from", label: "From", value: (o) => o.from },
          { key: "to", label: "To", value: (o) => o.to },
          {
            key: "fee",
            label: "Fee",
            value: (o) => o.fee,
            render: (o) => formatEuros(o.fee),
            align: "end",
          },
          { key: "status", label: "Status", value: (o) => o.status },
        ]}
      />
    </>
  );
}

function Loans({ view }: { view: TransferMarketView }) {
  const table = (rows: TransferMarketView["loansOut"], testId: string, clubLabel: string) => (
    <DataTable
      testId={testId}
      rows={rows}
      rowKey={(r) => r.pid}
      pageSize={0}
      empty="None."
      columns={[
        {
          key: "name",
          label: "Name",
          value: (r) => r.name,
          render: (r) => <PlayerLink pid={r.pid} name={r.name} />,
        },
        { key: "pos", label: "Pos", value: (r) => r.position },
        { key: "age", label: "Age", value: (r) => r.age, align: "end", desc: false },
        { key: "ovr", label: "OVR", value: (r) => r.ovr, align: "end" },
        {
          key: "club",
          label: clubLabel,
          value: (r) => r.club.name,
          render: (r) => <TeamLink team={r.club} />,
        },
        {
          key: "until",
          label: "Until",
          value: (r) => r.until,
          render: (r) => formatDate(r.until),
        },
        {
          key: "share",
          label: "Loan club pays",
          value: (r) => r.wageShare,
          render: (r) => formatPercent(r.wageShare, 0),
          align: "end",
        },
      ]}
    />
  );
  return (
    <>
      <h2 className="h6">Your players out on loan</h2>
      {table(view.loansOut, "loans-out", "At")}
      <h2 className="h6 mt-4">Loanees at your club</h2>
      {table(view.loansIn, "loans-in", "From")}
      <p className="small text-body-secondary mt-3">
        Loan a player out from "Your listed players", or borrow one with the Loan button in Search.
      </p>
    </>
  );
}
