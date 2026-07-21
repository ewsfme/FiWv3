import { MSG } from '../net/Protocol.js';
import { LEVELS, TILE } from './Levels.js';
import { World } from './World.js';
import { LocalPlayer, RemotePlayer, PW, PH, overlap } from './Player.js';

const SEND_HZ = 33;                 // transform broadcast rate
const OTHER = { fire: 'water', water: 'fire' };

const PALETTE = {
  fire:  { body: '#ff6a3d', glow: 'rgba(255,106,61,.45)' },
  water: { body: '#3fd0e8', glow: 'rgba(63,208,232,.45)' },
  lava:  '#e2452b', water_: '#2f8fd8', goo: '#7ac74f',
};

export class Game {
  constructor(net, canvas, ui) {
    this.net = net;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;                    // { onComplete(levelId), onStatus(text) }

    this.hostRole = 'fire';          // which character the HOST controls
    this.levelId = null;
    this.world = null;
    this.running = false;
    this.seq = 0;
    this.sendAcc = 0;
    this.doorFlags = { fire: false, water: false };
    this.pressed = new Set();        // buttons the LOCAL player is standing on

    this.input = { left: false, right: false, jump: false };
    this._bindInput();
    this._bindNet();
  }

  get localRole()  { return this.net.isHost ? this.hostRole : OTHER[this.hostRole]; }
  get remoteRole() { return OTHER[this.localRole]; }

  // ------------------------------------------------------------- lifecycle

  loadLevel(id) {
    this.levelId = id;
    this.world = new World(LEVELS[id]);
    const sp = this.world.spawn;
    this.me    = new LocalPlayer(this.localRole,  sp[this.localRole].x,  sp[this.localRole].y);
    this.them  = new RemotePlayer(this.remoteRole, sp[this.remoteRole].x, sp[this.remoteRole].y);
    this.doorFlags = { fire: false, water: false };
    this.pressed.clear();
    this.seq = 0;
    if (!this.running) this._loop();
    this.running = true;
  }

  restart(reason) {
    if (this.levelId == null) return;
    this.ui.onStatus?.(reason || 'Level restarted');
    this.loadLevel(this.levelId);
  }

  stop() { this.running = false; }

  /** Host changed the role assignment. Mid-level, that forces a restart. */
  setRoles(hostRole, { restart = true } = {}) {
    if (hostRole === this.hostRole) return;
    this.hostRole = hostRole;
    if (this.net.isHost) this.net.sendReliable({ t: MSG.ROLE_ASSIGN, hostRole });
    if (restart && this.running) this.restart('Roles swapped — restarting');
  }

  // ------------------------------------------------------------- net wiring

  _bindNet() {
    const net = this.net;

    net.on(MSG.PLAYER_TRANSFORM, (m) => this.them?.applyTransform(m));

    net.on(MSG.ROLE_ASSIGN, (m) => {
      this.hostRole = m.hostRole;
      this.ui.onRoles?.(m.hostRole);
      if (this.running) this.restart('Roles swapped — restarting');
    });

    net.on(MSG.LEVEL_CHANGE, (m) => {
      if (m.levelId < 0) { this.running = false; return; }  // -1 = back to lobby
      this.ui.onLevelChange?.(m.levelId);
    });
    net.on(MSG.LEVEL_RESTART, (m) => this.restart(m.reason));
    net.on(MSG.LEVEL_COMPLETE, (m) => { this.running = false; this.ui.onComplete?.(m.levelId); });

    net.on(MSG.PLAYER_DIED, (m) => {
      if (this.them) this.them.dead = true;
      if (net.isHost) {
        net.sendReliable({ t: MSG.LEVEL_RESTART, reason: cause(m) });
        setTimeout(() => this.restart(cause(m)), 550);
      }
    });

    // --- host authority -----------------------------------------------
    net.on(MSG.REQUEST_INTERACTION, (m) => {
      if (!net.isHost || !this.world) return;
      if (m.action === 'press' || m.action === 'release') {
        this.world.setPressed(m.objectId, m.role, m.action === 'press');
      } else if (m.action === 'collect') {
        const g = this.world.gems.find((x) => x.id === m.objectId);
        if (g && !g.taken && g.role === m.role) {
          g.taken = true;
          net.sendReliable({ t: MSG.STATE_UPDATE, objectId: g.id, state: 'taken' });
        }
      }
    });

    net.on(MSG.REQUEST_DOOR, (m) => {
      if (!net.isHost) return;
      this.doorFlags[m.role] = m.inside;
      this._hostCheckWin();
    });

    // --- guest applying host truth --------------------------------------
    net.on(MSG.STATE_UPDATE, (m) => this.world?.applyObjectState(m.objectId, m.state));
    net.on(MSG.OBJECT_SYNC,  (m) => this.world?.applyObjectSync(m.o));
    net.on(MSG.DOOR_STATE,   (m) => { this.doorFlags = { fire: m.fire, water: m.water }; });
  }

  _hostCheckWin() {
    if (!this.net.isHost || !this.world || !this.running) return;
    this.net.sendReliable({ t: MSG.DOOR_STATE, ...this.doorFlags });
    if (this.doorFlags.fire && this.doorFlags.water && this.world.gemsRemaining() === 0) {
      this.running = false;
      this.net.sendReliable({ t: MSG.LEVEL_COMPLETE, levelId: this.levelId });
      this.ui.onComplete?.(this.levelId);
    }
  }

  // ------------------------------------------------------------------ loop

  _loop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (this.world) { this._update(dt); this._render(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  _update(dt) {
    const w = this.world;

    // 1. World objects: host simulates, guest interpolates between syncs.
    if (this.net.isHost) {
      for (const b of w.hostStep(dt)) {
        this.net.sendReliable({ t: MSG.STATE_UPDATE, objectId: b.id, state: b.state });
      }
    } else {
      w.stepElevators(dt, false);
    }

    if (!this.running) { this.them.update(dt); return; }

    // 2. Local character — full authority, zero input lag.
    this.me.update(dt, this.input, w);
    this.them.update(dt);

    // 3. Local death check (elemental collisions are evaluated locally).
    if (!this.me.dead) {
      const hz = w.hazardHitting(this.me.rect, this.me.role);
      if (hz) {
        this.me.dead = true;
        const msg = { t: MSG.PLAYER_DIED, role: this.me.role, cause: hz };
        this.net.sendReliable(msg);
        if (this.net.isHost) {
          this.net.sendReliable({ t: MSG.LEVEL_RESTART, reason: cause(msg) });
          setTimeout(() => this.restart(cause(msg)), 550);
        }
      }
    }

    // 4. Buttons under the local body -> interaction requests.
    const now = new Set(w.buttonsUnder(this.me.rect).map((b) => b.id));
    for (const id of now) if (!this.pressed.has(id)) this._interact(id, 'press');
    for (const id of this.pressed) if (!now.has(id)) this._interact(id, 'release');
    this.pressed = now;

    // 5. Gems.
    for (const g of w.gems) {
      if (!g.taken && g.role === this.me.role && overlap(this.me.rect, g)) {
        this._interact(g.id, 'collect');
      }
    }

    // 6. Door presence.
    const inside = w.atDoor(this.me.rect, this.me.role);
    if (inside !== this.doorFlags[this.me.role]) {
      this.doorFlags[this.me.role] = inside;
      if (this.net.isHost) this._hostCheckWin();
      else this.net.sendReliable({ t: MSG.REQUEST_DOOR, role: this.me.role, inside });
    }

    // 7. Outbound state at a fixed rate.
    this.sendAcc += dt;
    const period = 1 / SEND_HZ;
    while (this.sendAcc >= period) {
      this.sendAcc -= period;
      this.net.sendUnreliable({ t: MSG.PLAYER_TRANSFORM, ...this.me.packet(++this.seq) });
      if (this.net.isHost) {
        this.net.sendUnreliable({ t: MSG.OBJECT_SYNC, o: w.objectSyncPacket() });
      }
    }
  }

  /** Host mutates directly; guest asks the host to. */
  _interact(objectId, action) {
    const role = this.me.role;
    if (this.net.isHost) {
      if (action === 'collect') {
        const g = this.world.gems.find((x) => x.id === objectId);
        if (g && !g.taken) {
          g.taken = true;
          this.net.sendReliable({ t: MSG.STATE_UPDATE, objectId, state: 'taken' });
          this._hostCheckWin();
        }
      } else {
        this.world.setPressed(objectId, role, action === 'press');
      }
    } else {
      this.net.sendReliable({ t: MSG.REQUEST_INTERACTION, objectId, action, role });
    }
  }

  // --------------------------------------------------------------- drawing

  _render() {
    const { ctx, world: w } = this;
    const cw = this.canvas.width, ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#10131c'; ctx.fillRect(0, 0, cw, ch);

    // tiles
    for (let r = 0; r < w.rows.length; r++) {
      for (let c = 0; c < w.cols; c++) {
        if (w.rows[r][c] !== '#') continue;
        ctx.fillStyle = '#232838';
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        ctx.fillStyle = '#2e3550';
        ctx.fillRect(c * TILE, r * TILE, TILE, 4);
      }
    }

    // hazards
    for (const h of w.hazards) {
      ctx.fillStyle = h.kind === 'lava' ? PALETTE.lava : h.kind === 'water' ? PALETTE.water_ : PALETTE.goo;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.globalAlpha = 1;
    }

    // doors
    for (const role of ['fire', 'water']) {
      const d = w.doors[role];
      if (!d) continue;
      ctx.strokeStyle = PALETTE[role].body;
      ctx.lineWidth = 3;
      ctx.strokeRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4);
      ctx.fillStyle = this.doorFlags[role] ? PALETTE[role].glow : 'rgba(255,255,255,.05)';
      ctx.fillRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4);
    }

    // gems
    for (const g of w.gems) {
      if (g.taken) continue;
      ctx.fillStyle = PALETTE[g.role].body;
      ctx.beginPath();
      ctx.moveTo(g.x + g.w / 2, g.y);
      ctx.lineTo(g.x + g.w, g.y + g.h / 2);
      ctx.lineTo(g.x + g.w / 2, g.y + g.h);
      ctx.lineTo(g.x, g.y + g.h / 2);
      ctx.fill();
    }

    // buttons
    for (const b of w.buttons) {
      ctx.fillStyle = b.state === 'pressed' ? '#f5c542' : '#8a8f9e';
      const off = b.state === 'pressed' ? 4 : 0;
      ctx.fillRect(b.x, b.y + off, b.w, b.h - off);
    }

    // elevators
    for (const e of w.elevators) {
      ctx.fillStyle = '#f5c542';
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = 'rgba(245,197,66,.15)';
      ctx.fillRect(e.x + e.w / 2 - 1, e.yTop, 2, e.yBottom - e.yTop);
    }

    this._drawPlayer(this.them, 0.9);
    this._drawPlayer(this.me, 1);
  }

  _drawPlayer(p, alpha) {
    if (!p) return;
    const { ctx } = this;
    const col = PALETTE[p.role];
    ctx.globalAlpha = p.dead ? 0.25 : alpha;
    ctx.fillStyle = col.glow;
    ctx.fillRect(p.x - 4, p.y - 4, PW + 8, PH + 8);
    ctx.fillStyle = col.body;
    ctx.fillRect(p.x, p.y, PW, PH);
    ctx.fillStyle = '#0d0f16';
    const eye = p.facing >= 0 ? PW - 9 : 4;
    ctx.fillRect(p.x + eye, p.y + 7, 5, 5);
    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------------- input

  _bindInput() {
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
                  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
    addEventListener('keydown', (e) => {
      const k = map[e.code]; if (!k) return;
      e.preventDefault(); this.input[k] = true;
    });
    addEventListener('keyup', (e) => {
      const k = map[e.code]; if (!k) return;
      e.preventDefault(); this.input[k] = false;
    });
    addEventListener('blur', () => { this.input.left = this.input.right = this.input.jump = false; });
  }
}

function cause(m) {
  const who = m.role === 'fire' ? 'Fireboy' : 'Watergirl';
  const what = m.cause === 'goo' ? 'the green goo' : m.cause === 'lava' ? 'the lava' : 'the water';
  return `${who} fell in ${what}`;
}
