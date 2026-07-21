"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StoreItem } from "../server/types";

interface Props {
  open: boolean;
  currency: number;
  onClose: () => void;
  onPurchaseComplete: (newBalance: number) => void;
}

export default function StoreOverlay({ open, currency, onClose, onPurchaseComplete }: Props) {
  // null = not fetched yet; a failed fetch leaves null so reopening retries
  const [items, setItems] = useState<StoreItem[] | null>(null);
  const [buying, setBuying] = useState<string | null>(null); // item id being purchased
  const [feedback, setFeedback] = useState<{ itemId: string; msg: string; ok: boolean } | null>(null);
  const loading = items === null;

  useEffect(() => {
    if (!open || items !== null) return;
    fetch("/api/store")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [open, items]);

  async function handleBuy(item: StoreItem) {
    if (buying) return;
    setBuying(item.id);
    setFeedback(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setFeedback({ itemId: item.id, msg: "Not authenticated.", ok: false }); return; }

      const res = await fetch("/api/store/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, token: session.access_token }),
      });
      const json = await res.json();

      if (!res.ok) {
        setFeedback({ itemId: item.id, msg: json.error ?? "Purchase failed.", ok: false });
        return;
      }
      setFeedback({ itemId: item.id, msg: "Purchased!", ok: true });
      onPurchaseComplete(json.newBalance);
      setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback({ itemId: item.id, msg: "Network error.", ok: false });
    } finally {
      setBuying(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="bevel-out flex flex-col w-[620px] max-h-[80vh] p-0.5">
        {/* Title bar */}
        <div className="retro-titlebar flex items-center justify-between px-2 py-1 shrink-0">
          <span>🛒 CLUB2K ITEM SHOP</span>
          <button className="retro-btn font-bold" style={{ padding: "0px 5px", fontSize: 11 }} onClick={onClose} title="Close [B]">
            ✕
          </button>
        </div>

        {/* Balance strip */}
        <div className="bevel-in mx-1 mt-1 px-2 py-1 flex justify-between" style={{ fontSize: 11, background: "#fff" }}>
          <span>Double-click nothing — single clicks only, it&apos;s {new Date().getFullYear()}.</span>
          <span className="font-bold" style={{ fontFamily: "'Courier New', monospace", color: "#806000" }}>
            BALANCE: ¢{currency.toLocaleString()}
          </span>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto retro-scroll p-2 m-1 bevel-in" style={{ background: "#fff" }}>
          {loading && (
            <p className="text-center py-8" style={{ fontSize: 11 }}>Loading catalogue<span className="retro-blink">…</span></p>
          )}
          {items?.length === 0 && (
            <p className="text-center py-8" style={{ fontSize: 11, color: "#555" }}>No items in the store yet.</p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {(items ?? []).map((item) => {
              const fb = feedback?.itemId === item.id ? feedback : null;
              const isBuying = buying === item.id;
              const canAfford = currency >= item.price;
              return (
                <div key={item.id} className="bevel-out flex flex-col gap-1 p-1.5">
                  <div className="bevel-in w-full aspect-square flex items-center justify-center" style={{ background: "#dfdfdf" }}>
                    {item.thumbnail_url
                      ? <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-contain" />
                      : <span style={{ color: "#888", fontSize: 18 }}>?</span>
                    }
                  </div>

                  <p className="font-bold leading-tight truncate" style={{ fontSize: 10 }} title={item.name}>{item.name}</p>
                  <p style={{ fontSize: 9, color: "#555" }}>{item.category}</p>

                  {fb && (
                    <p className="font-bold" style={{ fontSize: 9, color: fb.ok ? "#006000" : "#b00000" }}>{fb.msg}</p>
                  )}

                  <button
                    disabled={isBuying || !canAfford || fb?.ok === true}
                    className="retro-btn mt-auto font-bold"
                    style={{ fontSize: 10 }}
                    onClick={() => handleBuy(item)}
                  >
                    {isBuying ? "BUYING…" : fb?.ok ? "OWNED" : `BUY ¢${item.price.toLocaleString()}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
