/**
 * Name and birthplace lists per nationality (data/names/<CODE>.json, built from Wikidata
 * by tools/names/build-names.ts; see data/names/SOURCES.md). Static imports so the
 * same module works in the worker bundle, Vitest and Node tools.
 */
import ARG from "../../../data/names/ARG.json";
import AUS from "../../../data/names/AUS.json";
import AUT from "../../../data/names/AUT.json";
import BEL from "../../../data/names/BEL.json";
import BIH from "../../../data/names/BIH.json";
import BRA from "../../../data/names/BRA.json";
import CIV from "../../../data/names/CIV.json";
import CMR from "../../../data/names/CMR.json";
import COL from "../../../data/names/COL.json";
import CRO from "../../../data/names/CRO.json";
import CZE from "../../../data/names/CZE.json";
import DEN from "../../../data/names/DEN.json";
import ENG from "../../../data/names/ENG.json";
import ESP from "../../../data/names/ESP.json";
import FRA from "../../../data/names/FRA.json";
import GER from "../../../data/names/GER.json";
import GHA from "../../../data/names/GHA.json";
import HUN from "../../../data/names/HUN.json";
import IRL from "../../../data/names/IRL.json";
import ISL from "../../../data/names/ISL.json";
import ITA from "../../../data/names/ITA.json";
import JAM from "../../../data/names/JAM.json";
import JPN from "../../../data/names/JPN.json";
import KOR from "../../../data/names/KOR.json";
import MAR from "../../../data/names/MAR.json";
import NED from "../../../data/names/NED.json";
import NGA from "../../../data/names/NGA.json";
import NIR from "../../../data/names/NIR.json";
import NOR from "../../../data/names/NOR.json";
import POL from "../../../data/names/POL.json";
import POR from "../../../data/names/POR.json";
import SCO from "../../../data/names/SCO.json";
import SEN from "../../../data/names/SEN.json";
import SRB from "../../../data/names/SRB.json";
import SUI from "../../../data/names/SUI.json";
import SVK from "../../../data/names/SVK.json";
import SWE from "../../../data/names/SWE.json";
import TUR from "../../../data/names/TUR.json";
import URU from "../../../data/names/URU.json";
import USA from "../../../data/names/USA.json";
import WAL from "../../../data/names/WAL.json";

/** [label, weight]: weight = number of footballers with that name in the source. */
export type WeightedLabel = [string, number];

export interface NameFile {
  code: string;
  given: WeightedLabel[];
  family: WeightedLabel[];
  birthplaces: WeightedLabel[];
}

function parseList(code: string, kind: string, list: unknown): WeightedLabel[] {
  if (!Array.isArray(list)) throw new Error(`names/${code}.json: ${kind} is not a list`);
  return list.map((entry: unknown) => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "number") {
      throw new Error(`names/${code}.json: bad ${kind} entry ${JSON.stringify(entry)}`);
    }
    return [entry[0], entry[1]];
  });
}

function parseNameFile(raw: {
  code: string;
  given: unknown;
  family: unknown;
  birthplaces: unknown;
}): NameFile {
  return {
    code: raw.code,
    given: parseList(raw.code, "given", raw.given),
    family: parseList(raw.code, "family", raw.family),
    birthplaces: parseList(raw.code, "birthplaces", raw.birthplaces),
  };
}

export const nameFiles: Record<string, NameFile> = {
  ARG: parseNameFile(ARG),
  AUS: parseNameFile(AUS),
  AUT: parseNameFile(AUT),
  BEL: parseNameFile(BEL),
  BIH: parseNameFile(BIH),
  BRA: parseNameFile(BRA),
  CIV: parseNameFile(CIV),
  CMR: parseNameFile(CMR),
  COL: parseNameFile(COL),
  CRO: parseNameFile(CRO),
  CZE: parseNameFile(CZE),
  DEN: parseNameFile(DEN),
  ENG: parseNameFile(ENG),
  ESP: parseNameFile(ESP),
  FRA: parseNameFile(FRA),
  GER: parseNameFile(GER),
  GHA: parseNameFile(GHA),
  HUN: parseNameFile(HUN),
  IRL: parseNameFile(IRL),
  ISL: parseNameFile(ISL),
  ITA: parseNameFile(ITA),
  JAM: parseNameFile(JAM),
  JPN: parseNameFile(JPN),
  KOR: parseNameFile(KOR),
  MAR: parseNameFile(MAR),
  NED: parseNameFile(NED),
  NGA: parseNameFile(NGA),
  NIR: parseNameFile(NIR),
  NOR: parseNameFile(NOR),
  POL: parseNameFile(POL),
  POR: parseNameFile(POR),
  SCO: parseNameFile(SCO),
  SEN: parseNameFile(SEN),
  SRB: parseNameFile(SRB),
  SUI: parseNameFile(SUI),
  SVK: parseNameFile(SVK),
  SWE: parseNameFile(SWE),
  TUR: parseNameFile(TUR),
  URU: parseNameFile(URU),
  USA: parseNameFile(USA),
  WAL: parseNameFile(WAL),
};
