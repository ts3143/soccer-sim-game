/** An address that isn't a page of the game. */
import { PageHeader } from "../shell/PageHeader";

export function Placeholder({ page }: { page: string; params: string[] }) {
  return (
    <>
      <PageHeader title="Page not found" />
      <p>There's no page called “{page}”.</p>
    </>
  );
}
