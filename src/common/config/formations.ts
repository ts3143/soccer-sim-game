/** Formations and tactics config (data/config/formations_tactics.json), typed and validated. */
import raw from "../../../data/config/formations_tactics.json";
import { POSITIONS, type Position, type Side } from "./ratings";

export interface FormationSlot {
  position: Position;
  side: Side;
}

export interface Formation {
  id: string;
  mvp: boolean;
  /** 11 slots, GK first, in Tactics-table display order. */
  slots: FormationSlot[];
}

export interface SliderInfo {
  key: "mentality" | "pressing" | "directness";
  /** Labels for the −2 and +2 ends. */
  low: string;
  high: string;
  effect: string;
}

export interface FormationsConfig {
  formations: Formation[];
  /** The three tactics sliders (−2…+2), in display order. */
  sliders: SliderInfo[];
  /** Selection weights for each club's seeded default formation (MVP presets only). */
  defaultFormationWeights: Record<string, number>;
  /** Real rule: subs in normal time, in at most `substitutionWindows` stoppages during play. */
  maxSubstitutions: number;
  substitutionWindows: number;
  /** Extra time adds this many subs and windows. */
  extraTimeSubs: number;
  extraTimeWindows: number;
  benchSize: number;
}

const isPosition = (value: string | undefined): value is Position =>
  (POSITIONS as readonly (string | undefined)[]).includes(value);
const isSide = (value: string | undefined): value is Side =>
  value === "L" || value === "C" || value === "R";

function fail(message: string): never {
  throw new Error(`formations_tactics.json: ${message}`);
}

function parse(json: typeof raw): FormationsConfig {
  const formations = json.formations.map((f): Formation => {
    if (f.slots.length !== 11) fail(`${f.id} has ${f.slots.length} slots, not 11`);
    const slots = f.slots.map(([position, side]): FormationSlot => {
      if (!isPosition(position)) fail(`${f.id}: unknown position ${position}`);
      if (!isSide(side)) fail(`${f.id}: bad side ${side}`);
      return { position, side };
    });
    if (slots.filter((s) => s.position === "GK").length !== 1) fail(`${f.id} needs exactly 1 GK`);
    return { id: f.id, mvp: f.mvp, slots };
  });

  const weights: Record<string, number> = {};
  for (const [id, weight] of Object.entries(json.defaultFormation.presetWeights)) {
    const formation = formations.find((f) => f.id === id);
    if (!formation?.mvp) fail(`defaultFormation weight for non-MVP or unknown formation ${id}`);
    weights[id] = weight;
  }

  const sliders = (["mentality", "pressing", "directness"] as const).map((key): SliderInfo => {
    const info = json.sliders[key];
    return { key, low: info.low, high: info.high, effect: info.effect };
  });

  return {
    formations,
    sliders,
    defaultFormationWeights: weights,
    maxSubstitutions: json.substitutions.maxPerMatch,
    substitutionWindows: json.substitutions.windows,
    extraTimeSubs: json.substitutions.extraTime.extraSubs,
    extraTimeWindows: json.substitutions.extraTime.extraWindows,
    benchSize: json.substitutions.benchSize,
  };
}

export const formationsConfig: FormationsConfig = parse(raw);

export function formationById(id: string): Formation {
  const formation = formationsConfig.formations.find((f) => f.id === id);
  if (!formation) throw new Error(`Unknown formation ${id}`);
  return formation;
}

/** A slot's short label for the Tactics table: RB, LCB-style sides only where they matter. */
export function slotLabel(slot: FormationSlot): string {
  const side = slot.side === "C" ? "" : slot.side;
  switch (slot.position) {
    case "FB":
      return `${side}B`;
    case "WB":
      return `${side}WB`;
    case "WM":
      return `${side}M`;
    case "W":
      return `${side}W`;
    default:
      return slot.position;
  }
}
