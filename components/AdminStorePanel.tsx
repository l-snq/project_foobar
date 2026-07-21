"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StoreItem } from "../server/types";

const ADMIN_IDS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_USER_IDS ?? "").split(",").filter(Boolean),
);

const CATEGORIES = ["furniture", "decoration", "structure", "prop"];

interface Props {
  userId: string;
}

export default function AdminStorePanel({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"add" | "manage">("add");

  // Add tab state
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("furniture");
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const modelRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  // Manage tab state
  const [manageItems, setManageItems] = useState<StoreItem[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (!ADMIN_IDS.has(userId)) return null;

  function resetAdd() {
    setName("");
    setPrice("");
    setCategory("furniture");
    setStatus("idle");
    setErrorMsg("");
    if (modelRef.current) modelRef.current.value = "";
    if (thumbRef.current) thumbRef.current.value = "";
  }

  async function loadManageItems() {
    setManageLoading(true);
    try {
      const res = await fetch("/api/store");
      const data = await res.json();
      setManageItems(Array.isArray(data) ? data : []);
    } catch { setManageItems([]); }
    finally { setManageLoading(false); }
  }

  function switchTab(t: "add" | "manage") {
    setTab(t);
    if (t === "manage") loadManageItems();
  }

  async function handleDelete(itemId: string) {
    if (deleting) return;
    setDeleting(itemId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/admin/store", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: session.access_token, itemId }),
      });
      if (res.ok) setManageItems((prev) => prev.filter((i) => i.id !== itemId));
    } finally {
      setDeleting(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const model = modelRef.current?.files?.[0];
    if (!model) { setErrorMsg("A model file is required."); return; }

    const parsedPrice = parseInt(price, 10);
    if (isNaN(parsedPrice) || parsedPrice < 0) { setErrorMsg("Enter a valid price."); return; }

    setStatus("uploading");
    setErrorMsg("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setStatus("error"); setErrorMsg("Not authenticated."); return; }

      const form = new FormData();
      form.append("token", session.access_token);
      form.append("name", name.trim());
      form.append("price", String(parsedPrice));
      form.append("category", category);
      form.append("model", model);
      const thumb = thumbRef.current?.files?.[0];
      if (thumb) form.append("thumbnail", thumb);

      const res = await fetch("/api/admin/store", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.error ?? "Upload failed.");
        return;
      }

      setStatus("success");
      setTimeout(() => { setOpen(false); resetAdd(); }, 1500);
    } catch {
      setStatus("error");
      setErrorMsg("Network error.");
    }
  }

  const label = { fontSize: 10, fontWeight: "bold" } as const;

  return (
    <>
      {/* Trigger button — sits in the title bar row, left of LOG OFF */}
      <button
        className="retro-btn absolute font-bold z-50"
        style={{ top: 13, right: 80, padding: "1px 6px", fontSize: 10 }}
        onClick={() => { resetAdd(); setTab("add"); setOpen(true); }}
      >
        ADMIN
      </button>

      {/* Modal */}
      {open && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <div className="bevel-out flex flex-col w-[440px] max-h-[80vh] p-0.5">
            <div className="retro-titlebar flex items-center justify-between px-2 py-1 shrink-0">
              <span>🔧 STORE ADMINISTRATION</span>
              <button
                className="retro-btn font-bold"
                style={{ padding: "0px 5px", fontSize: 11 }}
                onClick={() => { setOpen(false); resetAdd(); }}
              >
                ✕
              </button>
            </div>

            <div className="p-2 flex flex-col gap-2" style={{ fontSize: 11 }}>
              {/* Tabs */}
              <div className="flex gap-1">
                {(["add", "manage"] as const).map((t) => (
                  <button
                    key={t}
                    className="retro-btn flex-1 font-bold"
                    data-pressed={tab === t}
                    onClick={() => switchTab(t)}
                  >
                    {t === "add" ? "ADD ITEM" : "MANAGE ITEMS"}
                  </button>
                ))}
              </div>

              {/* Add tab */}
              {tab === "add" && (
                <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
                  <div className="flex flex-col gap-0.5">
                    <label style={label}>Item name:</label>
                    <input
                      type="text" required maxLength={64}
                      className="retro-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex flex-col gap-0.5 flex-1">
                      <label style={label}>Price:</label>
                      <input
                        type="number" required min={0}
                        className="retro-input w-full"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5 flex-1">
                      <label style={label}>Category:</label>
                      <select
                        className="retro-input w-full"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <label style={label}>Model (.glb / .gltf) *</label>
                    <input ref={modelRef} type="file" accept=".glb,.gltf" required style={{ fontSize: 10 }} />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <label style={label}>Thumbnail (optional):</label>
                    <input ref={thumbRef} type="file" accept="image/*" style={{ fontSize: 10 }} />
                  </div>

                  {errorMsg && <p style={{ fontSize: 10, color: "#b00000" }}>⚠ {errorMsg}</p>}
                  {status === "success" && <p className="font-bold" style={{ fontSize: 10, color: "#006000" }}>Item added successfully.</p>}

                  <button
                    type="submit"
                    disabled={status === "uploading" || status === "success"}
                    className="retro-btn font-bold py-1.5 mt-1"
                  >
                    {status === "uploading" ? "UPLOADING…" : "ADD TO STORE"}
                  </button>
                </form>
              )}

              {/* Manage tab */}
              {tab === "manage" && (
                <div className="bevel-in flex flex-col gap-1 overflow-y-auto retro-scroll max-h-96 p-1.5" style={{ background: "#fff" }}>
                  {manageLoading && (
                    <p className="text-center py-6" style={{ fontSize: 11 }}>Loading<span className="retro-blink">…</span></p>
                  )}
                  {!manageLoading && manageItems.length === 0 && (
                    <p className="text-center py-6" style={{ fontSize: 11, color: "#555" }}>No items in the store.</p>
                  )}
                  {manageItems.map((item) => (
                    <div key={item.id} className="bevel-out flex items-center gap-2 px-2 py-1">
                      <div className="bevel-in w-9 h-9 shrink-0 flex items-center justify-center overflow-hidden" style={{ background: "#dfdfdf" }}>
                        {item.thumbnail_url
                          ? <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-contain" />
                          : <span style={{ color: "#888" }}>?</span>
                        }
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-bold truncate" style={{ fontSize: 10 }}>{item.name}</span>
                        <span style={{ fontSize: 9, color: "#555" }}>
                          {item.category} · ¢{item.price.toLocaleString()}
                        </span>
                      </div>
                      <button
                        disabled={deleting === item.id}
                        className="retro-btn shrink-0 font-bold"
                        style={{ fontSize: 9, color: "#b00000" }}
                        onClick={() => handleDelete(item.id)}
                      >
                        {deleting === item.id ? "…" : "DELETE"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
