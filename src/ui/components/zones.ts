/** Table-row colours for league zones (Standings, the Dashboard's mini table). */
import type { TableZone } from "../../common/api";

export const ZONE_CLASS: Record<Exclude<TableZone, null>, string> = {
  champions: "table-success",
  promoted: "table-success",
  playoffs: "table-info",
  relegated: "table-danger",
};
