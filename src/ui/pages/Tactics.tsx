/**
 * Tactics (SPEC §8.3, §11): the user's formation, line-up and sliders. Other clubs show
 * the AI's pick, read-only.
 */
import { LineupEditor } from "../components/LineupEditor";
import { PageHeader } from "../shell/PageHeader";
import { useShell } from "../shell/Shell";
import { useView } from "../shell/useView";
import { toWorker } from "../workerClient";

export function Tactics({ params }: { params: string[] }) {
  const { shell, version } = useShell();
  const cid = params[0] !== undefined ? Number(params[0]) : shell.userCid;
  const { data, error } = useView(`tactics/${cid}`, () => toWorker("getTactics", shell.lid, cid));
  return (
    <>
      <PageHeader title="Tactics" team={{ cid, page: "tactics" }} />
      {error && <div className="alert alert-danger">{error}</div>}
      {!data ? (
        <p>Loading…</p>
      ) : (
        <LineupEditor
          key={`${cid}/${version}`}
          initial={data}
          apply={(setup, mode) => toWorker("previewTactics", shell.lid, setup, mode)}
          save={(setup) => toWorker("saveTactics", shell.lid, setup)}
          note={
            data.editable
              ? "Your formation is used in every match. The line-up and sliders apply to the matches you watch; in simulated matches the AI picks them. Drag a player onto another place to swap them, or click one and then the other."
              : "The AI's pick for an ordinary match today."
          }
          autoTitle="The AI's pick for an ordinary match today"
          baselineLabel="your saved line-up"
        />
      )}
    </>
  );
}
