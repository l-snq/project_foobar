"use client";

interface Props {
  fromOwnerName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export default function InviteDialog({ fromOwnerName, onAccept, onDecline }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.35)" }}>
      <div className="bevel-out p-0.5" style={{ minWidth: 300 }}>
        <div className="retro-titlebar px-2 py-0.5">INCOMING INVITE</div>
        <div className="p-4" style={{ fontSize: 11 }}>
          <p className="mb-3">
            <b>{fromOwnerName}</b> invited you to their home. Travel there now?
          </p>
          <div className="flex justify-center gap-2">
            <button className="retro-btn font-bold px-5" onClick={onAccept}>YES</button>
            <button className="retro-btn px-5" onClick={onDecline}>NO</button>
          </div>
        </div>
      </div>
    </div>
  );
}
