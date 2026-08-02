"use client";

import type { ScoreEntry } from "../../server/types";

interface Props {
  scores: ScoreEntry[];
  myId: string | null;
}

export default function Scoreboard({ scores, myId }: Props) {
  return (
    <div className="retro-section">
      <span className="retro-section-label">Players online</span>
      <table className="w-full" style={{ fontSize: 10, fontFamily: "'Courier New', monospace" }}>
        <thead>
          <tr style={{ color: "var(--ui-accent)" }}>
            <th className="text-left font-bold">NAME</th>
            <th className="text-right font-bold w-7">K</th>
            <th className="text-right font-bold w-7">D</th>
          </tr>
        </thead>
        <tbody>
          {[...scores]
            .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
            .map((s) => (
              <tr key={s.id} style={{ background: s.id === myId ? "var(--ui-accent)" : "transparent", color: s.id === myId ? "var(--well)" : "var(--ink)" }}>
                <td className="truncate max-w-0" style={{ width: "100%" }}>{s.id === myId ? "» " : ""}{s.name}</td>
                <td className="text-right">{s.kills}</td>
                <td className="text-right">{s.deaths}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
