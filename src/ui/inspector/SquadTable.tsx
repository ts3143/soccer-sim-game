/** One club's squad: best XI first (with slot and slot OVR), then the rest, then the academy. */
import type { SquadView } from "../../common/api";
import { crestUrl } from "../crests";
import { formatDate, formatEuros } from "../format";

export function SquadTable({ squad }: { squad: SquadView }) {
  const seniors = squad.players.filter((p) => p.status === "club").length;
  return (
    <section id="squad" className="card mb-4">
      <div className="card-body">
        <h3 className="h5 d-flex align-items-center gap-2">
          <img src={crestUrl(squad.code)} alt="" width={28} height={33} />
          {squad.name}
        </h3>
        <p className="small text-body-secondary">
          {squad.formation} · best XI {squad.xiStrength.toFixed(2)} (target {squad.strengthTarget})
          · {seniors} seniors, {squad.players.length - seniors} academy
        </p>
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th className="text-end">#</th>
                <th>Name</th>
                <th>Pos</th>
                <th>Also</th>
                <th>XI slot</th>
                <th className="text-end">Slot OVR</th>
                <th className="text-end">OVR</th>
                <th className="text-end">POT</th>
                <th className="text-end">Age</th>
                <th>Nat</th>
                <th>Foot</th>
                <th className="text-end">Height</th>
                <th className="text-end">Wage/yr</th>
                <th>Contract until</th>
              </tr>
            </thead>
            <tbody>
              {squad.players.map((p, i) => {
                const firstAcademy =
                  p.status === "academy" && squad.players[i - 1]?.status !== "academy";
                const firstBench =
                  p.xiSlot === null && p.status === "club" && squad.players[i - 1]?.xiSlot;
                return (
                  <tr
                    key={p.pid}
                    className={firstAcademy || firstBench ? "border-top border-2" : ""}
                  >
                    <td className="text-end text-body-secondary">{p.shirtNumber ?? ""}</td>
                    <td>
                      {p.name}
                      {p.status === "academy" && (
                        <span className="badge text-bg-light border ms-2">Academy</span>
                      )}
                    </td>
                    <td>{p.position}</td>
                    <td className="text-body-secondary">{p.secondaryPositions.join(", ")}</td>
                    <td>{p.xiSlot ?? ""}</td>
                    <td className="text-end">{p.slotOvr ?? ""}</td>
                    <td className="text-end fw-semibold">{p.ovr}</td>
                    <td className="text-end">{p.pot}</td>
                    <td className="text-end">{p.age}</td>
                    <td>
                      {p.nationality}
                      {p.nationality2 && (
                        <span className="text-body-secondary">/{p.nationality2}</span>
                      )}
                    </td>
                    <td>{p.foot}</td>
                    <td className="text-end">{p.heightCm} cm</td>
                    <td className="text-end">{p.wage === null ? "" : formatEuros(p.wage)}</td>
                    <td>{p.contractExpires ? formatDate(p.contractExpires) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
