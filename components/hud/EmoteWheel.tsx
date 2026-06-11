"use client";

const EMOTES = [
  { key: "1", label: "Dance" },
  { key: "2", label: "Breakdance" },
] as const;

export default function EmoteWheel() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
      <div
        className="flex gap-4 px-6 py-4 rounded-2xl"
        style={{
          background: "linear-gradient(160deg, rgba(0,20,10,0.82) 0%, rgba(0,40,20,0.75) 100%)",
          border: "1px solid rgba(80,220,120,0.35)",
          backdropFilter: "blur(18px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        {EMOTES.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center gap-1.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
              style={{
                background: "linear-gradient(180deg, rgba(80,220,120,0.3) 0%, rgba(30,120,60,0.3) 100%)",
                border: "1px solid rgba(80,220,120,0.5)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                color: "#a0ffb8",
              }}
            >
              {key}
            </div>
            <span className="text-xs font-semibold" style={{ color: "rgba(180,255,200,0.8)" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
