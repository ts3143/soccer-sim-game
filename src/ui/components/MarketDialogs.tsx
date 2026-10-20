/**
 * Small market dialogs (M6): put a player on the transfer list, release a player, propose a
 * loan in or out. Each changes the save through the worker and then reloads the pages.
 */
import { useEffect, useState, type ReactNode } from "react";
import { formatDate, formatEuros } from "../format";
import { useShell } from "../shell/Shell";
import { toWorker } from "../workerClient";
import { errorText } from "../errors";

/** A centred dialog over a backdrop; Escape or a click outside closes it. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  testId: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div
        className="modal d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5">{title}</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body small">{children}</div>
            <div className="modal-footer">{footer}</div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}

/** The outcome line under a dialog's form. */
function Note({ note }: { note: { ok: boolean; text: string } | null }) {
  if (!note) return null;
  return (
    <div
      className={`alert ${note.ok ? "alert-success" : "alert-danger"} py-2 mt-3 mb-0`}
      data-testid="dialog-note"
    >
      {note.text}
    </div>
  );
}

/** Runs a worker action for a dialog: busy flag, outcome note, reload on success. */
function useAction() {
  const { reload } = useShell();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const run = async (action: () => Promise<string>, finishes = true) => {
    setBusy(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await action() });
      if (finishes) setDone(true);
      reload();
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, note, done, run, setNote };
}

export function ListDialog({
  player,
  onClose,
}: {
  player: { pid: number; name: string; value: number; listed: { asking: number } | null };
  onClose: () => void;
}) {
  const { shell } = useShell();
  const [asking, setAsking] = useState(
    String(player.listed?.asking ?? Math.round(player.value / 10_000) * 10_000),
  );
  const { busy, note, done, run } = useAction();
  const amount = Math.round(Number(asking));
  return (
    <Modal
      title={`Transfer list: ${player.name}`}
      onClose={onClose}
      testId="list-dialog"
      footer={
        <>
          {player.listed && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm me-auto"
              disabled={busy || done}
              onClick={() =>
                void run(async () => {
                  await toWorker("listPlayer", shell.lid, player.pid, null);
                  return `${player.name} is off the transfer list.`;
                })
              }
            >
              Take off the list
            </button>
          )}
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
            {done ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || done || !(amount > 0)}
            onClick={() =>
              void run(async () => {
                await toWorker("listPlayer", shell.lid, player.pid, amount);
                return `${player.name} is listed at ${formatEuros(amount)}. Clubs that need him bid near that price while a window is open.`;
              })
            }
            data-testid="list-confirm"
          >
            {player.listed ? "Change the price" : "List him"}
          </button>
        </>
      }
    >
      <p>
        AI clubs that need a player in his position bid close to your price on their market days (at
        least 85% of it). His market value is {formatEuros(player.value)}.
      </p>
      <label htmlFor="list-asking" className="form-label fw-semibold mb-1">
        Asking price
      </label>
      <div className="input-group input-group-sm">
        <span className="input-group-text">€</span>
        <input
          id="list-asking"
          type="number"
          min={0}
          step={10000}
          className="form-control"
          value={asking}
          onChange={(e) => setAsking(e.target.value)}
        />
      </div>
      <div className="text-body-secondary mt-1">{formatEuros(amount || 0)}</div>
      <Note note={note} />
    </Modal>
  );
}

export function ReleaseDialog({
  player,
  today,
  onClose,
}: {
  player: { pid: number; name: string; wage: number; expires: string | null };
  today: string;
  onClose: () => void;
}) {
  const { shell } = useShell();
  const { busy, note, done, run } = useAction();
  const until = player.expires ?? today;
  const months = Math.max(
    0,
    Math.round((Date.parse(until) - Date.parse(today)) / (30.44 * 86_400_000)),
  );
  return (
    <Modal
      title={`Release ${player.name}?`}
      onClose={onClose}
      testId="release-dialog"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
            {done ? "Done" : "Keep him"}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy || done}
            onClick={() => void run(() => toWorker("releasePlayer", shell.lid, player.pid))}
            data-testid="release-confirm"
          >
            Release him
          </button>
        </>
      }
    >
      <p>
        He leaves for the free-agent pool now. You keep paying his {formatEuros(player.wage)} a year
        until {formatDate(until)}: about {formatEuros((player.wage * months) / 12)} over {months}{" "}
        month{months === 1 ? "" : "s"}. Any fee still to amortise is too.
      </p>
      <p className="mb-0">It frees a place in your squad; it saves no money.</p>
      <Note note={note} />
    </Modal>
  );
}

export function LoanDialog({
  player,
  direction,
  onClose,
}: {
  player: { pid: number; name: string };
  /** "out": one of yours to a club you pick; "in": another club's player to yours. */
  direction: "in" | "out";
  onClose: () => void;
}) {
  const { shell } = useShell();
  const [cid, setCid] = useState<number | null>(null);
  const [length, setLength] = useState<"season" | "half">("season");
  const [share, setShare] = useState(0.5);
  const { busy, note, done, run } = useAction();
  const target = direction === "in" ? shell.userCid : cid;
  return (
    <Modal
      title={direction === "in" ? `Loan in: ${player.name}` : `Loan out: ${player.name}`}
      onClose={onClose}
      testId="loan-dialog"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
            {done ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || done || target === null}
            onClick={() =>
              void run(async () => {
                const reply = await toWorker(
                  "proposeLoan",
                  shell.lid,
                  player.pid,
                  target ?? -1,
                  length,
                  share,
                );
                if (!reply.accepted) throw new Error(reply.message);
                return reply.message;
              })
            }
            data-testid="loan-confirm"
          >
            Propose the loan
          </button>
        </>
      }
    >
      {direction === "out" && (
        <div className="mb-2">
          <label htmlFor="loan-club" className="form-label fw-semibold mb-1">
            To
          </label>
          <select
            id="loan-club"
            className="form-select form-select-sm"
            value={cid ?? ""}
            onChange={(e) => setCid(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Pick a club…</option>
            {shell.leagues.map((l) => (
              <optgroup key={l.id} label={l.name}>
                {shell.clubs
                  .filter((c) => c.leagueId === l.id && c.cid !== shell.userCid)
                  .map((c) => (
                    <option key={c.cid} value={c.cid}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      <div className="row g-2">
        <div className="col-6">
          <label htmlFor="loan-length" className="form-label fw-semibold mb-1">
            Length
          </label>
          <select
            id="loan-length"
            className="form-select form-select-sm"
            value={length}
            onChange={(e) => setLength(e.target.value as "season" | "half")}
          >
            <option value="season">To the end of the season</option>
            <option value="half">Half a season</option>
          </select>
        </div>
        <div className="col-6">
          <label htmlFor="loan-share" className="form-label fw-semibold mb-1">
            Loan club pays
          </label>
          <select
            id="loan-share"
            className="form-select form-select-sm"
            value={share}
            onChange={(e) => setShare(Number(e.target.value))}
          >
            <option value={0}>none of his wage</option>
            <option value={0.5}>half his wage</option>
            <option value={1}>all his wage</option>
          </select>
        </div>
      </div>
      <p className="text-body-secondary mt-2 mb-0">
        {direction === "out"
          ? "A club takes him if he'd be in its best 14, and pays at most half his wage (all of it for a starter)."
          : "His club lends a young player (23 or under) outside its best 16 who'd play for you, for at least half his wage."}{" "}
        No recall, no option to buy; he can't play against his parent club.
      </p>
      <Note note={note} />
    </Modal>
  );
}
