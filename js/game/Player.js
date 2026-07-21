import { TILE } from './Levels.js';

export const PW = 20, PH = 28;           // player AABB
const ACCEL = 1400, MAX_VX = 190, FRICTION = 1900;
const GRAVITY = 1500, JUMP_V = -450, COYOTE = 0.09;

/**
 * LocalPlayer — fully authoritative on the machine that owns it.
 * No prediction, no rollback: your input moves your body immediately.
 */
export class LocalPlayer {
  constructor(role, x, y) {
    this.role = role;                     // 'fire' | 'water'
    this.reset(x, y);
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.coyote = 0;
    this.facing = 1;
    this.anim = 'idle';
    this.dead = false;
    this.atDoor = false;
  }

  get rect() { return { x: this.x, y: this.y, w: PW, h: PH }; }

  update(dt, input, world) {
    if (this.dead) return;

    // ---- horizontal ----
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      this.vx += dir * ACCEL * dt;
      this.facing = dir;
    } else {
      const drop = FRICTION * dt;
      this.vx = Math.abs(this.vx) <= drop ? 0 : this.vx - Math.sign(this.vx) * drop;
    }
    this.vx = Math.max(-MAX_VX, Math.min(MAX_VX, this.vx));

    // ---- vertical ----
    this.vy += GRAVITY * dt;
    if (this.vy > 900) this.vy = 900;
    if (this.onGround) this.coyote = COYOTE; else this.coyote = Math.max(0, this.coyote - dt);
    if (input.jump && this.coyote > 0) { this.vy = JUMP_V; this.coyote = 0; this.onGround = false; }

    // ---- move & resolve, axis at a time ----
    this.onGround = false;
    this._moveAxis(dt, world, true);
    this._moveAxis(dt, world, false);

    // ---- ride the elevator you're standing on ----
    const carrier = world.carrierUnder(this.rect);
    if (carrier) { this.y += carrier.dy; this.x += carrier.dx; }

    this.anim = !this.onGround ? (this.vy < 0 ? 'jump' : 'fall')
              : (Math.abs(this.vx) > 12 ? 'run' : 'idle');
  }

  _moveAxis(dt, world, horizontal) {
    const step = horizontal ? this.vx * dt : this.vy * dt;
    if (horizontal) this.x += step; else this.y += step;

    for (const s of world.solidsNear(this.rect)) {
      if (!overlap(this.rect, s)) continue;
      if (horizontal) {
        this.x = step > 0 ? s.x - PW : s.x + s.w;
        this.vx = 0;
      } else {
        if (step > 0) { this.y = s.y - PH; this.onGround = true; }
        else          { this.y = s.y + s.h; }
        this.vy = 0;
      }
    }

    // world bounds
    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (this.x + PW > world.width) { this.x = world.width - PW; this.vx = 0; }
  }

  /** Compact transform packet for the unreliable lane. */
  packet(seq) {
    return {
      s: seq,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      vx: Math.round(this.vx), vy: Math.round(this.vy),
      a: this.anim, f: this.facing,
    };
  }
}

/**
 * RemotePlayer — a display-only shell. It never simulates physics; it eases
 * toward the last authoritative transform its owner sent.
 */
export class RemotePlayer {
  constructor(role, x, y) {
    this.role = role;
    this.x = x; this.y = y;
    this.tx = x; this.ty = y;
    this.vx = 0; this.vy = 0;
    this.anim = 'idle'; this.facing = 1;
    this.lastSeq = -1;
    this.dead = false;
  }

  reset(x, y) {
    this.x = this.tx = x; this.y = this.ty = y;
    this.vx = this.vy = 0; this.dead = false; this.lastSeq = -1;
  }

  /** Unordered lane: drop packets that arrived out of order. */
  applyTransform(p) {
    if (p.s <= this.lastSeq) return;
    this.lastSeq = p.s;
    this.tx = p.x; this.ty = p.y;
    this.vx = p.vx; this.vy = p.vy;
    this.anim = p.a; this.facing = p.f;
  }

  update(dt) {
    // Extrapolate a frame with the last known velocity, then LERP onto it.
    this.tx += this.vx * dt;
    this.ty += this.vy * dt;
    const k = 1 - Math.pow(0.0015, dt);   // frame-rate independent smoothing
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    // Snap if we've drifted badly (packet loss burst, tab throttle).
    if (Math.hypot(this.tx - this.x, this.ty - this.y) > TILE * 4) {
      this.x = this.tx; this.y = this.ty;
    }
  }

  get rect() { return { x: this.x, y: this.y, w: PW, h: PH }; }
}

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
