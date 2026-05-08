"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StoreItem } from "../server/types";

interface Props {
  open: boolean;
  onClose: () => void;
  refreshKey: number;
  onSelectItem: (item: StoreItem) => void;
}

export default function InventoryPicker({ open, onClose, refreshKey, onSelectItem }: Props) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setLoading(false); return; }
      fetch("/api/inventory", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => r.json())
        .then((data) => setItems(Array.isArray(data) ? data : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    });
  }, [open, refreshKey]);

  if (!open) return null;

  return (
    <div className="absolute bottom-20 left-4 pointer-events-auto z-30">
      <div
        className="flex flex-col gap-3 p-4 rounded-2xl w-96 max-h-72 overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(255,255,255,0.14) 0%, rgba(60,180,100,0.08) 100%)",
          border: "1px solid rgba(255,255,255,0.25)",
          backdropFilter: "blur(18px)",
          boxShadow: "0 8px 30px rgba(0,120,50,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        <div className="flex items-center justify-between shrink-0">
          <span className="text-xs font-bold tracking-widest uppercase"
            style={{ color: "#a0ffb8", textShadow: "0 0 8px rgba(0,220,100,0.5)" }}>
            Inventory
          </span>
          <button
            className="text-xs px-2 py-0.5 rounded-lg"
            style={{ color: "rgba(200,255,220,0.5)", border: "1px solid rgba(80,220,120,0.2)" }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto">
          {loading && (
            <p className="text-xs text-center py-4" style={{ color: "rgba(180,255,200,0.5)" }}>Loading…</p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: "rgba(180,255,200,0.4)" }}>
              No items yet. Visit the shop!
            </p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                className="flex flex-col items-center gap-1 p-1.5 rounded-xl"
                style={{
                  background: "rgba(0,40,15,0.5)",
                  border: "1px solid rgba(80,220,120,0.2)",
                }}
                onClick={() => { onSelectItem(item); onClose(); }}
                title={item.name}
              >
                <div
                  className="w-full aspect-square rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(0,30,10,0.6)" }}
                >
                  {item.thumbnail_url
                    ? <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-contain rounded-lg" />
                    : <span style={{ color: "rgba(100,200,130,0.4)", fontSize: 18 }}>▪</span>
                  }
                </div>
                <span className="text-[9px] leading-tight text-center w-full truncate"
                  style={{ color: "rgba(200,255,220,0.7)" }}>
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
