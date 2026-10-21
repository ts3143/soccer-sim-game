/**
 * The shared table (SPEC §11: sortable, filterable, paginated where large). Click a column
 * heading to sort (numbers start high-to-low), type to filter, page through big tables.
 */
import { useMemo, useState, type ReactNode } from "react";
import { pageCount, pageRows, sortRows, type SortValue } from "./table";

export interface Column<T> {
  key: string;
  label: string;
  /** Tooltip for the heading (what an abbreviation means). */
  title?: string;
  /** Sort value; columns without one can't be sorted. */
  value?: (row: T) => SortValue;
  /** Cell content (default: the sort value). */
  render?: (row: T) => ReactNode;
  align?: "end" | "center";
  /** First click sorts high-to-low (default for numbers). */
  desc?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  initialSort?: { key: string; desc: boolean };
  /** Rows per page (0 = no paging). */
  pageSize?: number;
  /** Enables the filter box: the text a row is matched on. */
  search?: (row: T) => string;
  rowClass?: (row: T) => string;
  testId?: string;
  /** Shown when there are no rows. */
  empty?: string;
  small?: boolean;
}

const PAGE_SIZES = [10, 25, 50, 100, 0];

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  pageSize = 25,
  search,
  rowClass,
  testId,
  empty = "Nothing to show.",
  small = true,
}: Props<T>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [filter, setFilter] = useState("");
  const [size, setSize] = useState(pageSize);
  const [page, setPage] = useState(0);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered =
      search && needle ? rows.filter((r) => search(r).toLowerCase().includes(needle)) : rows;
    const column = columns.find((c) => c.key === sort?.key);
    return column?.value && sort
      ? sortRows(filtered, column.value, sort.desc, rowKey)
      : [...filtered];
  }, [rows, filter, search, columns, sort, rowKey]);

  const pages = pageCount(shown.length, size);
  const current = Math.min(page, pages - 1);
  const visible = pageRows(shown, current, size);
  const sortBy = (column: Column<T>) => {
    if (!column.value) return;
    const desc = sort?.key === column.key ? !sort.desc : (column.desc ?? column.align === "end");
    setSort({ key: column.key, desc });
    setPage(0);
  };
  const align = (c: Column<T>) =>
    c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "";

  return (
    <div data-testid={testId}>
      {(search || rows.length > pageSize) && pageSize > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2 small">
          {search && (
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: "16em" }}
              placeholder="Filter"
              aria-label="Filter"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            />
          )}
          <span className="text-body-secondary ms-auto">
            {shown.length} row{shown.length === 1 ? "" : "s"}
          </span>
          <select
            className="form-select form-select-sm w-auto"
            aria-label="Rows per page"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "All rows" : `${n} per page`}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="table-responsive">
        <table
          className={`table ${small ? "table-sm" : ""} table-striped table-hover align-middle mb-2`}
        >
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${align(c)} text-nowrap ${c.value ? "user-select-none" : ""}`}
                  title={c.title}
                  role={c.value ? "button" : undefined}
                  aria-sort={
                    sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined
                  }
                  onClick={() => sortBy(c)}
                >
                  {c.label}
                  {sort?.key === c.key ? (sort.desc ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-body-secondary">
                  {empty}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={rowKey(row)} className={rowClass?.(row)}>
                  {columns.map((c) => (
                    <td key={c.key} className={align(c)}>
                      {c.render ? c.render(row) : (c.value?.(row) ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="d-flex align-items-center gap-2 small">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
