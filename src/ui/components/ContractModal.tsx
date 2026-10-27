/**
 * Contract negotiation (SPEC §7.6, §11): one window for renewing the user's players,
 * personal terms after an agreed fee (a transfer, with the bid step first) and free agents.
 * The player asks a wage per contract length, adjusted by his mood; the user picks one or
 * walks away. The transfer budget and wage room are always shown (SPEC §6.3).
 */
import { useEffect, useState } from "react";
import type { ContractTalks } from "../../common/api";
import { formatDate, formatEuros, formatPercent } from "../format";
import { useShell } from "../shell/Shell";
import { toWorker } from "../workerClient";
import { MoodTable } from "./Mood";
import { errorText } from "../errors";

const TITLES: Record<ContractTalks["kind"], string> = {
  renewal: "New contract",
  transfer: "Transfer talks",
  freeAgent: "Free agent talks",
};

export function ContractModal({ pid, onClose }: { pid: number; onClose: () => void }) {
  const { shell, reload } = useShell();
  const [talks, setTalks] = useState<ContractTalks | null>(null);
  const [years, setYears] = useState<number | null>(null);
  const [fee, setFee] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    toWorker("getContractTalks", shell.lid, pid)
      .then((t) => {
        if (!alive) return;
        setTalks(t);
        setFee(String(Math.round(t.value / 10_000) * 10_000));
      })
      .catch((e: unknown) => alive && setNote({ ok: false, text: errorText(e) }));
    return () => {
      alive = false;
    };
  }, [shell.lid, pid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const act = async (action: () => Promise<string>) => {
    setBusy(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await action() });
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const bid = (amount: number) =>
    act(async () => {
      const reply = await toWorker("bidForPlayer", shell.lid, pid, amount);
      setTalks(reply.talks);
      if (reply.counter !== null) setFee(String(reply.counter));
      if (reply.outcome !== "accepted") throw new Error(reply.message);
      return reply.message;
    });
  const agree = (chosen: number) =>
    act(async () => {
      if (!talks) return "";
      if (talks.kind === "renewal") {
        await toWorker("renewContract", shell.lid, pid, chosen);
      } else {
        await toWorker("signPlayer", shell.lid, pid, chosen);
      }
      setDone(true);
      reload();
      const ask = talks.asks.find((a) => a.years === chosen);
      return talks.kind === "renewal"
        ? `${talks.name} signs a new contract: ${formatEuros(ask?.wage ?? 0)} a year until ${formatDate(ask?.expires ?? "")}.`
        : `${talks.name} joins your club: ${formatEuros(ask?.wage ?? 0)} a year until ${formatDate(ask?.expires ?? "")}.`;
    });

  const t = talks;
  const needsFee = t?.kind === "transfer" && t.feeAgreed === null;
  const windowNeeded = t !== null && t.kind !== "freeAgent";
  const blocked = !t
    ? null
    : t.closedReason
      ? t.closedReason
      : windowNeeded && !t.windowOpen
        ? "The transfer window is closed: renewals and transfers wait for the next window. Free agents can be signed at any time."
        : !t.mood.willing
          ? `${t.name} won't negotiate with your club.`
          : t.kind !== "renewal" && t.budget.bannedUntil
            ? `FFP: your club can't sign anyone until ${formatDate(t.budget.bannedUntil)}.`
            : needsFee && t.budget.cashFrozen
              ? "Your club's cash is below zero, so transfers are frozen until it's back above zero."
              : null;
  // A full squad can still agree a fee (a sale may follow), but can't sign him yet.
  const full =
    t !== null && t.kind !== "renewal" && t.squad.enforced && t.squad.seniors >= t.squad.max
      ? `Your squad is full (${t.squad.max} seniors): sell, loan or release a player before he can sign.`
      : null;

  return (
    <>
      <div
        className="modal d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-title"
        data-testid="contract-modal"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5" id="contract-title">
                {t ? `${TITLES[t.kind]}: ${t.name}` : "Contract talks"}
              </h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body small">
              {!t ? (
                note ? null : (
                  <p>Loading…</p>
                )
              ) : (
                <>
                  <p className="mb-2">
                    {t.position}, {t.age} · OVR <strong>{t.ovr}</strong> · POT {t.pot} · value{" "}
                    {formatEuros(t.value)}
                    <br />
                    {t.club ? `At ${t.club}` : "Free agent"}
                    {t.expires &&
                      ` · ${formatEuros(t.wage)} a year until ${formatDate(t.expires)} (${t.yearsLeft} season${t.yearsLeft === 1 ? "" : "s"} left)`}
                  </p>
                  <div className="d-flex flex-wrap gap-3 mb-3" data-testid="contract-budget">
                    <span>
                      Transfer budget <strong>{formatEuros(t.budget.transfer)}</strong>
                    </span>
                    <span>
                      Wage room <strong>{formatEuros(t.budget.wageRoom)}</strong> a year
                    </span>
                    <span>
                      Squad cost {formatPercent(t.budget.squadCostRatio, 0)} of revenue (FFP limit{" "}
                      {formatPercent(t.budget.ffpLimit, 0)})
                    </span>
                    <span className={t.squad.seniors >= t.squad.max ? "text-danger" : ""}>
                      Seniors {t.squad.seniors}/{t.squad.max}
                    </span>
                    {t.budget.warned && <span className="badge text-bg-warning">FFP warning</span>}
                  </div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <h3 className="h6">
                        Mood {t.mood.value.toFixed(2)}{" "}
                        {t.mood.willing ? (
                          <span className="badge text-bg-success">willing to talk</span>
                        ) : (
                          <span className="badge text-bg-danger">won't negotiate</span>
                        )}
                      </h3>
                      <MoodTable components={t.mood.components} />
                    </div>
                    <div className="col-md-6">
                      {needsFee && (
                        <div className="mb-3" data-testid="bid-step">
                          <h3 className="h6">1. Agree a fee with {t.club}</h3>
                          <div className="input-group input-group-sm mb-1">
                            <span className="input-group-text">€</span>
                            <input
                              id="contract-fee"
                              type="number"
                              min={0}
                              step={10000}
                              className="form-control"
                              aria-label="Fee in euros"
                              value={fee}
                              onChange={(e) => setFee(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={busy || blocked !== null || !(Number(fee) > 0)}
                              onClick={() => void bid(Math.round(Number(fee)))}
                              data-testid="make-bid"
                            >
                              Make bid
                            </button>
                          </div>
                          <div className="text-body-secondary">
                            {formatEuros(Number(fee) || 0)}. His value is {formatEuros(t.value)}.
                          </div>
                        </div>
                      )}
                      {t.kind === "transfer" && t.feeAgreed !== null && (
                        <div className="alert alert-success py-1 mb-2">
                          Fee agreed: {formatEuros(t.feeAgreed)}. Now his personal terms.
                        </div>
                      )}
                      <h3 className="h6">
                        {t.kind === "transfer" ? "2. Personal terms" : "What he asks"}
                      </h3>
                      <table className="table table-sm mb-2" data-testid="contract-asks">
                        <thead>
                          <tr>
                            <th />
                            <th>Length</th>
                            <th className="text-end">Wage a year</th>
                            <th>Until</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.asks.map((a) => {
                            const tooMuch = t.kind !== "renewal" && a.wage > t.budget.wageRoom;
                            const shorter =
                              t.kind === "renewal" && t.expires !== null && a.expires <= t.expires;
                            const off = tooMuch || shorter;
                            return (
                              <tr key={a.years} className={off ? "text-body-tertiary" : ""}>
                                <td>
                                  <input
                                    type="radio"
                                    className="form-check-input"
                                    name="contract-years"
                                    aria-label={`${a.years} years`}
                                    checked={years === a.years}
                                    disabled={off}
                                    onChange={() => setYears(a.years)}
                                  />
                                </td>
                                <td>
                                  {a.years} year{a.years === 1 ? "" : "s"}
                                </td>
                                <td className="text-end">
                                  {formatEuros(a.wage)}
                                  {tooMuch && <span className="ms-1">(over your wage room)</span>}
                                </td>
                                <td>
                                  {formatDate(a.expires)}
                                  {shorter && (
                                    <span className="ms-1">(not past his current deal)</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        disabled={
                          busy ||
                          done ||
                          years === null ||
                          needsFee ||
                          blocked !== null ||
                          full !== null
                        }
                        onClick={() => years !== null && void agree(years)}
                        data-testid="agree-contract"
                      >
                        {t.kind === "renewal" ? "Renew" : "Sign him"}
                      </button>
                    </div>
                  </div>
                  {blocked && (
                    <div
                      className="alert alert-warning py-2 mt-3 mb-0"
                      data-testid="contract-blocked"
                    >
                      {blocked}
                    </div>
                  )}
                  {full && !blocked && (
                    <div className="alert alert-warning py-2 mt-3 mb-0" data-testid="contract-full">
                      {full}
                    </div>
                  )}
                </>
              )}
              {note && (
                <div
                  className={`alert ${note.ok ? "alert-success" : "alert-danger"} py-2 mt-3 mb-0`}
                  data-testid="contract-note"
                >
                  {note.text}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
                {done ? "Done" : "Walk away"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}
