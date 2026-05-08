"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { StoreItem } from "../server/types";

const ADMIN_IDS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_USER_IDS ?? "").split(",").filter(Boolean),
);

const CATEGORIES = ["furniture", "decoration", "structure", "prop"];

const glassPanel: React.CSSProperties = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.16) 0%, rgba(60,180,100,0.09) 100%)",
  border: "1px solid rgba(255,255,255,0.28)",
  backdropFilter: "blur(18px)",
  boxShadow: "0 8px 30px rgba(0,120,50,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
};

const glassInput: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(0,30,10,0.55) 0%, rgba(0,60,20,0.45) 100%)",
  border: "1px solid rgba(80,220,120,0.45)",
  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.12)",
};

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

  return (
    <>
      {/* Trigger button */}
      <button
        className="absolute bottom-4 right-48 px-3 py-1.5 rounded-xl text-xs font-semibold z-50"
        style={{
          background: "rgba(0,0,0,0.3)",
          border: "1px solid rgba(255,200,60,0.35)",
          backdropFilter: "blur(10px)",
          color: "rgba(255,220,120,0.8)",
        }}
        onClick={() => { resetAdd(); setTab("add"); setOpen(true); }}
      >
        Admin Store
      </button>

      {/* Modal */}
      {open && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="relative flex flex-col gap-4 w-[480px] max-h-[80vh] rounded-2xl p-6 overflow-hidden"
            style={glassPanel}
          >
            {/* Sheen */}
            <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-2xl pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)" }} />

            {/* Header */}
            <div className="relative flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-widest uppercase"
                style={{ color: "#a0ffb8", textShadow: "0 0 8px rgba(0,220,100,0.5)" }}>
                Admin · Store
              </h2>
              <button
                className="text-xs px-2 py-1 rounded-lg"
                style={{ color: "rgba(200,255,220,0.5)", border: "1px solid rgba(80,220,120,0.2)" }}
                onClick={() => { setOpen(false); resetAdd(); }}
              >
                Esc
              </button>
            </div>

            {/* Tabs */}
            <div className="relative flex gap-2">
              {(["add", "manage"] as const).map((t) => (
                <button
                  key={t}
                  className="flex-1 py-1.5 rounded-xl text-xs font-bold capitalize"
                  style={{
                    background: tab === t ? "rgba(80,220,120,0.25)" : "rgba(80,220,120,0.07)",
                    border: `1px solid ${tab === t ? "rgba(80,220,120,0.6)" : "rgba(80,220,120,0.2)"}`,
                    color: tab === t ? "#a0ffb8" : "rgba(160,230,180,0.5)",
                  }}
                  onClick={() => switchTab(t)}
                >
                  {t === "add" ? "Add Item" : "Manage Items"}
                </button>
              ))}
            </div>

            {/* Add tab */}
            {tab === "add" && (
              <form className="relative flex flex-col gap-3" onSubmit={handleSubmit}>
                <input
                  type="text"
                  placeholder="Item name"
                  required
                  maxLength={64}
                  className="px-3 py-2 rounded-xl text-sm outline-none text-white placeholder-white/40"
                  style={glassInput}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Price"
                    required
                    min={0}
                    className="flex-1 px-3 py-2 rounded-xl text-sm outline-none text-white placeholder-white/40"
                    style={glassInput}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                  <select
                    className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                    style={{ ...glassInput, color: "rgba(200,255,220,0.9)" }}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} style={{ background: "#0a2e15" }}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.7)" }}>
                    Model (.glb / .gltf) *
                  </label>
                  <input
                    ref={modelRef}
                    type="file"
                    accept=".glb,.gltf"
                    required
                    className="text-xs file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border-0 file:text-xs file:font-semibold"
                    style={{
                      color: "rgba(200,255,220,0.8)",
                      // @ts-expect-error file selector pseudo-element not typed
                      "--tw-file-bg": "rgba(80,220,120,0.15)",
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.7)" }}>
                    Thumbnail (optional)
                  </label>
                  <input
                    ref={thumbRef}
                    type="file"
                    accept="image/*"
                    className="text-xs"
                    style={{ color: "rgba(200,255,220,0.6)" }}
                  />
                </div>

                {errorMsg && (
                  <p className="text-xs" style={{ color: "#ff8080" }}>{errorMsg}</p>
                )}
                {status === "success" && (
                  <p className="text-xs font-semibold" style={{ color: "#5ef5a0" }}>Item added successfully.</p>
                )}

                <button
                  type="submit"
                  disabled={status === "uploading" || status === "success"}
                  className="py-2 rounded-xl text-sm font-bold relative overflow-hidden disabled:opacity-50"
                  style={{
                    background: "linear-gradient(180deg, #6ef5a0 0%, #18d868 40%, #0a7a30 100%)",
                    border: "1px solid rgba(120,255,160,0.5)",
                    boxShadow: "0 4px 20px rgba(0,200,80,0.4), inset 0 1px 0 rgba(255,255,255,0.5)",
                    color: "white",
                    textShadow: "0 1px 3px rgba(0,60,20,0.6)",
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-xl pointer-events-none"
                    style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)" }} />
                  <span className="relative">
                    {status === "uploading" ? "Uploading…" : "Add to Store"}
                  </span>
                </button>
              </form>
            )}

            {/* Manage tab */}
            {tab === "manage" && (
              <div className="relative flex flex-col gap-2 overflow-y-auto max-h-96">
                {manageLoading && (
                  <p className="text-xs text-center py-6" style={{ color: "rgba(180,255,200,0.5)" }}>Loading…</p>
                )}
                {!manageLoading && manageItems.length === 0 && (
                  <p className="text-xs text-center py-6" style={{ color: "rgba(180,255,200,0.4)" }}>No items in the store.</p>
                )}
                {manageItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl"
                    style={{
                      background: "rgba(0,40,15,0.45)",
                      border: "1px solid rgba(80,220,120,0.18)",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center overflow-hidden"
                      style={{ background: "rgba(0,30,10,0.6)" }}
                    >
                      {item.thumbnail_url
                        ? <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-contain" />
                        : <span style={{ color: "rgba(100,200,130,0.3)", fontSize: 16 }}>▪</span>
                      }
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-xs font-semibold truncate" style={{ color: "rgba(220,255,235,0.9)" }}>
                        {item.name}
                      </span>
                      <span className="text-[10px]" style={{ color: "rgba(150,220,170,0.5)" }}>
                        {item.category} · {item.price.toLocaleString()} coins
                      </span>
                    </div>
                    <button
                      disabled={deleting === item.id}
                      className="px-3 py-1 rounded-lg text-xs font-bold shrink-0 disabled:opacity-40"
                      style={{
                        background: "linear-gradient(180deg, rgba(255,80,80,0.22) 0%, rgba(180,0,0,0.18) 100%)",
                        border: "1px solid rgba(255,100,100,0.4)",
                        color: "#ff9090",
                      }}
                      onClick={() => handleDelete(item.id)}
                    >
                      {deleting === item.id ? "…" : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
