"use client";

import { useState } from "react";
import GameCanvas from "@/components/GameCanvas";

export default function Home() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);

  if (joined) {
    return (
      <main className="w-screen h-screen overflow-hidden bg-black">
        <GameCanvas playerName={name} />
      </main>
    );
  }

  return (
    <main
      className="w-screen h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #030f05 0%, #0a2e15 40%, #0a5c28 75%, #14a845 100%)" }}
    >
      {/* Background glow orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-[520px] h-[520px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, #5df598 0%, transparent 65%)" }} />
        <div className="absolute bottom-1/4 -right-24 w-[420px] h-[420px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #3be87a 0%, transparent 65%)" }} />
        <div className="absolute top-2/3 left-1/3 w-64 h-64 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #a0ffc0 0%, transparent 65%)" }} />
      </div>

      {/* Card */}
      <div
        className="relative flex flex-col gap-5 w-80 rounded-3xl overflow-hidden px-8 py-9"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.2) 0%, rgba(80,200,120,0.1) 100%)",
          border: "1px solid rgba(255,255,255,0.35)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 40px rgba(0,140,60,0.5), inset 0 1px 0 rgba(255,255,255,0.45)",
        }}
      >
        {/* Glossy top shine */}
        <div
          className="absolute top-0 left-0 right-0 h-2/5 rounded-t-3xl pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)" }}
        />

        <h1
          className="relative text-white text-3xl font-bold text-center tracking-wide"
          style={{ textShadow: "0 0 24px rgba(80,255,140,0.9), 0 2px 6px rgba(0,0,0,0.6)" }}
        >
         club2k 
        </h1>

        <input
          className="relative px-4 py-2.5 rounded-xl text-white placeholder-white/40 outline-none text-sm font-medium"
          style={{
            background: "linear-gradient(180deg, rgba(0,30,10,0.55) 0%, rgba(0,60,20,0.45) 100%)",
            border: "1px solid rgba(80,220,120,0.45)",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.12)",
          }}
          placeholder="Enter your name…"
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) setJoined(true);
          }}
          autoFocus
        />

        <button
          className="relative px-4 py-2.5 rounded-xl font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #6ef5a0 0%, #18d868 40%, #0a7a30 100%)",
            border: "1px solid rgba(120,255,160,0.5)",
            boxShadow: "0 4px 20px rgba(0,200,80,0.5), inset 0 1px 0 rgba(255,255,255,0.55)",
            textShadow: "0 1px 3px rgba(0,60,20,0.6)",
          }}
          disabled={!name.trim()}
          onClick={() => setJoined(true)}
        >
          <div
            className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 100%)" }}
          />
          <span className="relative">Play</span>
        </button>
      </div>
    </main>
  );
}
