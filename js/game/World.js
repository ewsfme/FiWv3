import { TILE } from './Levels.js';
import { overlap, PW, PH } from './Player.js';

const SOLID = '#';

/**
 * World holds the static tilemap plus the interactive objects.
 * Interactive object *state* is owned by the host; guests render whatever
 * the host tells them and only ever send interaction requests.
 */
export class World {
  constructor(level) {
    this.level = level;
    this.rows = level.map;
    this.cols = this.rows[0].length;
    this.width = this.cols * TILE;
    this.height = this.rows.length * TILE;

    this.spawn = { fire: { x: 0, y: 0 }, water: { x: 0, y: 0 } };
    this.doors = { fire: null, water: null };
    this.hazards = [];   // { x,y,w,h, kind:'lava'|'water'|'goo' }
    this.buttons = [];   // { id, x,y,w,h, link, pressedBy:Set }
    this.gems = [];      // { id, role, x,y,w,h, taken }

    this._parse();

    this.elevators = (level.elevators || []).map((e) => ({
      id: e.id, link: e.link, speed: e.speed,
      x: e.x * TILE, w: e.w * TILE, h: 12,
      yTop: e.yTop * TILE, yBottom: e.yBottom * TILE,
      y: e.yBottom * TILE,
      dx: 0, dy: 0,
      active: false,
    }));
  }

  _parse() {
    let gemN = 0, btnN = 0;
    this.rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const x = c * TILE, y = r * TILE;
        const cell = { x, y, w: TILE, h: TILE };
        switch (ch) {
          case 'f': this.spawn.fire  = { x: x + 6, y: y + TILE - PH }; break;
          case 'w': this.spawn.water = { x: x + 6, y: y + TILE - PH }; break;
          case 'F': this.doors.fire  = { x, y: y - TILE, w: TILE, h: TILE * 2 }; break;
          case 'W': this.doors.water = { x, y: y - TILE, w: TILE, h: TILE * 2 }; break;
          case 'L': this.hazards.push({ ...cell, y: y + 10, h: TILE - 10, kind: 'lava' }); break;
          case 'A': this.hazards.push({ ...cell, y: y + 10, h: TILE - 10, kind: 'water' }); break;
          case 'G': this.hazards.push({ ...cell, y: y + 10, h: TILE - 10, kind: 'goo' }); break;
          case 'r': this.gems.push({ id: 'gem' + gemN++, role: 'fire',  x: x + 8, y: y + 8, w: 16, h: 16, taken: false }); break;
          case 'c': this.gems.push({ id: 'gem' + gemN++, role: 'water', x: x + 8, y: y + 8, w: 16, h: 16, taken: false }); break;
          default:
            if ('1234'.includes(ch)) {
              this.buttons.push({
                id: 'btn' + btnN++, link: ch,
                x: x + 2, y: y + TILE - 8, w: TILE - 4, h: 8,
                pressedBy: new Set(), state: 'released',
              });
            }
        }
      });
    });
  }

  isSolidTile(c, r) {
    if (r < 0 || r >= this.rows.length || c < 0 || c >= this.cols) return true;
    return this.rows[r][c] === SOLID;
  }

  /** Broad-phase: tiles overlapping the body, plus every elevator top. */
  solidsNear(rect) {
    const out = [];
    const c0 = Math.floor((rect.x - 1) / TILE), c1 = Math.floor((rect.x + rect.w + 1) / TILE);
    const r0 = Math.floor((rect.y - 1) / TILE), r1 = Math.floor((rect.y + rect.h + 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.isSolidTile(c, r)) out.push({ x: c * TILE, y: r * TILE, w: TILE, h: TILE });
      }
    }
    for (const e of this.elevators) out.push({ x: e.x, y: e.y, w: e.w, h: e.h });
    return out;
  }

  /** The elevator a body is resting on, so the body inherits its motion. */
  carrierUnder(rect) {
    for (const e of this.elevators) {
      const feet = rect.y + rect.h;
      if (feet >= e.y - 3 && feet <= e.y + e.h &&
          rect.x + rect.w > e.x && rect.x < e.x + e.w) return e;
    }
    return null;
  }

  hazardHitting(rect, role) {
    for (const h of this.hazards) {
      if (!overlap(rect, h)) continue;
      if (h.kind === 'goo') return h.kind;
      if (role === 'fire'  && h.kind === 'water') return h.kind;
      if (role === 'water' && h.kind === 'lava')  return h.kind;
    }
    return null;
  }

  atDoor(rect, role) {
    const d = this.doors[role];
    return !!d && overlap(rect, d);
  }

  buttonsUnder(rect) {
    return this.buttons.filter((b) => overlap(rect, b));
  }

  // ------------------------------------------------------ HOST-ONLY SIM ----

  /**
   * Host: recompute button state from the pressed-by sets, then move elevators.
   * Returns the list of buttons whose state flipped this tick, so the caller
   * can broadcast STATE_UPDATE for them.
   */
  hostStep(dt) {
    const changed = [];
    for (const b of this.buttons) {
      const next = b.pressedBy.size > 0 ? 'pressed' : 'released';
      if (next !== b.state) { b.state = next; changed.push(b); }
    }
    this.stepElevators(dt, true);
    return changed;
  }

  /** Shared elevator motion. Guests run it too, but only as a visual fallback
   *  between OBJECT_SYNC packets — the host's positions always win. */
  stepElevators(dt, authoritative) {
    for (const e of this.elevators) {
      if (authoritative) {
        e.active = this.buttons.some((b) => b.link === e.link && b.state === 'pressed');
      }
      const target = e.active ? e.yTop : e.yBottom;
      const before = e.y;
      const d = target - e.y;
      const step = e.speed * dt;
      e.y += Math.abs(d) <= step ? d : Math.sign(d) * step;
      e.dy = e.y - before;
      e.dx = 0;
    }
  }

  setPressed(buttonId, role, pressed) {
    const b = this.buttons.find((x) => x.id === buttonId);
    if (!b) return;
    if (pressed) b.pressedBy.add(role); else b.pressedBy.delete(role);
  }

  applyObjectState(objectId, state) {
    const b = this.buttons.find((x) => x.id === objectId);
    if (b) { b.state = state; return; }
    const g = this.gems.find((x) => x.id === objectId);
    if (g) { g.taken = state === 'taken'; }
  }

  applyObjectSync(list) {
    for (const s of list) {
      const e = this.elevators.find((x) => x.id === s.id);
      if (e) { e.y = s.y; e.active = s.a; }
    }
  }

  objectSyncPacket() {
    return this.elevators.map((e) => ({ id: e.id, y: Math.round(e.y), a: e.active }));
  }

  gemsRemaining() { return this.gems.filter((g) => !g.taken).length; }
}
