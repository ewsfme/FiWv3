// src/game/obb.js
//
// Oriented Bounding Box колізії через Separating Axis Theorem (SAT).
// Axis-aligned прямокутник — окремий випадок OBB з angle = 0, тому цей
// модуль повністю покриває і платформи/зони (без повороту), і потенційні
// нахилені платформи (angle != 0) без додаткового коду.

/** Створює OBB з прямокутника у форматі {x, y, w, h} (top-left) + кут повороту в радіанах. */
export function makeOBB(x, y, w, h, angle = 0) {
  return { cx: x + w / 2, cy: y + h / 2, hw: w / 2, hh: h / 2, angle };
}

export function getCorners(obb) {
  const { cx, cy, hw, hh, angle } = obb;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

function getAxes(corners) {
  const axes = [];
  for (let i = 0; i < corners.length; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
    const normal = { x: -edge.y, y: edge.x };
    const len = Math.hypot(normal.x, normal.y) || 1;
    axes.push({ x: normal.x / len, y: normal.y / len });
  }
  return axes;
}

function project(corners, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const p = c.x * axis.x + c.y * axis.y;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

/**
 * Повертає null, якщо OBB a і b НЕ перетинаються.
 * Якщо перетинаються — повертає { overlap, axis }, де axis — нормалізований
 * вектор напрямку виштовхування (від b до a), overlap — глибина проникнення.
 * Це і є Minimum Translation Vector (MTV), потрібний для фізичної відповіді.
 */
export function testOBBCollision(a, b) {
  const cornersA = getCorners(a);
  const cornersB = getCorners(b);
  const axes = [...getAxes(cornersA), ...getAxes(cornersB)];

  let minOverlap = Infinity;
  let mtvAxis = null;

  for (const axis of axes) {
    const pa = project(cornersA, axis);
    const pb = project(cornersB, axis);
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (overlap <= 0) return null; // знайдена розділяюча вісь -> перетину немає
    if (overlap < minOverlap) {
      minOverlap = overlap;
      mtvAxis = axis;
    }
  }

  const dir = { x: a.cx - b.cx, y: a.cy - b.cy };
  if (dir.x * mtvAxis.x + dir.y * mtvAxis.y < 0) {
    mtvAxis = { x: -mtvAxis.x, y: -mtvAxis.y };
  }

  return { overlap: minOverlap, axis: mtvAxis };
}

export function obbIntersects(a, b) {
  return testOBBCollision(a, b) !== null;
}
