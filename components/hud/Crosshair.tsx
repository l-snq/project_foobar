"use client";

const armStyle = { background: "#b8ffc8", boxShadow: "0 0 3px rgba(80,255,140,0.8)" };

export default function Crosshair({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
    >
      <div className="relative w-7 h-7">
        <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full"
          style={{ background: "#a0ffb8", boxShadow: "0 0 5px rgba(80,255,140,0.9), 0 0 10px rgba(0,200,80,0.5)" }} />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-px h-2.5" style={armStyle} />
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-px h-2.5" style={armStyle} />
        <div className="absolute top-1/2 left-0 -translate-y-1/2 h-px w-2.5" style={armStyle} />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 h-px w-2.5" style={armStyle} />
      </div>
    </div>
  );
}
