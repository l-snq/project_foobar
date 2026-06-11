"use client";

import type { SelectedObjectInfo } from "../game/PlacedObjects";
import { glass } from "../utils/glassStyles";

interface Props {
  selected: SelectedObjectInfo;
  onChange: (next: SelectedObjectInfo) => void;
  onDelete: (id: string) => void;
}

function Slider({ label, min, max, step, value, accent, onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  accent: "green" | "yellow";
  onChange: (v: number) => void;
}) {
  return (
    <div className="relative flex flex-col gap-1">
      <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
        {label}
      </label>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        className={`w-full ${accent === "green" ? "accent-green-400" : "accent-yellow-400"}`}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function ObjectEditPanel({ selected, onChange, onDelete }: Props) {
  const rotDegrees = Math.round(((selected.rotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI);

  return (
    <div
      className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-3 p-4 rounded-2xl w-52 pointer-events-auto overflow-hidden"
      style={glass.panelGreen}
    >
      <div className="absolute inset-x-0 top-0 h-1/3 rounded-t-2xl pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)" }} />

      <p className="relative text-xs font-bold tracking-widest uppercase"
        style={{ color: "#a0ffb8", textShadow: "0 0 8px rgba(0,220,100,0.5)" }}>
        Object
      </p>

      <Slider
        label={`Scale: ${selected.scale.toFixed(2)}x`}
        min={0.1} max={5} step={0.05} accent="green"
        value={selected.scale}
        onChange={(scale) => onChange({ ...selected, scale })}
      />

      <Slider
        label={`Rotation: ${rotDegrees}°`}
        min={0} max={360} step={1} accent="green"
        value={rotDegrees}
        onChange={(deg) => onChange({ ...selected, rotY: deg * Math.PI / 180 })}
      />

      <div className="relative flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "rgba(200,255,220,0.8)" }}>
          Hitbox shape
        </label>
        <div className="flex gap-2">
          {(["cylinder", "box"] as const).map((shape) => (
            <button
              key={shape}
              className="flex-1 py-1 rounded-lg text-xs font-bold capitalize"
              style={{
                background: selected.hitboxShape === shape ? "rgba(80,220,120,0.3)" : "rgba(80,220,120,0.08)",
                border: `1px solid ${selected.hitboxShape === shape ? "rgba(80,220,120,0.7)" : "rgba(80,220,120,0.25)"}`,
                color: selected.hitboxShape === shape ? "#a0ffb8" : "rgba(200,255,220,0.6)",
              }}
              onClick={() => onChange({ ...selected, hitboxShape: shape })}
            >
              {shape}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label={`Hitbox size: ${selected.hitboxRadius.toFixed(2)}`}
        min={0.1} max={8} step={0.05} accent="yellow"
        value={selected.hitboxRadius}
        onChange={(hitboxRadius) => onChange({ ...selected, hitboxRadius })}
      />

      <Slider
        label={`Hitbox offset X: ${selected.hitboxOffsetX.toFixed(2)}`}
        min={-5} max={5} step={0.1} accent="yellow"
        value={selected.hitboxOffsetX}
        onChange={(hitboxOffsetX) => onChange({ ...selected, hitboxOffsetX })}
      />

      <Slider
        label={`Hitbox offset Z: ${selected.hitboxOffsetZ.toFixed(2)}`}
        min={-5} max={5} step={0.1} accent="yellow"
        value={selected.hitboxOffsetZ}
        onChange={(hitboxOffsetZ) => onChange({ ...selected, hitboxOffsetZ })}
      />

      <button
        className="relative py-1.5 rounded-xl text-sm font-bold mt-1"
        style={{
          background: "linear-gradient(180deg, rgba(255,80,80,0.25) 0%, rgba(180,0,0,0.2) 100%)",
          border: "1px solid rgba(255,100,100,0.4)",
          color: "#ff9090",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
        onClick={() => onDelete(selected.id)}
      >
        Delete
      </button>
    </div>
  );
}
