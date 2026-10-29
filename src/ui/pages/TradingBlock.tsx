/**
 * Trading Block (SPEC §17.6, §17.8; ZenGM style): the user ticks players and picks to put
 * up and asks what clubs would give for them; the best offers come back, best for him
 * first, and "Negotiate" opens one on the Trade page, where he proposes it.
 */
import { useState } from "react";
import type { TradeAssets, TradingBlockOffer } from "../../common/api";
import { TradeAssetsTable, pickText, toggled } from "../components/TradeAssets";
import { PlayerLink, TeamLink } from "../components/links";
import { errorText } from "../errors";
import { formatEuros } from "../format";
import { leaguePath, navigate } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { noAssets, saveTrade } from "../tradeDraft";
import { toWorker } from "../workerClient";

export function TradingBlock() {
  const { shell } = useShell();
  const { data: view, error } = useView("trading-block", () =>
    toWorker("getTradingBlock", shell.lid, noAssets()),
  );
  const [put, setPut] = useState<TradeAssets>(noAssets());
  const [offers, setOffers] = useState<TradingBlockOffer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!view) return <p>Loading…</p>;
  const ask = async () => {
    setBusy(true);
    setNote(null);
    try {
      setOffers((await toWorker("getTradingBlock", shell.lid, put)).offers);
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const negotiate = (offer: TradingBlockOffer) => {
    saveTrade(shell.lid, offer.proposal);
    navigate(leaguePath(shell.lid, "trade", offer.club.cid));
  };
  const nothing = put.pids.length + put.picks.length === 0;
  return (
    <>
      <PageHeader title="Trading Block" />
      <p className="small text-body-secondary">
        Put up players and picks, and clubs say what they would give for them: the five best offers
        for you. Open one on the Trade page to propose it.
      </p>
      {view.closed && (
        <div className="alert alert-warning py-2 small" data-testid="block-closed">
          {view.closed}
        </div>
      )}
      <div className="row g-3">
        <div className="col-xl-7">
          <TradeAssetsTable
            side={view.user}
            selected={put}
            onToggle={(item) => {
              setPut(toggled(put, item));
              setOffers(null);
            }}
            disabled={busy || view.closed !== null}
            testId="block-assets"
          />
        </div>
        <div className="col-xl-5">
          <button
            type="button"
            className="btn btn-primary btn-sm mb-3"
            data-testid="block-ask"
            disabled={busy || nothing || view.closed !== null || shell.state.fired !== null}
            onClick={() => void ask()}
          >
            {busy ? "Asking…" : "What are they offering?"}
          </button>
          {note && <div className="alert alert-danger py-2 small">{note}</div>}
          {offers && (
            <div data-testid="block-offers">
              {offers.length === 0 && (
                <p className="small text-body-secondary">No club would give anything for that.</p>
              )}
              {offers.map((offer) => (
                <section key={offer.club.cid} className="card mb-2 small" data-testid="block-offer">
                  <div className="card-body py-2">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <TeamLink team={offer.club} />
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm py-0 ms-auto"
                        onClick={() => negotiate(offer)}
                      >
                        Negotiate
                      </button>
                    </div>
                    <ul className="ps-3 mb-0">
                      {offer.players.map((p) => (
                        <li key={p.pid}>
                          <PlayerLink pid={p.pid} name={p.name} nationality={p.nationality} /> (
                          {p.position}, {p.age}, {p.ovr}/{p.pot}, {formatEuros(p.wage)})
                        </li>
                      ))}
                      {offer.picks.map((row) => (
                        <li key={pickText(row)}>{pickText(row)}</li>
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
