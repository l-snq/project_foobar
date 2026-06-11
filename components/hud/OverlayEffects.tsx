"use client";

import { glass } from "../utils/glassStyles";

// Full-screen feedback: hit flash, rampage announcement, level-up toast, death screen.
interface Props {
  showHitFlash: boolean;
  rampageAnnouncement: string | null;
  levelUpMsg: string | null;
  isDead: boolean;
}

export default function OverlayEffects({ showHitFlash, rampageAnnouncement, levelUpMsg, isDead }: Props) {
  return (
    <>
      {levelUpMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div
            className="px-6 py-2.5 rounded-2xl text-sm font-bold animate-bounce"
            style={{
              background: "linear-gradient(160deg, rgba(255,220,60,0.25) 0%, rgba(180,120,0,0.2) 100%)",
              border: "1px solid rgba(255,200,60,0.5)",
              backdropFilter: "blur(14px)",
              color: "rgba(255,230,100,0.95)",
              textShadow: "0 0 12px rgba(200,160,0,0.8)",
              boxShadow: "0 0 24px rgba(200,140,0,0.4)",
            }}
          >
            {levelUpMsg}
          </div>
        </div>
      )}

      {rampageAnnouncement && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <div
            className="font-black text-xl px-7 py-3 rounded-2xl tracking-wide animate-bounce text-center relative overflow-hidden"
            style={{
              ...glass.panelAmber,
              color: "#ffe0a0",
              textShadow: "0 0 15px rgba(255,160,0,0.8)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
            <span className="relative">{rampageAnnouncement}</span>
          </div>
        </div>
      )}

      {showHitFlash && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 25%, rgba(220,0,0,0.5) 100%)" }}
        />
      )}

      {isDead && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,30,0.72) 100%)" }}
        >
          <div className="text-center px-10 py-7 rounded-3xl relative overflow-hidden" style={glass.panelRed}>
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-3xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />
            <p
              className="relative text-4xl font-bold"
              style={{ color: "#ff8080", textShadow: "0 0 25px rgba(255,80,80,0.8), 0 2px 6px rgba(0,0,0,0.7)" }}
            >
              YOU DIED
            </p>
            <p className="relative text-sm mt-2" style={{ color: "rgba(200,255,220,0.6)" }}>Respawning…</p>
          </div>
        </div>
      )}
    </>
  );
}
