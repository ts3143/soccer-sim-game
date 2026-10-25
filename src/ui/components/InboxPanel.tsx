/**
 * The inbox (SPEC §11), on the Dashboard: board messages, bids, contract warnings, FFP,
 * transfers; newest first. A bid for one of your players is answered in its message.
 */
import { useState } from "react";
import type { InboxMessageView } from "../../common/api";
import { errorText } from "../errors";
import { formatDate } from "../format";
import { leaguePath, Link } from "../router";
import { useShell } from "../shell/Shell";
import { toWorker } from "../workerClient";
import { PlayerMentions } from "./PlayerMentions";

const KIND_LABELS: Record<string, string> = {
  board: "Board",
  contracts: "Contracts",
  transfer: "Transfers",
  ffp: "FFP",
};
const kindLabel = (kind: string) =>
  KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

type Bid = NonNullable<InboxMessageView["bid"]>;

/** Accept or Reject for an open bid; once answered or lapsed, its status. */
function BidActions({ bid }: { bid: Bid }) {
  const { shell, reload } = useShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (bid.status !== "open") {
    return <div className="small text-body-secondary mt-2">Bid {bid.status}</div>;
  }
  const answer = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await toWorker("respondToOffer", shell.lid, bid.oid, accept);
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="d-flex flex-wrap align-items-center gap-1 mt-2" data-testid="bid-actions">
      <button
        type="button"
        className="btn btn-success btn-sm py-0"
        disabled={busy || shell.state.fired !== null}
        onClick={() => void answer(true)}
      >
        Accept
      </button>
      <button
        type="button"
        className="btn btn-outline-danger btn-sm py-0"
        disabled={busy || shell.state.fired !== null}
        onClick={() => void answer(false)}
      >
        Reject
      </button>
      <Link to={leaguePath(shell.lid, "transfer-market", "offers")} className="small ms-auto">
        All bids
      </Link>
      {error && <div className="text-danger small w-100">{error}</div>}
    </div>
  );
}

export function InboxPanel({ messages }: { messages: InboxMessageView[] }) {
  const { shell, reload } = useShell();
  const [kind, setKind] = useState("all");
  const [openMid, setOpenMid] = useState<number | null>(null);
  const [readNow, setReadNow] = useState<Set<number>>(new Set());

  const kinds = [...new Set(messages.map((m) => m.kind))];
  const shown = messages.filter((m) => kind === "all" || m.kind === kind);
  const isRead = (mid: number, read: boolean) => read || readNow.has(mid);
  const open = (mid: number, read: boolean) => {
    setOpenMid(openMid === mid ? null : mid);
    if (!isRead(mid, read)) {
      setReadNow(new Set([...readNow, mid]));
      void toWorker("markInboxRead", shell.lid, mid).then(reload);
    }
  };
  const allRead = async () => {
    await toWorker("markAllInboxRead", shell.lid);
    setReadNow(new Set(messages.map((m) => m.mid)));
    reload();
  };
  const unread = messages.filter((m) => !isRead(m.mid, m.read)).length;
  return (
    <section className="card" data-testid="inbox">
      <div className="card-body pb-2">
        <div className="d-flex align-items-center gap-2 mb-2">
          <h2 className="h6 mb-0">Inbox</h2>
          {unread > 0 && <span className="badge text-bg-primary">{unread} new</span>}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary py-0 ms-auto"
            disabled={unread === 0}
            onClick={() => void allRead()}
          >
            Mark all read
          </button>
        </div>
        <select
          className="form-select form-select-sm"
          aria-label="Show messages"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">All messages</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindLabel(k)}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="small text-body-secondary px-3">No messages.</p>
      ) : (
        <div className="list-group list-group-flush inbox-list" data-testid="inbox-list">
          {shown.map((m) => {
            const read = isRead(m.mid, m.read);
            return (
              <article key={m.mid} className="list-group-item p-0">
                <div className="inbox-heading">
                  <button
                    type="button"
                    className="inbox-message-toggle"
                    onClick={() => open(m.mid, m.read)}
                    aria-label={m.subject}
                    aria-expanded={openMid === m.mid}
                    aria-controls={`inbox-body-${m.mid}`}
                  />
                  <div className="inbox-heading-content small">
                    <div className="d-flex gap-2 align-items-baseline">
                      <span className={read ? "" : "fw-semibold"}>
                        <PlayerMentions text={m.subject} players={m.players} />
                      </span>
                      <span className="ms-auto text-body-secondary text-nowrap">
                        {formatDate(m.date)}{" "}
                        <span aria-hidden="true">{openMid === m.mid ? "▴" : "▾"}</span>
                      </span>
                    </div>
                    <span className="badge text-bg-light">{kindLabel(m.kind)}</span>
                    {m.bid?.status === "open" && (
                      <span className="badge text-bg-primary ms-1">Open bid</span>
                    )}
                  </div>
                </div>
                {openMid === m.mid && (
                  <div id={`inbox-body-${m.mid}`} className="small px-3 pb-3">
                    <PlayerMentions text={m.body} players={m.players} />
                    {m.bid && <BidActions bid={m.bid} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
