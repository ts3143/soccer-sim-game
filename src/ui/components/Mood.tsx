/** A player's mood (SPEC §4.6): the component labels and a centred bar for each. */

export const MOOD_LABELS: Record<string, string> = {
  success: "Team success",
  hype: "Hype",
  facilities: "Facilities",
  market: "Market size",
  playingTime: "Playing time",
  loyalty: "Loyalty",
  ambition: "Ambition",
};

/** A bar from the middle: green to the right for a positive part, red to the left. */
export function MoodBar({ value }: { value: number }) {
  const width = Math.abs(value) * 50;
  return (
    <div className="position-relative bg-body-secondary rounded" style={{ height: 8, width: 120 }}>
      <div
        className="position-absolute top-0 bottom-0 border-start border-dark"
        style={{ left: "50%" }}
      />
      <div
        className={`position-absolute top-0 bottom-0 rounded ${value >= 0 ? "bg-success" : "bg-danger"}`}
        style={
          value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }
        }
      />
    </div>
  );
}

/** The mood's parts, one row each. */
export function MoodTable({ components }: { components: Record<string, number> }) {
  return (
    <table className="table table-sm small mb-0">
      <tbody>
        {Object.entries(components).map(([k, v]) => (
          <tr key={k}>
            <td>{MOOD_LABELS[k] ?? k}</td>
            <td>
              <MoodBar value={v} />
            </td>
            <td className="text-end">{v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
