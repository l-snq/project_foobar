"use client";

import React, { useState } from "react";
import type { ScoreEntry } from "../server/types";

export interface HomeManagementProps {
  isHomeRoom: boolean;
  scores: ScoreEntry[];
  myIdRef: React.RefObject<string | null>;
  onKickPlayer: (targetId: string) => void;
  onInvitePlayer: (targetName: string) => void;
  pendingInvite: { fromOwnerName: string; homeRoomId: string } | null;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
}

export default function HomeManagement({
  isHomeRoom, scores, myIdRef,
  onKickPlayer, onInvitePlayer,
  pendingInvite, onAcceptInvite, onDeclineInvite,
}: HomeManagementProps) {
  const [visitorsOpen, setVisitorsOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState("");

  if (!isHomeRoom && !pendingInvite) return null;

  return (
    <>
      {/* Invite notification toast */}
      {pendingInvite && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div
            className="px-6 py-4 rounded-2xl flex flex-col items-center gap-3 relative overflow-hidden"
            style={{
              background: "linear-gradient(160deg, rgba(120,180,255,0.25) 0%, rgba(40,80,200,0.2) 100%)",
              border: "1px solid rgba(120,180,255,0.5)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 8px 32px rgba(40,80,220,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
              minWidth: 260,
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-2xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)" }} />
            <p className="relative text-sm font-semibold text-center" style={{ color: "rgba(200,225,255,0.95)" }}>
              <span style={{ color: "#a8d4ff", fontWeight: 700 }}>{pendingInvite.fromOwnerName}</span> invited you to their home
            </p>
            <div className="relative flex gap-3">
              <button
                className="px-4 py-1.5 rounded-xl text-sm font-bold"
                style={{
                  background: "linear-gradient(180deg, rgba(80,200,120,0.35) 0%, rgba(0,140,60,0.28) 100%)",
                  border: "1px solid rgba(80,220,120,0.6)",
                  color: "#a0ffb8",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                }}
                onClick={onAcceptInvite}
              >
                Accept
              </button>
              <button
                className="px-4 py-1.5 rounded-xl text-sm font-bold"
                style={{
                  background: "linear-gradient(180deg, rgba(255,80,80,0.2) 0%, rgba(180,0,0,0.15) 100%)",
                  border: "1px solid rgba(255,100,100,0.4)",
                  color: "#ff9090",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
                onClick={onDeclineInvite}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visitors toggle button + panel */}
      {isHomeRoom && (
        <div className="absolute bottom-14 left-4 flex flex-col items-start gap-2 pointer-events-auto">
          {visitorsOpen && (
            <div
              className="w-72 flex flex-col gap-3 p-4 rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(160deg, rgba(255,200,120,0.18) 0%, rgba(160,80,0,0.12) 100%)",
                border: "1px solid rgba(255,180,80,0.4)",
                backdropFilter: "blur(18px)",
                boxShadow: "0 8px 30px rgba(180,80,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-2xl pointer-events-none"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />

              <p className="relative text-xs font-bold tracking-widest uppercase"
                style={{ color: "#ffd080", textShadow: "0 0 8px rgba(255,160,0,0.5)" }}>
                Visitors
              </p>

              <div className="relative flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                {scores.filter((s) => s.id !== myIdRef.current).length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(255,210,140,0.5)" }}>No visitors right now</p>
                ) : (
                  scores.filter((s) => s.id !== myIdRef.current).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: "rgba(255,230,180,0.9)" }}>
                        {s.name}
                      </span>
                      <button
                        className="px-2.5 py-0.5 rounded-lg text-xs font-bold flex-shrink-0"
                        style={{
                          background: "linear-gradient(180deg, rgba(255,80,80,0.25) 0%, rgba(180,0,0,0.2) 100%)",
                          border: "1px solid rgba(255,100,100,0.45)",
                          color: "#ff9090",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                        onClick={() => onKickPlayer(s.id)}
                      >
                        Kick
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="relative flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: "rgba(255,180,80,0.25)" }}>
                <p className="text-xs font-semibold" style={{ color: "rgba(255,210,140,0.7)" }}>Invite by name</p>
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-2.5 py-1.5 rounded-xl text-xs outline-none"
                    style={{
                      background: "rgba(0,0,0,0.25)",
                      border: "1px solid rgba(255,180,80,0.35)",
                      color: "rgba(255,230,180,0.95)",
                    }}
                    placeholder="Player name…"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter" && inviteInput.trim()) {
                        onInvitePlayer(inviteInput.trim());
                        setInviteInput("");
                      }
                    }}
                  />
                  <button
                    className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
                    style={{
                      background: "linear-gradient(180deg, rgba(80,200,120,0.3) 0%, rgba(0,140,60,0.22) 100%)",
                      border: "1px solid rgba(80,220,120,0.5)",
                      color: "#a0ffb8",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
                    }}
                    disabled={!inviteInput.trim()}
                    onClick={() => { onInvitePlayer(inviteInput.trim()); setInviteInput(""); }}
                  >
                    Invite
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            className="px-3 py-1.5 rounded-xl text-xs font-semibold relative overflow-hidden"
            style={{
              background: visitorsOpen
                ? "linear-gradient(180deg, rgba(255,160,80,0.28) 0%, rgba(180,80,0,0.2) 100%)"
                : "linear-gradient(180deg, rgba(255,160,80,0.16) 0%, rgba(180,80,0,0.1) 100%)",
              border: `1px solid ${visitorsOpen ? "rgba(255,180,80,0.6)" : "rgba(255,160,80,0.35)"}`,
              backdropFilter: "blur(10px)",
              color: visitorsOpen ? "rgba(255,220,160,0.95)" : "rgba(255,200,130,0.85)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
            onClick={() => setVisitorsOpen((v) => !v)}
          >
            Visitors
          </button>
        </div>
      )}
    </>
  );
}
