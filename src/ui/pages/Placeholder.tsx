/** A league page not built yet (the M6 pages): says it comes with the Management UI. */
import { leaguePath } from "../router";
import { PageHeader } from "../shell/PageHeader";
import { pageOf } from "../shell/pages";
import { useShell } from "../shell/Shell";

export function Placeholder({ page, params }: { page: string; params: string[] }) {
  const { shell } = useShell();
  const def = pageOf(page);
  if (!def) {
    return (
      <>
        <PageHeader title="Page not found" />
        <p>There's no page called “{page}”.</p>
      </>
    );
  }
  const cid = Number(params[0] ?? shell.userCid);
  const season = Number(params[def.team ? 1 : 0] ?? shell.state.season);
  return (
    <>
      <PageHeader
        title={def.title}
        team={
          def.team ? { cid: Number.isNaN(cid) ? shell.userCid : cid, page: def.key } : undefined
        }
        season={
          def.season && !def.team
            ? { season, to: (s) => leaguePath(shell.lid, def.key, s) }
            : undefined
        }
      />
      <p className="text-body-secondary" data-testid="placeholder">
        {def.title} arrives with the Management UI (M6).
      </p>
    </>
  );
}
