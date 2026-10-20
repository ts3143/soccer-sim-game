/**
 * Settings (SPEC §11 Tools; T, 2026-10-19): rename the save, or delete the league. The live
 * match's speed is a slider on the Watch live screen, not a setting.
 */
import { useState } from "react";
import { navigate } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { seasonLabel, useShell } from "../shell/Shell";
import { APP_VERSION } from "../version";
import { toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Settings() {
  const { shell, reload } = useShell();
  const [name, setName] = useState(shell.name);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const user = shell.clubs.find((c) => c.cid === shell.userCid);
  const rename = async () => {
    setBusy(true);
    setNote(null);
    try {
      await toWorker("renameLeague", shell.lid, name);
      setNote({ ok: true, text: "Renamed." });
      reload();
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await toWorker("deleteLeague", shell.lid);
      navigate("/");
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Settings" />
      <div className="row g-3" data-testid="settings">
        <div className="col-lg-6">
          <section className="card">
            <div className="card-body small">
              <h2 className="h6">This league</h2>
              <p className="text-body-secondary">
                {user?.name ?? "No club"} · season {seasonLabel(shell.state.season)} · saved in this
                browser only · Soccer Sim v{APP_VERSION}.
              </p>
              <label htmlFor="league-name" className="form-label fw-semibold mb-1">
                Name
              </label>
              <div className="input-group input-group-sm mb-2">
                <input
                  id="league-name"
                  className="form-control"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || name.trim() === "" || name.trim() === shell.name}
                  onClick={() => void rename()}
                  data-testid="rename"
                >
                  Rename
                </button>
              </div>
              {note && (
                <div
                  className={`alert ${note.ok ? "alert-success" : "alert-danger"} py-1 mb-0`}
                  data-testid="settings-note"
                >
                  {note.text}
                </div>
              )}
            </div>
          </section>
        </div>
        <div className="col-lg-6">
          <section className="card border-danger">
            <div className="card-body small">
              <h2 className="h6">Delete this league</h2>
              <p className="text-body-secondary">
                Every season, player and result in “{shell.name}” goes for good. It can't be undone.
              </p>
              {confirming ? (
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    onClick={() => void remove()}
                    data-testid="delete-confirm"
                  >
                    Delete it for good
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setConfirming(false)}
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => setConfirming(true)}
                  data-testid="delete-league"
                >
                  Delete league…
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
