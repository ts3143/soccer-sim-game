/**
 * Optimal assignment (Hungarian method, shortest augmenting paths with potentials):
 * given a score for every (row, column) pair, pick one distinct column per row so the
 * total score is as high as possible. Used to find a club's best XI (rows = the 11
 * formation slots, columns = players), and later by the lineup AI.
 *
 * O(rows² × columns); trivial for 11 slots × ~30 players. Deterministic: ties resolve
 * by input order.
 */
export function maximizeAssignment(scores: readonly (readonly number[])[]): number[] {
  const rows = scores.length;
  if (rows === 0) return [];
  const cols = (scores[0] as readonly number[]).length;
  if (cols < rows) throw new Error(`assignment: ${cols} columns for ${rows} rows`);

  // Minimise cost = -score. Arrays are 1-based; index 0 is the virtual start.
  const u = new Array<number>(rows + 1).fill(0);
  const v = new Array<number>(cols + 1).fill(0);
  const rowOfCol = new Array<number>(cols + 1).fill(0);
  const way = new Array<number>(cols + 1).fill(0);

  for (let row = 1; row <= rows; row++) {
    rowOfCol[0] = row;
    let col0 = 0;
    const minv = new Array<number>(cols + 1).fill(Infinity);
    const used = new Array<boolean>(cols + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = rowOfCol[col0] as number;
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= cols; col++) {
        if (used[col]) continue;
        const cost = -((scores[row0 - 1] as readonly number[])[col - 1] as number);
        const reduced = cost - (u[row0] as number) - (v[col] as number);
        if (reduced < (minv[col] as number)) {
          minv[col] = reduced;
          way[col] = col0;
        }
        if ((minv[col] as number) < delta) {
          delta = minv[col] as number;
          col1 = col;
        }
      }
      for (let col = 0; col <= cols; col++) {
        if (used[col]) {
          u[rowOfCol[col] as number] = (u[rowOfCol[col] as number] as number) + delta;
          v[col] = (v[col] as number) - delta;
        } else {
          minv[col] = (minv[col] as number) - delta;
        }
      }
      col0 = col1;
    } while (rowOfCol[col0] !== 0);
    do {
      const col1 = way[col0] as number;
      rowOfCol[col0] = rowOfCol[col1] as number;
      col0 = col1;
    } while (col0 !== 0);
  }

  const colOfRow = new Array<number>(rows).fill(-1);
  for (let col = 1; col <= cols; col++) {
    const row = rowOfCol[col] as number;
    if (row > 0) colOfRow[row - 1] = col - 1;
  }
  return colOfRow;
}
