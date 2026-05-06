export const IDLE_XP_PER_TICK = 1;       // awarded every tick to alive players
export const XP_PER_KILL = 50;
export const XP_PER_OBJECT_PLACED = 10;
export const XP_FLUSH_TICKS = 100;        // flush to DB every ~5s (at 20tps)
export const CURRENCY_PER_LEVEL = 100;    // awarded to player on each level-up

// Must match the formula used in the add_xp_and_currency SQL RPC:
//   floor(sqrt(xp / 250)) + 1
export function computeLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 250)) + 1;
}
