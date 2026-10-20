/**
 * The user's next match (SPEC §11 Team schedule): watch it live, or simulate to it. The
 * same Play actions as the top bar's menu, where the next match is shown.
 */
import { useState } from "react";
import type { PlayOption } from "../../common/api";
import { leaguePath, navigate } from "../router";
import { useShell } from "../shell/Shell";
import { toWorker } from "../workerClient";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function NextMatchButtons() {
  const { shell } = useShell();
  const [busy, setBusy] = useState<PlayOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = shell.state.options;
  if (!options.includes("watchNextMatch")) return null;
  const run = async (option: PlayOption) => {
    setBusy(option);
    setError(null);
    try {
      const report = await toWorker("playGame", shell.lid, option);
      if (report.live) navigate(leaguePath(shell.lid, "live"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="d-flex flex-wrap align-items-center gap-2" data-testid="next-match-actions">
      <button
        type="button"
        className="btn btn-success btn-sm"
        disabled={busy !== null}
        onClick={() => void run("watchNextMatch")}
      >
        {busy === "watchNextMatch" ? "Playing up to it…" : "Watch live"}
      </button>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        disabled={busy !== null}
        onClick={() => void run("untilNextMatch")}
      >
        {busy === "untilNextMatch" ? "Simulating…" : "Simulate it"}
      </button>
      {error && <span className="small text-danger">{error}</span>}
    </div>
  );
}
