"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "signin" | "signup";
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

// Sign-in / sign-up dialog. Successful auth is handled by the caller's
// supabase.auth.onAuthStateChange subscription.
export default function AuthScreen() {
  const [tab, setTab] = useState<Tab>("signin");

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

  const fieldRow = "flex flex-col gap-0.5";
  const label = { fontSize: 10, fontWeight: "bold" } as const;

  return (
    <main className="retro-desktop w-screen h-screen flex flex-col items-center justify-center gap-4 select-none">
      {/* Wordmark */}
      <h1
        className="font-bold text-center"
        style={{
          fontSize: 42,
          fontFamily: "'Courier New', monospace",
          color: "var(--crt-green)",
          textShadow: "0 0 8px rgba(0,255,100,0.7), 3px 3px 0 #003020",
          letterSpacing: 4,
        }}
      >
        ~ club2k ~
      </h1>

      {/* Login dialog */}
      <div className="bevel-out p-0.5" style={{ width: 340 }}>
        <div className="retro-titlebar flex items-center justify-between px-2 py-1">
          <span>🔑 CONNECT TO CLUB2K</span>
          <span>—</span>
        </div>

        <div className="p-3 flex flex-col gap-3" style={{ fontSize: 11 }}>
          {/* Tabs */}
          <div className="flex gap-1">
            {(["signin", "signup"] as Tab[]).map((t) => (
              <button
                key={t}
                className="retro-btn flex-1 font-bold"
                data-pressed={tab === t}
                onClick={() => {
                  setTab(t);
                  setSiError("");
                  setSuError("");
                  setAwaitingConfirmation(false);
                }}
              >
                {t === "signin" ? "SIGN IN" : "NEW ACCOUNT"}
              </button>
            ))}
          </div>

          {/* Sign In */}
          {tab === "signin" && (
            <form className="flex flex-col gap-2" onSubmit={handleSignIn}>
              <div className={fieldRow}>
                <label style={label}>E-mail address:</label>
                <input
                  type="email" required autoFocus
                  className="retro-input"
                  value={siEmail}
                  onChange={(e) => setSiEmail(e.target.value)}
                />
              </div>
              <div className={fieldRow}>
                <label style={label}>Password:</label>
                <input
                  type="password" required
                  className="retro-input"
                  value={siPassword}
                  onChange={(e) => setSiPassword(e.target.value)}
                />
              </div>
              {siError && <p style={{ fontSize: 10, color: "#b00000" }}>⚠ {siError}</p>}
              <button type="submit" disabled={siLoading} className="retro-btn font-bold py-1.5 mt-1">
                {siLoading ? "CONNECTING…" : "▶ ENTER WORLD"}
              </button>
            </form>
          )}

          {/* Sign Up */}
          {tab === "signup" && (
            awaitingConfirmation ? (
              <div className="flex flex-col gap-2 items-center text-center py-2">
                <p style={{ fontSize: 22 }}>📬</p>
                <p className="font-bold">Check your email</p>
                <p style={{ fontSize: 10 }}>
                  We sent a confirmation link to <b>{suEmail}</b>.<br />
                  Click it to activate your account, then sign in.
                </p>
                <button className="retro-btn mt-1" onClick={() => { setAwaitingConfirmation(false); setTab("signin"); }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              <form className="flex flex-col gap-2" onSubmit={handleSignUp}>
                <div className={fieldRow}>
                  <label style={label}>E-mail address:</label>
                  <input
                    type="email" required autoFocus
                    className="retro-input"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                  />
                </div>
                <div className={fieldRow}>
                  <label style={label}>Password (8+ chars):</label>
                  <input
                    type="password" required minLength={8}
                    className="retro-input"
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                  />
                </div>
                <div className={fieldRow}>
                  <label style={label}>Username:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text" required maxLength={24}
                      className="retro-input flex-1"
                      value={suUsername}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                    />
                    <span style={{ fontSize: 11, width: 14 }}>
                      {usernameStatus === "checking" && "…"}
                      {usernameStatus === "available" && <span style={{ color: "#006000", fontWeight: "bold" }}>✓</span>}
                      {(usernameStatus === "taken" || usernameStatus === "invalid") && <span style={{ color: "#b00000", fontWeight: "bold" }}>✗</span>}
                    </span>
                  </div>
                </div>
                {usernameStatus === "taken" && <p style={{ fontSize: 10, color: "#b00000" }}>⚠ Username is already taken</p>}
                {usernameStatus === "invalid" && <p style={{ fontSize: 10, color: "#b00000" }}>⚠ 2–24 characters, letters/numbers/underscores only</p>}
                {suError && <p style={{ fontSize: 10, color: "#b00000" }}>⚠ {suError}</p>}
                <button
                  type="submit"
                  disabled={suLoading || usernameStatus !== "available"}
                  className="retro-btn font-bold py-1.5 mt-1"
                >
                  {suLoading ? "CREATING…" : "★ CREATE ACCOUNT"}
                </button>
              </form>
            )
          )}
        </div>
      </div>

      {/* Neocities-style footer */}
      <div className="text-center" style={{ fontSize: 10, color: "#3fae8a", fontFamily: "'Courier New', monospace" }}>
        <p>best viewed at 1024×768 · 16-bit colour</p>
        <p>
          you are visitor № <span className="bevel-in px-1" style={{ background: "#000", color: "var(--crt-green)" }}>0042817</span>
          {" "}· est. 2000 <span className="retro-blink">_</span>
        </p>
      </div>
    </main>
  );
}
