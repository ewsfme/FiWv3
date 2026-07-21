// src/game/render.js

import { ROLE_COLOR } from './Player.js';

const ZONE_FILL = {
  lava:   '#e2452b',
  water:  '#2f8fd8',
  goo:    '#7ac74f',
  damage: 'rgba(230,57,70,0.45)',
  heal:   'rgba(76,201,140,0.45)',
};

export function drawFrame(ctx, canvas, level, players, objects, localRole) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = level.background || '#171a26';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const plat of level.platforms) drawRect(ctx, plat, '#2b3348');

  for (const zone of level.zones) {
    drawRect(ctx, zone, ZONE_FILL[zone.type] || 'rgba(255,255,255,0.15)');
  }

  if (objects) {
    for (const e of objects.elevators) {
      ctx.strokeStyle = 'rgba(245,197,66,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x + e.w / 2, e.yTop);
      ctx.lineTo(e.x + e.w / 2, e.yBottom);
      ctx.stroke();
      drawRect(ctx, { x: e.x, y: e.y, w: e.w, h: e.h }, '#f5c542');
    }

    for (const b of objects.buttons) {
      const down = b.state === 'pressed' ? 5 : 0;
      drawRect(ctx, { x: b.x, y: b.y + down, w: b.w, h: b.h - down },
        b.state === 'pressed' ? '#f5c542' : '#7c8697');
    }

    for (const l of objects.levers) drawLever(ctx, l);

    for (const g of objects.gems) {
      if (!g.taken) drawGem(ctx, g);
    }
  }

  drawDoor(ctx, level.doors.fire, 'fire', players.fire.atDoor);
  drawDoor(ctx, level.doors.water, 'water', players.water.atDoor);

  for (const role of ['fire', 'water']) {
    drawPlayer(ctx, players[role], role === localRole);
  }
}

function drawRect(ctx, r, color) {
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(r.angle || 0);
  ctx.fillStyle = color;
  ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
  ctx.restore();
}

function drawLever(ctx, l) {
  const on = l.state === 'on';
  ctx.fillStyle = '#4a5266';
  ctx.fillRect(l.x, l.y + l.h - 8, l.w, 8);
  ctx.strokeStyle = on ? '#f5c542' : '#8a92a6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(l.x + l.w / 2, l.y + l.h - 6);
  ctx.lineTo(l.x + l.w / 2 + (on ? 10 : -10), l.y);
  ctx.stroke();
}

function drawGem(ctx, g) {
  ctx.fillStyle = ROLE_COLOR[g.role];
  ctx.beginPath();
  ctx.moveTo(g.x + g.w / 2, g.y);
  ctx.lineTo(g.x + g.w, g.y + g.h / 2);
  ctx.lineTo(g.x + g.w / 2, g.y + g.h);
  ctx.lineTo(g.x, g.y + g.h / 2);
  ctx.closePath();
  ctx.fill();
}

function drawDoor(ctx, door, role, occupied) {
  if (!door) return;
  ctx.fillStyle = occupied ? ROLE_COLOR[role] + '55' : 'rgba(255,255,255,0.05)';
  ctx.fillRect(door.x, door.y, door.w, door.h);
  ctx.strokeStyle = ROLE_COLOR[role];
  ctx.lineWidth = 3;
  ctx.strokeRect(door.x + 1.5, door.y + 1.5, door.w - 3, door.h - 3);
}

function drawPlayer(ctx, p, isLocal) {
  ctx.globalAlpha = p.dead ? 0.25 : 1;

  ctx.fillStyle = p.color + '44';
  ctx.fillRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8);
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.fillStyle = '#10131c';
  ctx.fillRect(p.x + (p.face >= 0 ? p.w - 11 : 5), p.y + 9, 6, 6);

  if (isLocal) {
    ctx.strokeStyle = '#ffffff88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + p.w / 2 - 4, p.y - 9);
    ctx.lineTo(p.x + p.w / 2, p.y - 4);
    ctx.lineTo(p.x + p.w / 2 + 4, p.y - 9);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}
