/**
 * Loads a page's view from the worker and reloads it after every Play action or game
 * change (the shell's `version`), or when `key` changes (e.g. another club or season).
 */
import { useEffect, useRef, useState } from "react";
import { useShell } from "./Shell";
import { errorText } from "../errors";

export function useView<T>(key: string, load: () => Promise<T>, { stale = false } = {}) {
  const { version } = useShell();
  const [data, setData] = useState<{ key: string; value: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest loader, updated after each render (declared first, so it runs first).
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    let live = true;
    loader
      .current()
      .then((value) => {
        if (!live) return;
        setData({ key, value });
        setError(null);
      })
      .catch((e: unknown) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [key, version]);

  // While another key loads, show nothing rather than the previous key's data, unless
  // `stale` (a page that changes its key as the user edits, e.g. the Trade page).
  // `fresh`: the data is this key's.
  const fresh = data?.key === key;
  return { data: fresh || stale ? (data?.value ?? null) : null, error, fresh };
}
