// src/game/Game.js
//
// Ядро гри. Як і раніше, нічого не знає про WebRTC — але тепер модель
// не хост-авторитарна, а гібридна (ТЗ):
//   - СВОГО персонажа кожна сторона рахує сама і повністю;
//   - ЧУЖОГО лише згладжує до отриманих трансформів;
//   - інтерактивний світ (кнопки/важелі/ліфти/самоцвіти) належить хосту.
//
// Про мережу дбає шар sync/ через ці колбеки:
//   onDeath(role, cause) · onInteract(objectId, action, role)
//   onDoorChange(role, inside) · onWin(levelIndex) · onObjectsChanged(list)

import { createPlayer, respawnPlayer, makeTransform, applyTransform,
         OTHER_ROLE, ROLES } from './Player.js';
import { updatePlayer, lerpRemote } from './physics.js';
import { applyZones, checkLethalZones, overlapsRect, touching } from './zones.js';
import { LEVELS } from './levels/index.js';
import { drawFrame } from './render.js';
import * as OBJ from './objects.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.isHost = false;
    this.hostRole = 'fire';       // яким персонажем грає хост
    this.levelIndex = 0;
    this.running = false;
    this.seq = 0;

    this.players = { fire: createPlayer('fire'), water: createPlayer('water') };
    this.objects = null;
    this.doorFlags = { fire: false, water: false };
    this._pressed = new Set();    // кнопки під ЛОКАЛЬНИМ гравцем
    this._leverTouch = new Set(); // важелі, яких локальний гравець уже торкається

    this.onDeath = null;
    this.onInteract = null;
    this.onDoorChange = null;
    this.onWin = null;
    this.onObjectsChanged = null;

    this.loadLevel(0);
  }

  get level() { return LEVELS[this.levelIndex]; }
  get localRole() { return this.isHost ? this.hostRole : OTHER_ROLE[this.hostRole]; }
  get remoteRole() { return OTHER_ROLE[this.localRole]; }
  get me() { return this.players[this.localRole]; }
  get them() { return this.players[this.remoteRole]; }

  setSides(isHost, hostRole) {
    this.isHost = isHost;
    if (hostRole) this.hostRole = hostRole;
  }

  loadLevel(index) {
    this.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    const lvl = this.level;
    for (const role of ROLES) {
      this.players[role].worldWidth = this.canvas.width;
      respawnPlayer(this.players[role], lvl.spawn[role]);
    }
    this.objects = OBJ.createObjects(lvl);
    this.doorFlags = { fire: false, water: false };
    this._pressed.clear();
    this._leverTouch.clear();
    this.seq = 0;
    this.running = true;
  }

  /** Зміна ролей посеред рівня — миттєвий рестарт (вимога ТЗ). */
  setHostRole(hostRole) {
    if (hostRole === this.hostRole) return false;
    this.hostRole = hostRole;
    if (this.running) this.loadLevel(this.levelIndex);
    return true;
  }

  // ------------------------------------------------------------ симуляція

  update(dt) {
    const lvl = this.level;
    const platforms = [...lvl.platforms, ...OBJ.elevatorPlatforms(this.objects)];

    // Світ: хост вирішує, клієнт лише догортає між пакетами.
    if (this.isHost) {
      const changed = OBJ.hostStepObjects(this.objects, dt);
      if (changed.length) this.onObjectsChanged?.(changed);
    } else {
      OBJ.stepElevators(this.objects, dt, false);
    }

    lerpRemote(this.them, dt);
    if (!this.running || this.me.dead) return;

    // Свій персонаж — повна авторитетність, нуль затримки.
    updatePlayer(this.me, platforms, dt);
    applyZones(this.me, lvl.zones, dt);

    // Смерть від чужої стихії судить лише власник персонажа.
    const cause = checkLethalZones(this.me, lvl.zones);
    if (cause || this.me.hp <= 0) {
      this.me.dead = true;
      this.onDeath?.(this.me.role, cause || 'damage');
      return;
    }

    this._syncButtons();
    this._syncLevers();
    this._syncGems();
    this._syncDoor();
  }

  _syncButtons() {
    const now = new Set(touching(this.me, this.objects.buttons).map((b) => b.id));
    for (const id of now) if (!this._pressed.has(id)) this._request(id, 'press');
    for (const id of this._pressed) if (!now.has(id)) this._request(id, 'release');
    this._pressed = now;
  }

  _syncLevers() {
    const now = new Set(touching(this.me, this.objects.levers).map((l) => l.id));
    // Важіль перемикається на ВХОДІ в зону, а не щокадру, поки стоїш поруч.
    for (const id of now) if (!this._leverTouch.has(id)) this._request(id, 'toggle');
    this._leverTouch = now;
  }

  _syncGems() {
    for (const g of this.objects.gems) {
      if (!g.taken && g.role === this.me.role && overlapsRect(this.me, g)) {
        this._request(g.id, 'collect');
      }
    }
  }

  _syncDoor() {
    const inside = overlapsRect(this.me, this.level.doors[this.me.role]);
    if (inside === this.me.atDoor) return;
    this.me.atDoor = inside;
    this.doorFlags[this.me.role] = inside;
    this.onDoorChange?.(this.me.role, inside);
    if (this.isHost) this.checkWin();
  }

  /** Хост міняє світ напряму, клієнт лише просить про це хоста. */
  _request(objectId, action) {
    const role = this.me.role;
    if (!this.isHost) {
      this.onInteract?.(objectId, action, role);
      return;
    }
    this.applyRequest(objectId, action, role);
  }

  /** Виконати запит на інтеракцію (лише хост). */
  applyRequest(objectId, action, role) {
    if (!this.isHost) return;
    let change = null;
    if (action === 'press' || action === 'release') {
      OBJ.setPressed(this.objects, objectId, role, action === 'press');
    } else if (action === 'toggle') {
      change = OBJ.toggleLever(this.objects, objectId);
    } else if (action === 'collect') {
      change = OBJ.takeGem(this.objects, objectId, role);
      if (change) this.checkWin();
    }
    if (change) this.onObjectsChanged?.([change]);
  }

  /** Умова перемоги: обидві двері зайняті і всі самоцвіти зібрані. */
  checkWin() {
    if (!this.isHost || !this.running) return;
    if (!this.doorFlags.fire || !this.doorFlags.water) return;
    if (OBJ.gemsRemaining(this.objects) > 0) return;
    this.running = false;
    this.onWin?.(this.levelIndex);
  }

  setDoorFlag(role, inside) {
    this.doorFlags[role] = inside;
    this.players[role].atDoor = inside;
    if (this.isHost) this.checkWin();
  }

  // -------------------------------------------------------------- мережа

  transform() { return makeTransform(this.me, ++this.seq); }
  applyRemoteTransform(pkt) { applyTransform(this.them, pkt); }
  applyObjectState(id, state) { OBJ.applyObjectState(this.objects, id, state); }
  objectsSnapshot() { return OBJ.objectsSnapshot(this.objects); }
  applyObjectsSnapshot(s) { OBJ.applyObjectsSnapshot(this.objects, s); }
  markRemoteDead() { this.them.dead = true; }

  setInput(code, isPressed) { this.me.keys[code] = isPressed; }

  render() {
    drawFrame(this.ctx, this.canvas, this.level, this.players, this.objects, this.localRole);
  }
}
