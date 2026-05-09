/**
 * Frutiger Aero dark-glass style constants.
 *
 * All panels use a deep, tinted dark base so they read clearly on both dark
 * and light backgrounds.  The glass identity is preserved through:
 *   - backdrop-filter blur (frosted depth)
 *   - colored border accents
 *   - colored outer box-shadow glow
 *   - top-of-panel shine overlay (add a half-height <div> with style={glass.shine})
 */

export const glass = {
  // ── Panels ──────────────────────────────────────────────────────────────
  panel: {
    background: "linear-gradient(160deg, rgba(8,28,16,0.90) 0%, rgba(4,40,18,0.86) 100%)",
    border: "1px solid rgba(255,255,255,0.18)",
    backdropFilter: "blur(22px)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)",
  },
  panelGreen: {
    background: "linear-gradient(160deg, rgba(0,36,18,0.92) 0%, rgba(0,56,26,0.88) 100%)",
    border: "1px solid rgba(80,220,120,0.32)",
    backdropFilter: "blur(22px)",
    boxShadow: "0 8px 32px rgba(0,80,40,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
  },
  panelBlue: {
    background: "linear-gradient(160deg, rgba(4,16,44,0.92) 0%, rgba(6,24,72,0.88) 100%)",
    border: "1px solid rgba(120,180,255,0.38)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 8px 32px rgba(20,60,200,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
  },
  panelOrange: {
    background: "linear-gradient(160deg, rgba(32,14,4,0.92) 0%, rgba(50,22,4,0.88) 100%)",
    border: "1px solid rgba(255,180,80,0.38)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 8px 30px rgba(160,70,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
  },
  panelAmber: {
    background: "linear-gradient(160deg, rgba(36,20,0,0.92) 0%, rgba(56,32,0,0.88) 100%)",
    border: "1px solid rgba(255,180,50,0.45)",
    backdropFilter: "blur(14px)",
    boxShadow: "0 0 24px rgba(200,130,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
  },
  panelPurple: {
    background: "linear-gradient(160deg, rgba(20,8,42,0.92) 0%, rgba(32,10,68,0.88) 100%)",
    border: "1px solid rgba(200,140,255,0.38)",
    backdropFilter: "blur(16px)",
    boxShadow: "0 8px 30px rgba(100,30,220,0.4), inset 0 1px 0 rgba(255,255,255,0.12)",
  },
  panelRed: {
    background: "linear-gradient(160deg, rgba(50,8,8,0.92) 0%, rgba(68,4,4,0.88) 100%)",
    border: "1px solid rgba(255,100,100,0.35)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 0 50px rgba(180,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
  },

  // ── Buttons ─────────────────────────────────────────────────────────────
  buttonGreen: {
    background: "linear-gradient(160deg, rgba(0,40,20,0.82) 0%, rgba(0,62,28,0.74) 100%)",
    border: "1px solid rgba(80,220,120,0.38)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 2px 10px rgba(0,120,55,0.3), inset 0 1px 0 rgba(255,255,255,0.18)",
  },
  buttonYellow: {
    background: "linear-gradient(160deg, rgba(40,28,0,0.82) 0%, rgba(62,42,0,0.74) 100%)",
    border: "1px solid rgba(255,200,60,0.42)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 2px 10px rgba(180,120,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)",
  },
  buttonBlue: {
    background: "linear-gradient(160deg, rgba(4,14,42,0.82) 0%, rgba(6,22,68,0.74) 100%)",
    border: "1px solid rgba(120,180,255,0.38)",
    backdropFilter: "blur(10px)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
  },
  buttonPurple: {
    background: "linear-gradient(160deg, rgba(22,8,46,0.82) 0%, rgba(36,12,72,0.74) 100%)",
    border: "1px solid rgba(180,120,255,0.42)",
    backdropFilter: "blur(10px)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
  },
  buttonRed: {
    background: "linear-gradient(160deg, rgba(55,8,8,0.82) 0%, rgba(80,4,4,0.74) 100%)",
    border: "1px solid rgba(255,100,100,0.42)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
  },
  buttonOrange: {
    background: "linear-gradient(160deg, rgba(50,22,4,0.82) 0%, rgba(75,35,4,0.74) 100%)",
    border: "1px solid rgba(255,160,80,0.42)",
    backdropFilter: "blur(10px)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
  },

  // ── Utility ─────────────────────────────────────────────────────────────
  /** Use as the background of a half-height absolute div at the top of any panel */
  shine: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)",
} as const;
