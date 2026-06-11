"use client";

import { useState, useEffect } from "react";
import { supabase, fetchUsername } from "@/lib/supabase";
import GameCanvas from "@/components/GameCanvas";
import AdminStorePanel from "@/components/AdminStorePanel";
import AuthScreen from "@/components/AuthScreen";

type View = "loading" | "auth" | "game";

export default function Home() {
  const [view, setView] = useState<View>("loading");
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    let resolved = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session) {
          fetchUsername(session.user.id).then((name) => {
            if (name) { setUsername(name); setUserId(session.user.id); setView("game"); }
            else setView("auth");
            resolved = true;
          });
        } else {
          setView("auth");
          resolved = true;
        }
      } else if (event === "SIGNED_IN" && session && resolved) {
        // Only run on explicit sign-in, not the initial session replay
        fetchUsername(session.user.id).then((name) => {
          if (name) { setUsername(name); setUserId(session.user.id); setView("game"); }
        });
      } else if (event === "SIGNED_OUT") {
        setUsername("");
        setUserId("");
        setView("auth");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (view === "loading") {
    return (
      <main
        className="w-screen h-screen"
        style={{ background: "linear-gradient(160deg, #030f05 0%, #0a2e15 40%, #0a5c28 75%, #14a845 100%)" }}
      />
    );
  }

  if (view === "game") {
    return (
      <main className="w-screen h-screen overflow-hidden bg-black relative">
        <GameCanvas playerName={username} userId={userId} />
        <AdminStorePanel userId={userId} />
        <button
          className="absolute top-4 right-4 px-3 py-1.5 rounded-xl text-xs font-semibold z-50 btn-glass"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            color: "rgba(255,255,255,0.55)",
          }}
          onClick={() => supabase.auth.signOut()}
        >
          Sign Out
        </button>
      </main>
    );
  }

  return <AuthScreen />;
}
