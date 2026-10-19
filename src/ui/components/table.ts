/** Pure table logic for DataTable (sorting and paging), kept apart so it can be unit-tested. */
export type SortValue = number | string | null | undefined;

/**
 * Rows sorted by `value` (descending if `desc`); empty values always last, ties broken by
 * `tie` so the order never depends on the input order.
 */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  desc: boolean,
  tie: (row: T) => string | number,
): T[] {
  const sign = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const xEmpty = x === null || x === undefined || x === "";
    const yEmpty = y === null || y === undefined || y === "";
    if (xEmpty !== yEmpty) return xEmpty ? 1 : -1;
    if (!xEmpty && !yEmpty && x !== y) {
      const order =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "en-GB", { numeric: true });
      if (order !== 0) return sign * order;
    }
    const tx = tie(a);
    const ty = tie(b);
    return tx < ty ? -1 : tx > ty ? 1 : 0;
  });
}

/** Pages needed for `count` rows at `size` per page (0 = one page with everything). */
export const pageCount = (count: number, size: number): number =>
  size > 0 ? Math.max(1, Math.ceil(count / size)) : 1;

/** The rows of page `page` (0-based), clamped to the last page. */
export function pageRows<T>(rows: readonly T[], page: number, size: number): T[] {
  if (size <= 0) return [...rows];
  const last = pageCount(rows.length, size) - 1;
  const p = Math.min(Math.max(0, page), last);
  return rows.slice(p * size, p * size + size);
}
