import type { Formation, FormationSlot } from "../../common/config/formations";
import type { Position } from "../../common/config/ratings";

/** Schematic attacking-up coordinates; the configured slots determine every marker. */
export function formationCoordinates(formation: Formation) {
  const backLine = Number(formation.id.split("-")[0]);
  const hasAm = formation.slots.some((s) => s.position === "AM");
  const row = (slot: FormationSlot) => {
    switch (slot.position) {
      case "GK":
        return 90;
      case "CB":
      case "FB":
        return 75;
      case "WB":
        return backLine >= 5 ? 75 : 43;
      case "DM":
        return 59;
      case "CM":
      case "WM":
        return 43;
      case "AM":
        return 29;
      case "W":
        return hasAm ? 29 : 14;
      case "ST":
        return 14;
    }
  };
  const rows = formation.slots.map(row);
  return formation.slots.map((slot, index) => {
    const y = rows[index]!;
    if (slot.side !== "C") return { x: slot.side === "L" ? 12 : 88, y };
    const central = formation.slots.flatMap((s, i) => (s.side === "C" && rows[i] === y ? [i] : []));
    const rank = central.indexOf(index);
    const spacing = central.length > 2 ? 18 : 22;
    return { x: 50 + (rank - (central.length - 1) / 2) * spacing, y };
  });
}

export const POSITION_SPOTS: {
  position: Position;
  side: "L" | "C" | "R";
  label: string;
  x: number;
  y: number;
}[] = [
  { position: "ST", side: "C", label: "ST", x: 50, y: 12 },
  { position: "W", side: "L", label: "LW", x: 16, y: 28 },
  { position: "AM", side: "C", label: "AM", x: 50, y: 28 },
  { position: "W", side: "R", label: "RW", x: 84, y: 28 },
  { position: "WM", side: "L", label: "LM", x: 16, y: 44 },
  { position: "CM", side: "C", label: "CM", x: 50, y: 44 },
  { position: "WM", side: "R", label: "RM", x: 84, y: 44 },
  { position: "WB", side: "L", label: "LWB", x: 16, y: 60 },
  { position: "DM", side: "C", label: "DM", x: 50, y: 60 },
  { position: "WB", side: "R", label: "RWB", x: 84, y: 60 },
  { position: "FB", side: "L", label: "LB", x: 16, y: 76 },
  { position: "CB", side: "C", label: "CB", x: 50, y: 76 },
  { position: "FB", side: "R", label: "RB", x: 84, y: 76 },
  { position: "GK", side: "C", label: "GK", x: 50, y: 91 },
];

/** Relative OVR bands describe fit only; no separate familiarity mechanic. */
export function positionFit(ovr: number, best: number) {
  const gap = best - ovr;
  return gap <= 0 ? "best" : gap <= 3 ? "comfortable" : gap <= 8 ? "cover" : "lower";
}
