"use client";

import type { ScoreEntry } from "../../server/types";
import { glass } from "../utils/glassStyles";

interface Props {
  scores: ScoreEntry[];
  myId: string | null;
}

export default function Scoreboard({ scores, myId }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="rounded-3xl px-7 py-5 min-w-72 relative overflow-hidden" style={glass.panelGreen}>
        <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-3xl pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
        <h2
          className="relative text-center text-lg font-bold mb-3 tracking-widest uppercase"
          style={{ color: "#a0ffb8", textShadow: "0 0 15px rgba(0,220,100,0.6)" }}
        >
          Scoreboard
        </h2>
        <table className="relative w-full text-sm">
          <thead>
            <tr style={{ color: "rgba(150,230,180,0.7)", borderBottom: "1px solid rgba(80,200,120,0.25)" }}>
              <th className="text-left pb-1 font-semibold">Player</th>
              <th className="text-center pb-1 font-semibold w-16">Kills</th>
              <th className="text-center pb-1 font-semibold w-16">Deaths</th>
            </tr>
          </thead>
          <tbody>
            {[...scores]
              .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
              .map((s) => (
                <tr key={s.id} style={{ color: s.id === myId ? "#7effc0" : "rgba(220,255,235,0.9)" }}>
                  <td className="py-0.5">{s.name}</td>
                  <td className="text-center font-bold" style={{ color: "#5ef5a0" }}>{s.kills}</td>
                  <td className="text-center" style={{ color: "#ff8080" }}>{s.deaths}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="relative text-xs text-center mt-3" style={{ color: "rgba(150,220,170,0.5)" }}>Hold Tab to view</p>
      </div>
    </div>
  );
}
