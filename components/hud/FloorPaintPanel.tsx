"use client";

interface Props {
  brushColor: string;
  brushSize: number;
  onBrushColorChange: (c: string) => void;
  onBrushSizeChange: (s: number) => void;
}

export default function FloorPaintPanel({ brushColor, brushSize, onBrushColorChange, onBrushSizeChange }: Props) {
  return (
    <div className="retro-section">
      <span className="retro-section-label">Floor paint</span>

      <label style={{ fontSize: 10 }}>Brush colour</label>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="color"
          value={brushColor}
          className="bevel-in w-8 h-7 cursor-pointer p-0.5"
          onChange={(e) => onBrushColorChange(e.target.value)}
        />
        <span style={{ fontSize: 10, fontFamily: "'Courier New', monospace" }}>{brushColor}</span>
      </div>

      <label style={{ fontSize: 10 }}>Brush size</label>
      <div className="flex gap-1 mt-0.5">
        {[1, 2, 3, 5].map((s) => (
          <button
            key={s}
            className="retro-btn flex-1 font-bold"
            data-pressed={brushSize === s}
            onClick={() => onBrushSizeChange(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <p className="mt-2" style={{ fontSize: 9, color: "#555" }}>
        Click/drag in the viewport to paint. Saved when you exit paint mode.
      </p>
    </div>
  );
}
