"use client";

interface Props {
  mapId: string;
  playerName: string;
  onlineCount: number;
  onSignOut: () => void;
}

export default function TitleBar({ mapId, playerName, onlineCount, onSignOut }: Props) {
  return (
    <div className="retro-titlebar flex items-center gap-2 px-2 h-full select-none">
      <span className="text-[13px]">▣</span>
      <span>CLUB2K v1.0</span>
      <span className="opacity-60">::</span>
      <span className="font-normal opacity-90">zone: {mapId}</span>
      <span className="flex-1" />
      <span className="font-normal opacity-90 hidden sm:inline">
        logged in as <b>{playerName}</b> · {onlineCount} online
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
