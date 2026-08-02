"use client";

import type { Weapon } from "../../server/types";

interface Props {
  playerName: string;
  health: number;
  maxHealth: number;
  onRampage: boolean;
  weapon: Weapon;
  ammo: number;
  isReloading: boolean;
  xp: number;
  currency: number;
  level: number;
}

function xpForLevel(n: number): number {
  return (n - 1) ** 2 * 250;
}

// Chunky segmented meter, old LAN-game style.
function BlockMeter({ filled, total, color }: { filled: number; total: number; color: string }) {
  return (
    <div className="bevel-in flex gap-[2px] p-[3px]" style={{ background: "var(--well)" }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="h-3 flex-1"
          style={{ background: i < filled ? color : "var(--ui-meter-track)" }}
        />
      ))}
    </div>
  );
}

export default function PlayerPanel({
  playerName, health, maxHealth, onRampage,
  weapon, ammo, isReloading,
  xp, currency, level,
}: Props) {
  const hpBlocks = 10;
  const hpFilled = Math.ceil(Math.max(0, health / maxHealth) * hpBlocks);
  const hpColor = onRampage ? "var(--crt-amber)" : health / maxHealth > 0.25 ? "var(--crt-green)" : "var(--crt-red)";

  const xpStart = xpForLevel(level);
  const xpEnd = xpForLevel(level + 1);
  const xpPct = Math.min(1, (xp - xpStart) / (xpEnd - xpStart));

  return (
    <div className="flex flex-col gap-2 p-2 h-full overflow-y-auto retro-scroll" style={{ fontSize: 11 }}>
      <div className="retro-section">
        <span className="retro-section-label">Pilot</span>
        <p className="font-bold truncate" title={playerName}>{playerName}</p>
        <p style={{ color: "var(--ui-accent)" }}>Level {level}</p>
      </div>

      <div className="retro-section">
        <span className="retro-section-label">Vitals</span>
        {onRampage && (
          <p className="retro-blink font-bold text-center" style={{ color: "var(--ui-danger)", fontSize: 10 }}>
            !! RAMPAGE !!
          </p>
        )}
        <BlockMeter filled={hpFilled} total={hpBlocks} color={hpColor} />
        <p className="text-center mt-1" style={{ fontFamily: "'Courier New', monospace", fontWeight: "bold" }}>
          HP {health}/{maxHealth}
        </p>
      </div>

      <div className="retro-section">
        <span className="retro-section-label">Weapon</span>
        <p className="font-bold">{weapon === "pistol" ? "PISTOL" : "FISTS"} <span className="font-normal" style={{ color: "var(--ink-dim)" }}>[1] to swap</span></p>
        {weapon === "pistol" && (
          <>
            <div className="mt-1">
              <BlockMeter filled={ammo} total={8} color="var(--crt-amber)" />
            </div>
            <p className="text-center mt-1" style={{ fontFamily: "'Courier New', monospace", fontWeight: "bold" }}>
              {isReloading
                ? <span className="retro-blink" style={{ color: "var(--ui-danger)" }}>RELOADING…</span>
                : <span style={{ color: ammo === 0 ? "var(--ui-danger)" : "var(--ink)" }}>AMMO {ammo}/8 {ammo === 0 && "— [R]"}</span>}
            </p>
          </>
        )}
      </div>

      <div className="retro-section">
        <span className="retro-section-label">Progress</span>
        <div className="bevel-in p-[3px]" style={{ background: "var(--well)" }}>
          <div className="h-3" style={{ width: `${xpPct * 100}%`, background: "var(--terracotta)" }} />
        </div>
        <p className="mt-1" style={{ fontFamily: "'Courier New', monospace" }}>
          XP {xp - xpStart}/{xpEnd - xpStart}
        </p>
        <p style={{ fontFamily: "'Courier New', monospace", fontWeight: "bold", color: "var(--ui-gold)" }}>
          ¢ {currency.toLocaleString()} coins
        </p>
      </div>

      <div className="retro-section" style={{ fontSize: 10, color: "var(--ink-dim)" }}>
        <span className="retro-section-label">Controls</span>
        <p>WASD — move</p>
        <p>Click — shoot</p>
        <p>R — reload · Q — emote</p>
        <p>T — chat · B — store</p>
        <p>2 — edit mode (home)</p>
        <p>X — debug hitboxes</p>
      </div>
    </div>
  );
}
