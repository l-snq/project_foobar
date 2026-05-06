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
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState<string | null>(null); // item id being purchased
  const [feedback, setFeedback] = useState<{ itemId: string; msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!open || items.length > 0) return;
    setLoading(true);
    fetch("/api/store")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

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
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        className="relative flex flex-col w-[640px] max-h-[80vh] rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.14) 0%, rgba(60,180,100,0.08) 100%)",
          border: "1px solid rgba(255,255,255,0.25)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 12px 40px rgba(0,100,40,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        {/* Sheen */}
        <div className="absolute inset-x-0 top-0 h-24 pointer-events-none rounded-t-2xl"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)" }} />

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(80,220,120,0.2)" }}>
          <h2 className="text-base font-bold tracking-widest uppercase"
            style={{ color: "#a0ffb8", textShadow: "0 0 10px rgba(0,220,100,0.6)" }}>
            Store
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold"
              style={{ color: "rgba(255,220,80,0.95)", textShadow: "0 0 8px rgba(200,160,0,0.5)" }}>
              {currency.toLocaleString()} coins
            </span>
            <button
              className="text-xs px-3 py-1 rounded-lg"
              style={{ color: "rgba(200,255,220,0.6)", border: "1px solid rgba(80,220,120,0.25)" }}
              onClick={onClose}
            >
              Close [B]
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="relative overflow-y-auto p-5">
          {loading && (
            <p className="text-center text-sm py-8" style={{ color: "rgba(180,255,200,0.5)" }}>
              Loading…
            </p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: "rgba(180,255,200,0.5)" }}>
              No items in the store yet.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => {
              const fb = feedback?.itemId === item.id ? feedback : null;
              const isBuying = buying === item.id;
              const canAfford = currency >= item.price;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 p-3 rounded-xl overflow-hidden"
                  style={{
                    background: "linear-gradient(160deg, rgba(255,255,255,0.1) 0%, rgba(40,120,70,0.08) 100%)",
                    border: "1px solid rgba(80,220,120,0.2)",
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className="w-full aspect-square rounded-lg flex items-center justify-center text-2xl"
                    style={{ background: "rgba(0,40,15,0.5)" }}
                  >
                    {item.thumbnail_url
                      ? <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-contain rounded-lg" />
                      : <span style={{ color: "rgba(100,200,130,0.3)" }}>▪</span>
                    }
                  </div>

                  <p className="text-xs font-semibold leading-tight" style={{ color: "rgba(220,255,235,0.9)" }}>
                    {item.name}
                  </p>
                  <p className="text-[10px]" style={{ color: "rgba(150,220,170,0.5)" }}>
                    {item.category}
                  </p>

                  {fb && (
                    <p className="text-xs font-semibold" style={{ color: fb.ok ? "#5ef5a0" : "#ff8080" }}>
                      {fb.msg}
                    </p>
                  )}

                  <button
                    disabled={isBuying || !canAfford || fb?.ok === true}
                    className="mt-auto py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                    style={{
                      background: canAfford
                        ? "linear-gradient(180deg, rgba(255,220,60,0.3) 0%, rgba(180,120,0,0.25) 100%)"
                        : "rgba(80,80,80,0.2)",
                      border: `1px solid ${canAfford ? "rgba(255,200,60,0.5)" : "rgba(120,120,120,0.3)"}`,
                      color: canAfford ? "rgba(255,230,100,0.95)" : "rgba(150,150,150,0.6)",
                    }}
                    onClick={() => handleBuy(item)}
                  >
                    {isBuying ? "Buying…" : fb?.ok ? "Owned" : `${item.price.toLocaleString()} coins`}
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
