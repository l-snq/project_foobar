"use client";

import { useState } from "react";
import type { ScoreEntry } from "../../server/types";

// Home-owner tools: visitor list with kick, invite-by-name.
interface Props {
  scores: ScoreEntry[];
  myId: string | null;
  onKickPlayer: (targetId: string) => void;
  onInvitePlayer: (targetName: string) => void;
}

export default function HomeTools({ scores, myId, onKickPlayer, onInvitePlayer }: Props) {
  const [inviteInput, setInviteInput] = useState("");
  const visitors = scores.filter((s) => s.id !== myId);

  function submitInvite() {
    const name = inviteInput.trim();
    if (!name) return;
    onInvitePlayer(name);
    setInviteInput("");
  }

  return (
    <div className="retro-section">
      <span className="retro-section-label">My home</span>

      <p className="font-bold" style={{ fontSize: 10 }}>Visitors:</p>
      {visitors.length === 0 ? (
        <p style={{ fontSize: 10, color: "var(--ink-dim)" }}>(none right now)</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto retro-scroll">
          {visitors.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-1">
              <span className="truncate" style={{ fontSize: 10 }}>{s.name}</span>
              <button className="retro-btn shrink-0" style={{ fontSize: 9, padding: "2px 5px" }} onClick={() => onKickPlayer(s.id)}>
                KICK
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="font-bold mt-2" style={{ fontSize: 10 }}>Invite player:</p>
      <div className="flex gap-1 mt-0.5">
        <input
          className="retro-input flex-1 min-w-0"
          placeholder="name…"
          value={inviteInput}
          maxLength={24}
          onChange={(e) => setInviteInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") submitInvite();
          }}
        />
        <button className="retro-btn shrink-0" disabled={!inviteInput.trim()} onClick={submitInvite}>
          OK
        </button>
      </div>
    </div>
  );
}
