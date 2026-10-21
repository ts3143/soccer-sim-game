/** Inbox (SPEC §11): board messages, bids, contract warnings, FFP, transfers; newest first. */
import { PlayerMentions } from "../components/PlayerMentions";
import { useState } from "react";
import { formatDate } from "../format";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

const KIND_LABELS: Record<string, string> = {
  board: "Board",
  contracts: "Contracts",
  transfer: "Transfers",
  ffp: "FFP",
};
const kindLabel = (kind: string) =>
  KIND_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

export function Inbox() {
  const { shell, reload } = useShell();
  const { data: messages, error } = useView("inbox", () => toWorker("getInbox", shell.lid));
  const [kind, setKind] = useState("all");
  const [openMid, setOpenMid] = useState<number | null>(null);
  const [readNow, setReadNow] = useState<Set<number>>(new Set());
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!messages) return <p>Loading…</p>;

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
    <>
      <PageHeader title="Inbox">
        <span className="text-body-secondary small">{unread} unread</span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary ms-auto"
          disabled={unread === 0}
          onClick={() => void allRead()}
        >
          Mark all read
        </button>
      </PageHeader>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {["all", ...kinds].map((k) => (
          <button
            key={k}
            type="button"
            className={`btn btn-sm ${kind === k ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setKind(k)}
          >
            {k === "all" ? "All" : kindLabel(k)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-body-secondary">No messages.</p>
      ) : (
        <div className="list-group" data-testid="inbox-list">
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
                  <div className="inbox-heading-content d-flex gap-2 align-items-baseline">
                    <span className={read ? "" : "fw-semibold"}>
                      <PlayerMentions text={m.subject} players={m.players} />
                    </span>
                    <span className="badge text-bg-light">{kindLabel(m.kind)}</span>
                    <span className="ms-auto small text-body-secondary text-nowrap">
                      {formatDate(m.date)}{" "}
                      <span aria-hidden="true">{openMid === m.mid ? "▴" : "▾"}</span>
                    </span>
                  </div>
                </div>
                {openMid === m.mid && (
                  <p id={`inbox-body-${m.mid}`} className="small mb-0 px-3 pb-3">
                    <PlayerMentions text={m.body} players={m.players} />
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
