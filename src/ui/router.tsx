/**
 * A small client-side router (M5; in-house, as ZenGM, no library). The URL is the source
 * of truth: pages read their parameters from it, links push history entries, and the
 * browser's back and forward buttons work. Cloudflare Pages serves index.html for every
 * path, so deep links and reloads land on the right page.
 *
 *   /                   Manage Leagues        /new          New league
 *   /dev                Developer pages       /l/:lid       Dashboard
 *   /l/:lid/:page/...   any league page, e.g. /l/1/squad/5 (club 5), /l/1/player/123
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

/** Goes to `to` (a path), adding a history entry unless `replace`. */
export function navigate(to: string, { replace = false } = {}): void {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  notify();
  window.scrollTo(0, 0);
}

/** The current path, re-rendering on navigation. */
export function usePath(): string {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => location.pathname,
  );
}

export type Route =
  | { kind: "home" }
  | { kind: "new" }
  | { kind: "dev" }
  | { kind: "league"; lid: number; page: string; params: string[] }
  | { kind: "notFound" };

/** Reads a path into a route. */
export function parseRoute(path: string): Route {
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { kind: "home" };
  if (parts[0] === "new" && parts.length === 1) return { kind: "new" };
  if (parts[0] === "dev") return { kind: "dev" };
  if (parts[0] === "l" && parts[1] !== undefined && /^\d+$/.test(parts[1])) {
    return {
      kind: "league",
      lid: Number(parts[1]),
      page: parts[2] ?? "dashboard",
      params: parts.slice(3),
    };
  }
  return { kind: "notFound" };
}

/** The path of a league page: leaguePath(1, "squad", 5) → "/l/1/squad/5". */
export function leaguePath(
  lid: number,
  page = "dashboard",
  ...params: (string | number)[]
): string {
  const rest = params.map((p) => `/${encodeURIComponent(String(p))}`).join("");
  return page === "dashboard" && rest === "" ? `/l/${lid}` : `/l/${lid}/${page}${rest}`;
}

/** An <a> that navigates in-app on a plain click (new-tab clicks keep working). */
export function Link({
  to,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={click} {...rest} />;
}
