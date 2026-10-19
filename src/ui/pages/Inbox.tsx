/** Inbox (SPEC §11): board messages, bids, contract warnings, FFP, transfers; newest first. */
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
              <button
                key={m.mid}
                type="button"
                className="list-group-item list-group-item-action"
                onClick={() => open(m.mid, m.read)}
                aria-expanded={openMid === m.mid}
              >
                <div className="d-flex gap-2 align-items-baseline">
                  <span className={read ? "" : "fw-semibold"}>{m.subject}</span>
                  <span className="badge text-bg-light">{kindLabel(m.kind)}</span>
                  <span className="ms-auto small text-body-secondary text-nowrap">
                    {formatDate(m.date)}
                  </span>
                </div>
                {openMid === m.mid && <p className="small mb-0 mt-2">{m.body}</p>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
