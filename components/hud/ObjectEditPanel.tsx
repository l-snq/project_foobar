"use client";

import type { SelectedObjectInfo } from "../game/PlacedObjects";

interface Props {
  selected: SelectedObjectInfo;
  onChange: (next: SelectedObjectInfo) => void;
  onDelete: (id: string) => void;
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label style={{ fontSize: 10 }}>{label}</label>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        className="w-full"
        style={{ accentColor: "var(--ui-accent)" }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function ObjectEditPanel({ selected, onChange, onDelete }: Props) {
  const rotDegrees = Math.round(((selected.rotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180 / Math.PI);

  return (
    <div className="retro-section">
      <span className="retro-section-label">Object props</span>

      <Slider
        label={`Scale: ${selected.scale.toFixed(2)}x`}
        min={0.1} max={5} step={0.05}
        value={selected.scale}
        onChange={(scale) => onChange({ ...selected, scale })}
      />

      <Slider
        label={`Rotation: ${rotDegrees}°`}
        min={0} max={360} step={1}
        value={rotDegrees}
        onChange={(deg) => onChange({ ...selected, rotY: deg * Math.PI / 180 })}
      />

      <div className="flex flex-col gap-0.5 mt-1">
        <label style={{ fontSize: 10 }}>Hitbox shape</label>
        <div className="flex gap-1">
          {(["cylinder", "box"] as const).map((shape) => (
            <button
              key={shape}
              className="retro-btn flex-1 capitalize"
              style={{ fontSize: 10 }}
              data-pressed={selected.hitboxShape === shape}
              onClick={() => onChange({ ...selected, hitboxShape: shape })}
            >
              {shape}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label={`Hitbox size: ${selected.hitboxRadius.toFixed(2)}`}
        min={0.1} max={8} step={0.05}
        value={selected.hitboxRadius}
        onChange={(hitboxRadius) => onChange({ ...selected, hitboxRadius })}
      />

      <Slider
        label={`Hitbox offset X: ${selected.hitboxOffsetX.toFixed(2)}`}
        min={-5} max={5} step={0.1}
        value={selected.hitboxOffsetX}
        onChange={(hitboxOffsetX) => onChange({ ...selected, hitboxOffsetX })}
      />

      <Slider
        label={`Hitbox offset Z: ${selected.hitboxOffsetZ.toFixed(2)}`}
        min={-5} max={5} step={0.1}
        value={selected.hitboxOffsetZ}
        onChange={(hitboxOffsetZ) => onChange({ ...selected, hitboxOffsetZ })}
      />

      <button
        className="retro-btn w-full mt-2 font-bold"
        style={{ color: "var(--ui-danger)" }}
        onClick={() => onDelete(selected.id)}
      >
        DELETE OBJECT
      </button>
    </div>
  );
}
