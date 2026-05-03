"use client";

import { useState, useEffect, useRef } from "react";
import { supabase, fetchUsername } from "@/lib/supabase";
import GameCanvas from "@/components/GameCanvas";

type View = "loading" | "auth" | "game";
type Tab = "signin" | "signup";
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const inputStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(0,30,10,0.55) 0%, rgba(0,60,20,0.45) 100%)",
  border: "1px solid rgba(80,220,120,0.45)",
  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.12)",
};

const btnStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #6ef5a0 0%, #18d868 40%, #0a7a30 100%)",
  border: "1px solid rgba(120,255,160,0.5)",
  boxShadow: "0 4px 20px rgba(0,200,80,0.5), inset 0 1px 0 rgba(255,255,255,0.55)",
  textShadow: "0 1px 3px rgba(0,60,20,0.6)",
};

export default function Home() {
  const [view, setView] = useState<View>("loading");
  const [tab, setTab] = useState<Tab>("signin");
  const [username, setUsername] = useState("");

  // Sign-in fields
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siError, setSiError] = useState("");
  const [siLoading, setSiLoading] = useState(false);

  // Sign-up fields
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suUsername, setSuUsername] = useState("");
  const [suError, setSuError] = useState("");
  const [suLoading, setSuLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const usernameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session) {
          fetchUsername(session.user.id).then((name) => {
            if (name) { setUsername(name); setView("game"); }
            else setView("auth");
          });
        } else {
          setView("auth");
        }
      } else if (event === "SIGNED_IN" && session) {
        fetchUsername(session.user.id).then((name) => {
          if (name) { setUsername(name); setView("game"); }
        });
      } else if (event === "SIGNED_OUT") {
        setUsername("");
        setView("auth");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  function handleUsernameChange(value: string) {
    setSuUsername(value);
    setUsernameStatus("idle");
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);

    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length < 2 || !/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setUsernameStatus("invalid");
      return;
    }

    setUsernameStatus("checking");
    usernameDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", trimmed)
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 400);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSiError("");
    setSiLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail, password: siPassword });
    setSiLoading(false);
    if (error) {
      setSiError(
        error.message.toLowerCase().includes("not confirmed")
          ? "Please confirm your email before signing in. Check your inbox."
          : error.message
      );
    }
    // onAuthStateChange → SIGNED_IN handles the rest
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (usernameStatus !== "available") return;
    setSuError("");
    setSuLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: suEmail,
      password: suPassword,
      options: { data: { username: suUsername.trim() } },
    });
    setSuLoading(false);
    if (error) { setSuError(error.message); return; }
    // data.session is null when email confirmation is required
    if (!data.session) setAwaitingConfirmation(true);
    // If session exists, onAuthStateChange → SIGNED_IN fires automatically
  }

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
        <GameCanvas playerName={username} />
        <button
          className="absolute top-4 right-4 px-3 py-1.5 rounded-xl text-xs font-semibold z-50"
          style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            color: "rgba(255,255,255,0.55)",
          }}
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
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

      <div
        className="relative flex flex-col gap-5 w-80 rounded-3xl overflow-hidden px-8 py-9"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.2) 0%, rgba(80,200,120,0.1) 100%)",
          border: "1px solid rgba(255,255,255,0.35)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 40px rgba(0,140,60,0.5), inset 0 1px 0 rgba(255,255,255,0.45)",
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-2/5 rounded-t-3xl pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)" }} />

        <h1
          className="relative text-white text-3xl font-bold text-center tracking-wide"
          style={{ textShadow: "0 0 24px rgba(80,255,140,0.9), 0 2px 6px rgba(0,0,0,0.6)" }}
        >
          club2k
        </h1>

        {/* Tab switcher */}
        <div
          className="relative flex rounded-xl overflow-hidden"
          style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(80,220,120,0.2)" }}
        >
          {(["signin", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              className="flex-1 py-1.5 text-xs font-bold tracking-wide transition-all"
              style={{
                background: tab === t ? "rgba(80,220,120,0.25)" : "transparent",
                color: tab === t ? "#a0ffb8" : "rgba(150,220,170,0.5)",
                borderRight: t === "signin" ? "1px solid rgba(80,220,120,0.2)" : "none",
              }}
              onClick={() => {
                setTab(t);
                setSiError("");
                setSuError("");
                setAwaitingConfirmation(false);
              }}
            >
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Sign In */}
        {tab === "signin" && (
          <form className="relative flex flex-col gap-3" onSubmit={handleSignIn}>
            <input
              type="email"
              placeholder="Email"
              required
              autoFocus
              className="px-4 py-2.5 rounded-xl text-white placeholder-white/40 outline-none text-sm font-medium"
              style={inputStyle}
              value={siEmail}
              onChange={(e) => setSiEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              className="px-4 py-2.5 rounded-xl text-white placeholder-white/40 outline-none text-sm font-medium"
              style={inputStyle}
              value={siPassword}
              onChange={(e) => setSiPassword(e.target.value)}
            />
            {siError && (
              <p className="text-xs" style={{ color: "#ff8080" }}>{siError}</p>
            )}
            <button
              type="submit"
              disabled={siLoading}
              className="relative px-4 py-2.5 rounded-xl font-bold text-white disabled:opacity-50 overflow-hidden"
              style={btnStyle}
            >
              <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 100%)" }} />
              <span className="relative">{siLoading ? "Signing in…" : "Play"}</span>
            </button>
          </form>
        )}

        {/* Sign Up */}
        {tab === "signup" && (
          awaitingConfirmation ? (
            <div className="relative flex flex-col gap-3 items-center text-center py-2">
              <p className="text-2xl">📬</p>
              <p className="text-sm font-semibold" style={{ color: "#a0ffb8" }}>Check your email</p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(200,255,220,0.7)" }}>
                We sent a confirmation link to <strong>{suEmail}</strong>. Click it to activate your account, then sign in.
              </p>
              <button
                className="text-xs underline mt-1"
                style={{ color: "rgba(150,220,170,0.6)" }}
                onClick={() => { setAwaitingConfirmation(false); setTab("signin"); }}
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form className="relative flex flex-col gap-3" onSubmit={handleSignUp}>
              <input
                type="email"
                placeholder="Email"
                required
                autoFocus
                className="px-4 py-2.5 rounded-xl text-white placeholder-white/40 outline-none text-sm font-medium"
                style={inputStyle}
                value={suEmail}
                onChange={(e) => setSuEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password (8+ chars)"
                required
                minLength={8}
                className="px-4 py-2.5 rounded-xl text-white placeholder-white/40 outline-none text-sm font-medium"
                style={inputStyle}
                value={suPassword}
                onChange={(e) => setSuPassword(e.target.value)}
              />
              {/* Username field with live availability indicator */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Username"
                  required
                  maxLength={24}
                  className="w-full px-4 py-2.5 pr-9 rounded-xl text-white placeholder-white/40 outline-none text-sm font-medium"
                  style={inputStyle}
                  value={suUsername}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm select-none">
                  {usernameStatus === "checking" && (
                    <span style={{ color: "rgba(200,255,220,0.4)" }}>…</span>
                  )}
                  {usernameStatus === "available" && (
                    <span style={{ color: "#5ef5a0" }}>✓</span>
                  )}
                  {(usernameStatus === "taken" || usernameStatus === "invalid") && (
                    <span style={{ color: "#ff8080" }}>✗</span>
                  )}
                </span>
              </div>
              {usernameStatus === "taken" && (
                <p className="text-xs -mt-1.5" style={{ color: "#ff8080" }}>Username is already taken</p>
              )}
              {usernameStatus === "invalid" && (
                <p className="text-xs -mt-1.5" style={{ color: "#ff8080" }}>2–24 characters, letters/numbers/underscores only</p>
              )}
              {suError && (
                <p className="text-xs" style={{ color: "#ff8080" }}>{suError}</p>
              )}
              <button
                type="submit"
                disabled={suLoading || usernameStatus !== "available"}
                className="relative px-4 py-2.5 rounded-xl font-bold text-white disabled:opacity-50 overflow-hidden"
                style={btnStyle}
              >
                <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                  style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 100%)" }} />
                <span className="relative">{suLoading ? "Creating account…" : "Create Account"}</span>
              </button>
            </form>
          )
        )}
      </div>
    </main>
  );
}
