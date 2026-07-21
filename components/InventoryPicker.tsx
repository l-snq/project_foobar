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
  // null = first load in flight; refetches keep showing the previous list
  const [items, setItems] = useState<StoreItem[] | null>(null);
  const loading = items === null;

  useEffect(() => {
    if (!open) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setItems([]); return; }
      fetch("/api/inventory", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => r.json())
        .then((data) => setItems(Array.isArray(data) ? data : []))
        .catch(() => setItems([]));
    });
  }, [open, refreshKey]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-auto" style={{ background: "rgba(0,0,0,0.3)" }}>
      <div className="bevel-out flex flex-col w-[420px] max-h-[60vh] p-0.5">
        <div className="retro-titlebar flex items-center justify-between px-2 py-1 shrink-0">
          <span>📦 MY INVENTORY</span>
          <button className="retro-btn font-bold" style={{ padding: "0px 5px", fontSize: 11 }} onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="px-2 py-1" style={{ fontSize: 10 }}>Pick an item to place it in your home:</p>

        <div className="overflow-y-auto retro-scroll bevel-in m-1 p-2" style={{ background: "#fff" }}>
          {loading && (
            <p className="text-center py-4" style={{ fontSize: 11 }}>Loading<span className="retro-blink">…</span></p>
          )}
          {items?.length === 0 && (
            <p className="text-center py-4" style={{ fontSize: 11, color: "#555" }}>No items yet. Visit the shop!</p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {(items ?? []).map((item) => (
              <button
                key={item.id}
                className="retro-btn flex flex-col items-center gap-1 p-1.5"
                onClick={() => { onSelectItem(item); onClose(); }}
                title={item.name}
              >
                <div className="bevel-in w-full aspect-square flex items-center justify-center" style={{ background: "#dfdfdf" }}>
                  {item.thumbnail_url
                    ? <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-contain" />
                    : <span style={{ color: "#888", fontSize: 16 }}>?</span>
                  }
                </div>
                <span className="leading-tight text-center w-full truncate" style={{ fontSize: 9 }}>
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
