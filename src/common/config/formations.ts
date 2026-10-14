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

export interface FormationsConfig {
  formations: Formation[];
  /** Selection weights for each club's seeded default formation (MVP presets only). */
  defaultFormationWeights: Record<string, number>;
  maxSubstitutions: number;
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

  return {
    formations,
    defaultFormationWeights: weights,
    maxSubstitutions: json.substitutions.maxPerMatch,
    benchSize: json.substitutions.benchSize,
  };
}

export const formationsConfig: FormationsConfig = parse(raw);

export function formationById(id: string): Formation {
  const formation = formationsConfig.formations.find((f) => f.id === id);
  if (!formation) throw new Error(`Unknown formation ${id}`);
  return formation;
}
