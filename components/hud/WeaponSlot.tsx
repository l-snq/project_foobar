"use client";

import type { Weapon } from "../../server/types";

interface Props {
  weapon: Weapon;
  ammo: number;
  isReloading: boolean;
}

export default function WeaponSlot({ weapon, ammo, isReloading }: Props) {
  return (
    <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
      {weapon === "pistol" && (
        <div
          className="px-3 py-1 rounded-xl text-sm font-bold tracking-wider"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(80,200,120,0.08) 100%)",
            border: "1px solid rgba(80,220,120,0.35)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 2px 10px rgba(0,160,60,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
          }}
        >
          {isReloading
            ? <span className="animate-pulse" style={{ color: "#ffe066", textShadow: "0 0 8px rgba(255,220,0,0.7)" }}>RELOADING…</span>
            : <span style={{ color: ammo === 0 ? "#ff8080" : "rgba(200,255,220,0.95)" }}>{ammo} / 8</span>
          }
        </div>
      )}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-xs font-bold relative overflow-hidden"
        style={{
          background: weapon === "pistol"
            ? "linear-gradient(160deg, rgba(80,220,120,0.22) 0%, rgba(0,140,60,0.18) 100%)"
            : "linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(40,80,50,0.08) 100%)",
          border: `1px solid ${weapon === "pistol" ? "rgba(80,220,120,0.5)" : "rgba(80,150,100,0.22)"}`,
          backdropFilter: "blur(10px)",
          boxShadow: weapon === "pistol"
            ? "0 0 16px rgba(0,200,80,0.35), inset 0 1px 0 rgba(255,255,255,0.35)"
            : "inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }}
        />
        <span
          className="relative flex flex-col items-center gap-0.5"
          style={{ color: weapon === "pistol" ? "#a0ffb8" : "rgba(150,200,160,0.45)" }}
        >
          <span>GUN</span>
          <span className="text-[9px] opacity-70">[1]</span>
        </span>
      </div>
    </div>
  );
}
