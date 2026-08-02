"use client";

import React from "react";

export interface ChatMessage {
  fromName: string;
  text: string;
  id: number;
}

// Always-visible IRC-style chat strip along the bottom of the frame.
interface Props {
  chatMessages: ChatMessage[];
  chatInput: string;
  chatBoxRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLInputElement | null>;
  setChatInput: (s: string) => void;
  onChatSubmit: () => void;
}

export default function ChatBar({
  chatMessages, chatInput, chatBoxRef, chatInputRef, setChatInput, onChatSubmit,
}: Props) {
  return (
    <div className="flex flex-col gap-1 p-1.5 h-full min-h-0">
      <div
        ref={chatBoxRef}
        className="crt-screen flex-1 min-h-0 overflow-y-auto px-2 py-1"
        style={{ fontSize: 11, lineHeight: "15px" }}
      >
        <div style={{ color: "var(--sage)" }}>*** Welcome to club2k. Type /home or /hub to travel. ***</div>
        {chatMessages.map((m) => (
          <div key={m.id}>
            {m.fromName === "System"
              ? <span style={{ color: "var(--crt-amber)" }}>*** {m.text}</span>
              : <><span style={{ color: "var(--terracotta)" }}>&lt;{m.fromName}&gt;</span> {m.text}</>}
          </div>
        ))}
      </div>
      <div className="flex gap-1 shrink-0">
        <span className="font-bold self-center" style={{ fontSize: 10 }}>SAY:</span>
        <input
          ref={chatInputRef}
          className="retro-input flex-1"
          style={{ fontFamily: "'Courier New', monospace" }}
          placeholder="press T to talk…"
          maxLength={200}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.nativeEvent.stopImmediatePropagation(); onChatSubmit(); chatInputRef.current?.blur(); }
            if (e.key === "Escape") { e.nativeEvent.stopImmediatePropagation(); setChatInput(""); chatInputRef.current?.blur(); }
          }}
        />
        <button className="retro-btn font-bold" onClick={onChatSubmit}>SEND</button>
      </div>
    </div>
  );
}
