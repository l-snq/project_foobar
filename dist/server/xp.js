"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENCY_PER_LEVEL = exports.XP_FLUSH_TICKS = exports.XP_PER_OBJECT_PLACED = exports.XP_PER_KILL = exports.IDLE_XP_PER_TICK = void 0;
exports.computeLevel = computeLevel;
exports.IDLE_XP_PER_TICK = 1; // awarded every tick to alive players
exports.XP_PER_KILL = 50;
exports.XP_PER_OBJECT_PLACED = 10;
exports.XP_FLUSH_TICKS = 100; // flush to DB every ~5s (at 20tps)
exports.CURRENCY_PER_LEVEL = 100; // awarded to player on each level-up
// Must match the formula used in the add_xp_and_currency SQL RPC:
//   floor(sqrt(xp / 250)) + 1
function computeLevel(xp) {
    return Math.floor(Math.sqrt(xp / 250)) + 1;
}
