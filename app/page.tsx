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
    <main className="w-screen h-screen flex items-center justify-center bg-gray-900">
      <div className="flex flex-col gap-4 w-72">
        <h1 className="text-white text-3xl font-bold text-center">project_foobar</h1>
        <input
          className="px-4 py-2 rounded bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500"
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
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          disabled={!name.trim()}
          onClick={() => setJoined(true)}
        >
          Play
        </button>
      </div>
    </main>
  );
}
