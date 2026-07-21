// src/game/zones.js
//
// Зони світу. Крім старих damage/heal з'явились елементні: вогонь гине у
// воді, вода — в лаві, зелена слиз вбиває обох. Перевірка навмисно
// локальна: кожен клієнт судить лише про СВОГО гравця (див. ТЗ, Death Rule).

import { makeOBB, obbIntersects } from './obb.js';

const LETHAL = {
  lava:  (role) => role === 'water',
  water: (role) => role === 'fire',
  goo:   () => true,
};

/** Повертає причину смерті ('lava'|'water'|'goo') або null. */
export function checkLethalZones(player, zones) {
  const playerOBB = makeOBB(player.x, player.y, player.w, player.h, 0);
  for (const zone of zones) {
    const test = LETHAL[zone.type];
    if (!test || !test(player.role)) continue;
    const zoneOBB = makeOBB(zone.x, zone.y, zone.w, zone.h, zone.angle || 0);
    if (obbIntersects(playerOBB, zoneOBB)) return zone.type;
  }
  return null;
}

export function applyZones(player, zones, dt) {
  const playerOBB = makeOBB(player.x, player.y, player.w, player.h, 0);

  for (const zone of zones) {
    const zoneOBB = makeOBB(zone.x, zone.y, zone.w, zone.h, zone.angle || 0);
    if (!obbIntersects(playerOBB, zoneOBB)) continue;

    if (zone.type === 'damage') player.hp -= (zone.amount ?? 20) * dt;
    else if (zone.type === 'heal') player.hp += (zone.amount ?? 20) * dt;

    player.hp = Math.max(0, Math.min(player.maxHp, player.hp));
  }
}

export function overlapsRect(player, rect) {
  if (!rect) return false;
  const a = makeOBB(player.x, player.y, player.w, player.h, 0);
  const b = makeOBB(rect.x, rect.y, rect.w, rect.h, rect.angle || 0);
  return obbIntersects(a, b);
}

/** Список об'єктів (кнопки/важелі/самоцвіти), яких торкається гравець. */
export function touching(player, list) {
  return list.filter((o) => !o.taken && overlapsRect(player, o));
}
