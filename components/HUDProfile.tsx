"use client";

interface Props {
  xp: number;
  currency: number;
  level: number;
}

function xpForLevel(n: number): number {
  return (n - 1) ** 2 * 250;
}

export default function HUDProfile({ xp, currency, level }: Props) {
  const xpStart = xpForLevel(level);
  const xpEnd = xpForLevel(level + 1);
  const progressPct = Math.min(1, (xp - xpStart) / (xpEnd - xpStart));

  return (
    <div
      className="absolute top-4 right-4 flex flex-col items-end gap-1.5 pointer-events-none select-none"
      style={{ minWidth: 140 }}
    >
      {/* Level + currency row */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-lg"
          style={{
            background: "linear-gradient(180deg, rgba(80,220,120,0.3) 0%, rgba(30,120,60,0.3) 100%)",
            border: "1px solid rgba(80,220,120,0.5)",
            color: "#a0ffb8",
            textShadow: "0 0 8px rgba(0,220,100,0.5)",
          }}
        >
          Lv. {level}
        </span>
        <span
          className="text-xs font-semibold"
          style={{ color: "rgba(255,220,80,0.95)", textShadow: "0 0 8px rgba(200,160,0,0.6)" }}
        >
          {currency.toLocaleString()} coins
        </span>
      </div>

      {/* XP bar */}
      <div className="flex flex-col items-end gap-0.5 w-full">
        <div
          className="w-full h-1.5 rounded-full overflow-hidden"
          style={{
            background: "rgba(0,40,15,0.6)",
            border: "1px solid rgba(80,220,120,0.25)",
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct * 100}%`,
              background: "linear-gradient(90deg, #18d868 0%, #5ef5a0 100%)",
              boxShadow: "0 0 6px rgba(0,220,100,0.7)",
            }}
          />
        </div>
        <span className="text-[10px]" style={{ color: "rgba(150,220,170,0.5)" }}>
          {xp - xpStart} / {xpEnd - xpStart} XP
        </span>
      </div>
    </div>
  );
}
