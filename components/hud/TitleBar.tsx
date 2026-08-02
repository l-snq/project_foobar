"use client";

interface Props {
  mapId: string;
  playerName: string;
  onlineCount: number;
  onSignOut: () => void;
}

export default function TitleBar({ mapId, playerName, onlineCount, onSignOut }: Props) {
  return (
    <div className="retro-titlebar flex items-center gap-1.5 px-1.5 h-full select-none">
      <span className="retro-titlebar-glyph">⌄</span>
      <span className="retro-titlebar-glyph">□</span>
      <span className="ml-1">club2k v1.0</span>
      <span style={{ color: "var(--ink-dim)" }}>::</span>
      <span className="font-normal" style={{ color: "var(--ink-dim)" }}>zone: {mapId}</span>
      <span className="flex-1" />
      <span className="font-normal hidden sm:inline" style={{ color: "var(--ink-dim)" }}>
        logged in as <b style={{ color: "var(--ink)" }}>{playerName}</b> · {onlineCount} online
      </span>
      <button
        className="retro-btn font-bold"
        style={{ padding: "1px 6px", fontSize: 10 }}
        onClick={onSignOut}
        title="Sign out"
      >
        LOG OFF
      </button>
    </div>
  );
}
