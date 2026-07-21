// src/game/Player.js
//
// Гравець існує у двох іпостасях:
//   - локальний  — повна авторитетність, симулюється щокадру;
//   - віддалений — не симулюється взагалі, лише згладжується (LERP)
//     до останнього трансформа, надісланого його власником.

export const PLAYER_W = 30;
export const PLAYER_H = 40;
export const MAX_HP = 100;

export const ROLES = ['fire', 'water'];
export const OTHER_ROLE = { fire: 'water', water: 'fire' };
export const ROLE_COLOR = { fire: '#ff6a3d', water: '#3fd0e8' };
export const ROLE_LABEL = { fire: 'Fireboy', water: 'Watergirl' };

export function createPlayer(role) {
  return {
    role,
    color: ROLE_COLOR[role],
    x: 0, y: 0,
    vx: 0, vy: 0,
    // ціль інтерполяції — використовується лише для віддаленого гравця
    tx: 0, ty: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    hp: MAX_HP,
    maxHp: MAX_HP,
    onGround: false,
    keys: {},
    face: 1,
    anim: 'idle',
    dead: false,
    atDoor: false,
    lastSeq: -1,
    worldWidth: 800,
  };
}

export function respawnPlayer(player, spawn) {
  player.x = player.tx = spawn.x;
  player.y = player.ty = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.hp = player.maxHp;
  player.onGround = false;
  player.dead = false;
  player.atDoor = false;
  player.lastSeq = -1;
  player.keys = {};
}

/** Компактний пакет для ненадійного каналу. */
export function makeTransform(player, seq) {
  return {
    s: seq,
    x: Math.round(player.x * 10) / 10,
    y: Math.round(player.y * 10) / 10,
    vx: Math.round(player.vx),
    vy: Math.round(player.vy),
    anim: player.anim,
    face: player.face,
    hp: Math.round(player.hp),
  };
}

/**
 * Канал неупорядкований, тож пакети можуть приходити не по черзі —
 * усе, що старіше за вже застосоване, просто відкидаємо.
 */
export function applyTransform(player, pkt) {
  if (pkt.s <= player.lastSeq) return;
  player.lastSeq = pkt.s;
  player.tx = pkt.x;
  player.ty = pkt.y;
  player.vx = pkt.vx;
  player.vy = pkt.vy;
  player.anim = pkt.anim;
  player.face = pkt.face;
  if (pkt.hp !== undefined) player.hp = pkt.hp;
}
