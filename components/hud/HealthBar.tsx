"use client";

interface Props {
  health: number;
  maxHealth: number;
  onRampage: boolean;
}

export default function HealthBar({ health, maxHealth, onRampage }: Props) {
  const healthPct = Math.max(0, health / maxHealth);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
      {onRampage && (
        <span
          className="text-xs font-bold tracking-widest uppercase animate-pulse"
          style={{ color: "#ffb347", textShadow: "0 0 10px rgba(255,140,0,0.8)" }}
        >
          ⚡ RAMPAGE ⚡
        </span>
      )}
      <div
        className="w-52 h-3.5 rounded-full overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(0,30,10,0.7) 0%, rgba(0,50,20,0.6) 100%)",
          border: `1px solid ${onRampage ? "rgba(255,160,50,0.55)" : "rgba(80,220,120,0.4)"}`,
          boxShadow: onRampage
            ? "0 0 10px rgba(255,120,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)"
            : "0 0 10px rgba(0,200,80,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-150 relative overflow-hidden"
          style={{
            width: `${healthPct * 100}%`,
            background: onRampage
              ? "linear-gradient(180deg, #ffb347 0%, #e06800 100%)"
              : healthPct > 0.5
              ? "linear-gradient(180deg, #5ef5b0 0%, #00b87a 100%)"
              : healthPct > 0.25
              ? "linear-gradient(180deg, #ffe066 0%, #d4a000 100%)"
              : "linear-gradient(180deg, #ff8080 0%, #c00000 100%)",
            boxShadow: onRampage
              ? "0 0 8px rgba(255,140,0,0.7)"
              : healthPct > 0.5
              ? "0 0 8px rgba(0,220,130,0.6)"
              : "0 0 8px rgba(255,80,80,0.6)",
          }}
        >
          <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)" }} />
        </div>
      </div>
      <span
        className="text-xs font-semibold"
        style={{
          color: onRampage ? "#ffb347" : "rgba(200,255,220,0.9)",
          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
        }}
      >
        {health} / {maxHealth}
      </span>
    </div>
  );
}
