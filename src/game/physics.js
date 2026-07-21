// src/game/physics.js
//
// Фізика ЛОКАЛЬНОГО гравця. Рахується на машині власника — тому реакція
// на клавішу миттєва, без мережевої затримки (ТЗ, розділ A).
// Віддалений гравець фізику не рахує взагалі — лише lerpRemote().

import { makeOBB, testOBBCollision } from './obb.js';

export const GRAVITY = 1400;      // px/s^2
export const MOVE_SPEED = 220;    // px/s
export const JUMP_SPEED = -520;   // px/s

export function updatePlayer(player, platforms, dt) {
  const left = player.keys.KeyA || player.keys.ArrowLeft;
  const right = player.keys.KeyD || player.keys.ArrowRight;
  const jump = player.keys.KeyW || player.keys.Space || player.keys.ArrowUp;

  player.vx = left ? -MOVE_SPEED : right ? MOVE_SPEED : 0;
  if (player.vx !== 0) player.face = Math.sign(player.vx);

  if (jump && player.onGround) {
    player.vy = JUMP_SPEED;
    player.onGround = false;
  }

  player.vy += GRAVITY * dt;

  player.x += player.vx * dt;
  resolveAxis(player, platforms, 'x');

  player.y += player.vy * dt;
  player.onGround = false;
  resolveAxis(player, platforms, 'y');

  if (player.x < 0) player.x = 0;
  if (player.x + player.w > player.worldWidth) player.x = player.worldWidth - player.w;

  // Їдемо разом з ліфтом, на якому стоїмо.
  const carrier = carrierUnder(player, platforms);
  if (carrier) player.y += carrier.dy;

  player.anim = !player.onGround
    ? (player.vy < 0 ? 'jump' : 'fall')
    : (player.vx !== 0 ? 'run' : 'idle');
}

function carrierUnder(player, platforms) {
  const feet = player.y + player.h;
  for (const plat of platforms) {
    const e = plat._elevator;
    if (!e) continue;
    if (feet >= e.y - 4 && feet <= e.y + e.h &&
        player.x + player.w > e.x && player.x < e.x + e.w) return e;
  }
  return null;
}

function resolveAxis(player, platforms, axis) {
  for (const plat of platforms) {
    const playerOBB = makeOBB(player.x, player.y, player.w, player.h, 0);
    const platOBB = makeOBB(plat.x, plat.y, plat.w, plat.h, plat.angle || 0);
    const hit = testOBBCollision(playerOBB, platOBB);
    if (!hit) continue;

    const push = hit.overlap;
    const nx = hit.axis.x;
    const ny = hit.axis.y;

    if (axis === 'x') {
      player.x += nx * push;
      player.vx = 0;
    } else {
      player.y += ny * push;
      player.vy = 0;
      if (ny < -0.5) player.onGround = true;
    }
  }
}

/**
 * Згладжування віддаленого гравця (ТЗ: LERP).
 * Спершу екстраполюємо ціль на кадр вперед по останній відомій швидкості —
 * без цього чужий персонаж завжди малюється на пів-RTT позаду і стрибки
 * виглядають ватними. Потім тягнемось до цілі з кроком, незалежним від FPS.
 */
export function lerpRemote(player, dt) {
  player.tx += player.vx * dt;
  player.ty += player.vy * dt;

  const k = 1 - Math.pow(0.0015, dt);
  player.x += (player.tx - player.x) * k;
  player.y += (player.ty - player.y) * k;

  // Після сплеску втрат наздоганяти плавно вже немає сенсу — телепортуємось.
  if (Math.hypot(player.tx - player.x, player.ty - player.y) > 160) {
    player.x = player.tx;
    player.y = player.ty;
  }
}
