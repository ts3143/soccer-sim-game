/** Cosmetic strengths derived from current ratings. Never stored or consumed by the engine. */
import { RATING_INDEX, type RatingCode } from "../common/config/ratings";

export interface SkillTag {
  code: string;
  name: string;
  description: string;
}

export function skillTags(ratings: readonly number[], position: string): SkillTag[] {
  // Match the integer ratings shown in profiles and cards, including after development.
  const value = (code: RatingCode) => Math.round(ratings[RATING_INDEX[code]] ?? 0);
  const tags: SkillTag[] = [];
  const add = (
    code: string,
    name: string,
    qualifies: boolean,
    rule: string,
    codes: RatingCode[],
  ) => {
    if (qualifies)
      tags.push({
        code,
        name,
        description: `${name} — ${rule}. Current: ${codes.map((c) => `${c.toUpperCase()} ${value(c)}`).join(", ")}. Display only; no gameplay effect.`,
      });
  };
  add("Pc", "Pacy", value("spd") >= 70, "speed ≥70", ["spd"]);
  add("St", "Strong", value("str") >= 70, "strength ≥70", ["str"]);
  add(
    "Ae",
    "Aerial threat",
    value("hdr") >= 65 && 50 * value("hdr") + 30 * value("jmp") + 20 * value("str") >= 7000,
    "50% heading + 30% jumping + 20% strength ≥70, heading ≥65",
    ["hdr", "jmp", "str"],
  );
  add("Dr", "Skilled dribbler", value("drb") >= 70, "dribbling ≥70", ["drb"]);
  add("Fi", "Finisher", value("fin") >= 70, "finishing ≥70", ["fin"]);
  add(
    "Pa",
    "Smart passer",
    value("spa") >= 60 &&
      value("oiq") >= 60 &&
      value("lpa") >= 55 &&
      40 * value("spa") + 35 * value("oiq") + 25 * value("lpa") >= 7000,
    "40% short passing + 35% offensive IQ + 25% long passing ≥70; minimums 60, 60, 55",
    ["spa", "oiq", "lpa"],
  );
  add(
    "Sp",
    "Set-piece specialist",
    value("stp") >= 70,
    "set pieces ≥70 (free kicks and corners; penalties are separate)",
    ["stp"],
  );
  add("Cr", "Dangerous crosser", value("crs") >= 70, "crossing ≥70", ["crs"]);
  add(
    "Bw",
    "Ball winner",
    value("tkl") >= 65 && value("ant") >= 65 && value("tkl") + value("ant") >= 140,
    "tackling and anticipation average ≥70, both ≥65",
    ["tkl", "ant"],
  );
  add(
    "En",
    "Engine",
    value("end") >= 65 && value("wrk") >= 65 && value("end") + value("wrk") >= 140,
    "endurance and work rate average ≥70, both ≥65",
    ["end", "wrk"],
  );
  add(
    "Rf",
    "Shot stopper",
    position === "GK" && value("gkr") >= 70,
    "goalkeeper reflexes ≥70; goalkeepers only",
    ["gkr"],
  );
  add(
    "Ha",
    "Safe hands",
    position === "GK" && value("gkh") >= 70,
    "goalkeeper handling ≥70; goalkeepers only",
    ["gkh"],
  );
  return tags;
}
