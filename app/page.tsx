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
    return <main className="w-screen h-screen retro-desktop" />;
  }

  if (view === "game") {
    return (
      <main className="w-screen h-screen overflow-hidden relative">
        <GameCanvas playerName={username} userId={userId} onSignOut={() => supabase.auth.signOut()} />
        <AdminStorePanel userId={userId} />
      </main>
    );
  }

  return <AuthScreen />;
}
