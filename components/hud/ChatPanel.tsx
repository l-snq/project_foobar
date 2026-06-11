"use client";

import React from "react";
import { glass } from "../utils/glassStyles";

export interface ChatMessage {
  fromName: string;
  text: string;
  id: number;
}

interface Props {
  chatOpen: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  chatBoxRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLInputElement | null>;
  setChatInput: (s: string) => void;
  setChatOpen: (v: boolean) => void;
  onChatSubmit: () => void;
  onOpenStore: () => void;
  onOpenInventory: (() => void) | null;
}

export default function ChatPanel({
  chatOpen, chatMessages, chatInput, chatBoxRef, chatInputRef,
  setChatInput, setChatOpen, onChatSubmit, onOpenStore, onOpenInventory,
}: Props) {
  return (
    <div className="absolute bottom-4 left-4 w-80 flex flex-col gap-1.5 pointer-events-none">
      {chatOpen && (
        <div
          ref={chatBoxRef}
          className="max-h-48 overflow-y-auto flex flex-col gap-0.5 rounded-2xl px-3 py-2 pointer-events-auto"
          style={glass.panelGreen}
        >
          {chatMessages.map((m) => (
            <div key={m.id} className="text-sm leading-snug">
              <span className="font-semibold" style={{ color: "#7effc0" }}>{m.fromName}: </span>
              <span style={{ color: "rgba(220,255,235,0.9)" }}>{m.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 pointer-events-auto">
        <input
          ref={chatInputRef}
          className={`flex-1 px-3 py-1.5 rounded-xl text-sm outline-none transition-opacity ${chatOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          style={{
            background: "linear-gradient(180deg, rgba(0,30,10,0.6) 0%, rgba(0,50,20,0.5) 100%)",
            border: "1px solid rgba(80,220,120,0.35)",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.1)",
            color: "rgba(220,255,235,0.95)",
          }}
          placeholder="Press T to chat…"
          maxLength={200}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.nativeEvent.stopImmediatePropagation(); onChatSubmit(); setChatOpen(false); chatInputRef.current?.blur(); }
            if (e.key === "Escape") { e.nativeEvent.stopImmediatePropagation(); setChatOpen(false); setChatInput(""); chatInputRef.current?.blur(); }
          }}
        />
        {!chatOpen && (
          <>
            <button
              className="px-3 py-1.5 rounded-xl text-xs pointer-events-auto relative overflow-hidden"
              style={{ ...glass.buttonGreen, color: "rgba(200,255,220,0.8)" }}
              onClick={() => { setChatOpen(true); setTimeout(() => chatInputRef.current?.focus(), 0); }}
            >
              Chat [T]
            </button>
            <button
              className="px-3 py-1.5 rounded-xl text-xs pointer-events-auto relative overflow-hidden"
              style={{ ...glass.buttonYellow, color: "rgba(255,225,120,0.9)" }}
              onClick={onOpenStore}
            >
              Store [B]
            </button>
            {onOpenInventory && (
              <button
                className="px-3 py-1.5 rounded-xl text-xs pointer-events-auto relative overflow-hidden"
                style={{ ...glass.buttonBlue, color: "rgba(180,210,255,0.9)" }}
                onClick={onOpenInventory}
              >
                Inventory
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
