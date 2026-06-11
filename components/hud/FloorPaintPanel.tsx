"use client";

import { glass } from "../utils/glassStyles";

interface Props {
  brushColor: string;
  brushSize: number;
  onBrushColorChange: (c: string) => void;
  onBrushSizeChange: (s: number) => void;
}

export default function FloorPaintPanel({ brushColor, brushSize, onBrushColorChange, onBrushSizeChange }: Props) {
  return (
    <div
      className="absolute top-4 right-4 flex flex-col gap-3 p-4 rounded-2xl pointer-events-auto w-48"
      style={glass.panelPurple}
    >
      <p className="text-xs font-bold tracking-widest uppercase"
        style={{ color: "#d8aaff", textShadow: "0 0 8px rgba(180,80,255,0.6)" }}>
        Floor Paint
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "rgba(220,190,255,0.8)" }}>
          Brush colour
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={brushColor}
            className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
            onChange={(e) => onBrushColorChange(e.target.value)}
          />
          <span className="text-xs font-mono" style={{ color: "rgba(200,170,255,0.7)" }}>
            {brushColor}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold" style={{ color: "rgba(220,190,255,0.8)" }}>
          Brush size
        </label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 5].map((s) => (
            <button
              key={s}
              className="flex-1 py-1 rounded-lg text-xs font-bold"
              style={{
                background: brushSize === s ? "rgba(180,100,255,0.4)" : "rgba(180,100,255,0.1)",
                border: `1px solid ${brushSize === s ? "rgba(200,140,255,0.7)" : "rgba(180,100,255,0.25)"}`,
                color: brushSize === s ? "#e0b8ff" : "rgba(200,160,255,0.5)",
              }}
              onClick={() => onBrushSizeChange(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px]" style={{ color: "rgba(200,160,255,0.5)" }}>
        Click or drag to paint · Saved when you exit paint mode
      </p>
    </div>
  );
}
