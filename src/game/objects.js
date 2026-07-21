// src/game/objects.js
//
// Інтерактивний світ: кнопки, важелі, ліфти, самоцвіти.
// Єдине джерело правди для всього цього — ХОСТ. Клієнт ніколи не змінює
// їх сам: він шле REQUEST_INTERACTION і чекає на STATE_UPDATE.

export function createObjects(level) {
  return {
    buttons: (level.buttons || []).map((b) => ({
      ...b, kind: b.kind || 'button', state: 'released', pressedBy: new Set(),
    })),
    levers: (level.levers || []).map((l) => ({ ...l, state: 'off' })),
    elevators: (level.elevators || []).map((e) => ({
      ...e, y: e.yBottom, dy: 0, active: false,
    })),
    gems: (level.gems || []).map((g) => ({ ...g, taken: false })),
  };
}

/** Прямокутники ліфтів як рухомі платформи для фізики. */
export function elevatorPlatforms(objects) {
  return objects.elevators.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h, _elevator: e }));
}

/**
 * Тік хоста. Повертає список кнопок/важелів, чий стан змінився —
 * викликач розішле по них STATE_UPDATE надійним каналом.
 */
export function hostStepObjects(objects, dt) {
  const changed = [];
  for (const b of objects.buttons) {
    const next = b.pressedBy.size > 0 ? 'pressed' : 'released';
    if (next !== b.state) {
      b.state = next;
      changed.push({ objectId: b.id, state: next });
    }
  }
  stepElevators(objects, dt, true);
  return changed;
}

/**
 * Рух ліфтів. Хост рахує authoritative=true (сам вирішує, чи ліфт активний).
 * Клієнт крутить те саме з authoritative=false — але лише щоб заповнити
 * проміжки між OBJECT_SYNC-пакетами, позиція хоста завжди перезаписує.
 */
export function stepElevators(objects, dt, authoritative) {
  for (const e of objects.elevators) {
    if (authoritative) {
      e.active =
        objects.buttons.some((b) => b.link === e.link && b.state === 'pressed') ||
        objects.levers.some((l) => l.link === e.link && l.state === 'on');
    }
    const target = e.active ? e.yTop : e.yBottom;
    const before = e.y;
    const diff = target - e.y;
    const step = (e.speed || 90) * dt;
    e.y += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    e.dy = e.y - before;
  }
}

export function setPressed(objects, buttonId, role, isPressed) {
  const b = objects.buttons.find((x) => x.id === buttonId);
  if (!b) return;
  if (isPressed) b.pressedBy.add(role);
  else b.pressedBy.delete(role);
}

export function toggleLever(objects, leverId) {
  const l = objects.levers.find((x) => x.id === leverId);
  if (!l) return null;
  l.state = l.state === 'on' ? 'off' : 'on';
  return { objectId: l.id, state: l.state };
}

export function takeGem(objects, gemId, role) {
  const g = objects.gems.find((x) => x.id === gemId);
  if (!g || g.taken || g.role !== role) return null;
  g.taken = true;
  return { objectId: g.id, state: 'taken' };
}

/** Клієнт застосовує авторитетний стан від хоста. */
export function applyObjectState(objects, objectId, state) {
  const b = objects.buttons.find((x) => x.id === objectId);
  if (b) { b.state = state; return; }
  const l = objects.levers.find((x) => x.id === objectId);
  if (l) { l.state = state; return; }
  const g = objects.gems.find((x) => x.id === objectId);
  if (g) g.taken = state === 'taken';
}

export function objectsSnapshot(objects) {
  return objects.elevators.map((e) => ({ id: e.id, y: Math.round(e.y), a: e.active }));
}

export function applyObjectsSnapshot(objects, snap) {
  for (const s of snap) {
    const e = objects.elevators.find((x) => x.id === s.id);
    if (e) { e.y = s.y; e.active = s.a; }
  }
}

export function gemsRemaining(objects) {
  return objects.gems.filter((g) => !g.taken).length;
}
