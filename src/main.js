// src/main.js
//
// Точка входу: "проводка" між шарами (network / sync / game) плюс UI —
// вибір рівня, розподіл ролей і модалка завершення.

import { P2PConnection } from './network/network.js';
import { Sync } from './sync/sync.js';
import { Game } from './game/Game.js';
import { LEVELS } from './game/levels/index.js';
import { OTHER_ROLE, ROLE_LABEL } from './game/Player.js';

const $ = (id) => document.getElementById(id);

const canvas = $('gameCanvas');
const statusDiv = $('status');
const panel = $('network-panel');
const actionBtn = $('action-btn');
const lobby = $('lobby');
const gameWrap = $('game-wrap');
const modal = $('modal');

const ALLOWED_KEYS = ['KeyA', 'KeyD', 'KeyW', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp'];

const roomId =
  new URLSearchParams(window.location.search).get('room') ||
  Math.random().toString(36).substring(2, 7);

if (!window.location.search.includes('room')) {
  window.history.pushState({}, '', `?room=${roomId}`);
}

let connection = null;
let game = null;
let sync = null;
let reconnectTimer = null;
let loopStarted = false;

function showScreen(name) {
  panel.hidden = name !== 'connect';
  panel.style.display = name === 'connect' ? 'block' : 'none';
  lobby.hidden = name !== 'lobby';
  gameWrap.hidden = name !== 'game';
}

function statusText(status) {
  switch (status) {
    case 'hosting':
      return `Ви створили гру. Надішліть посилання другу:\n${window.location.href}`;
    case 'waiting-for-offer':
      return 'Кімната вже існує. Очікуємо, поки хост опублікує гру...';
    case 'connecting':
      return 'Встановлення P2P-тунелю...';
    case 'connected':
      return "З'єднано!";
    default:
      return status;
  }
}

// ------------------------------------------------------------ підключення

async function setupConnection() {
  clearTimeout(reconnectTimer);
  showScreen('connect');

  connection = new P2PConnection(roomId);
  connection.onStatus = (s) => { statusDiv.innerText = statusText(s); };

  connection.onOpen = () => {
    if (!game) game = new Game(canvas);
    sync = new Sync(game, connection);
    wireSyncUI();
    renderRoles();
    showScreen('lobby');
    if (!loopStarted) {
      loopStarted = true;
      window.addEventListener('keydown', (e) => handleKey(e, true));
      window.addEventListener('keyup', (e) => handleKey(e, false));
      requestAnimationFrame(loop);
    }
  };

  connection.onDisconnected = () => {
    statusDiv.innerText = "З'єднання перервано. Повторне підключення...";
    showScreen('connect');
    reconnectTimer = setTimeout(setupConnection, 1000);
  };

  statusDiv.innerText = 'Перевірка кімнати...';
  const result = await connection.connect();

  if (result.role === 'client') {
    statusDiv.innerText = 'Кімнату знайдено! Натисніть кнопку, щоб приєднатись.';
    actionBtn.style.display = 'inline-block';
    actionBtn.onclick = async () => {
      actionBtn.style.display = 'none';
      statusDiv.innerText = "З'єднання...";
      await connection.acceptAsClient(result.offer);
    };
  }
}

function wireSyncUI() {
  sync.onRoleAssign = () => { renderRoles(); toast('Ролі оновлено'); };
  sync.onRestart = (reason) => toast(reason || 'Рівень перезапущено');
  sync.onLevelComplete = (levelIndex) => openModal(levelIndex);
  sync.onLevelChange = (levelIndex) => {
    if (levelIndex < 0) { closeModal(); showScreen('lobby'); }
    else enterLevel(levelIndex);
  };
}

// ------------------------------------------------------------------ UI

LEVELS.forEach((lv, i) => {
  const b = document.createElement('button');
  b.className = 'level-card';
  b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span>
                 <span class="name">${lv.name}</span>`;
  b.onclick = () => {
    if (!connection?.isHost) return;
    sync.changeLevel(i);
    enterLevel(i);
  };
  $('level-grid').appendChild(b);
});

function renderRoles() {
  if (!game || !connection) return;
  const isHost = connection.isHost;
  const mine = isHost ? game.hostRole : OTHER_ROLE[game.hostRole];
  const theirs = OTHER_ROLE[mine];

  $('role-mine').textContent = ROLE_LABEL[mine];
  $('role-mine').className = `chip ${mine}`;
  $('role-theirs').textContent = ROLE_LABEL[theirs];
  $('role-theirs').className = `chip ${theirs}`;

  for (const el of document.querySelectorAll('.host-only')) el.hidden = !isHost;
  $('level-grid').classList.toggle('locked', !isHost);
  $('lobby-hint').textContent = isHost
    ? 'Оберіть рівень. Персонажів можна міняти будь-коли — навіть посеред рівня.'
    : 'Рівень і розподіл персонажів обирає хост.';
  $('modal-wait').hidden = isHost;
}

for (const btn of document.querySelectorAll('[data-action="swap"]')) {
  btn.onclick = () => {
    if (!connection?.isHost) return;
    // Свап посеред рівня рестартує його — це вимога ТЗ, і Game робить це сам.
    const changed = sync.assignRoles(OTHER_ROLE[game.hostRole]);
    renderRoles();
    toast(changed && game.running ? 'Ролі змінено — рівень перезапущено' : 'Ролі змінено');
  };
}

function enterLevel(index) {
  closeModal();
  game.loadLevel(index);
  $('hud-level').textContent = LEVELS[index].name;
  showScreen('game');
}

$('to-lobby').onclick = () => {
  if (!connection?.isHost) return;
  sync.changeLevel(-1);
  closeModal();
  showScreen('lobby');
};

function openModal(levelIndex) {
  const hasNext = levelIndex + 1 < LEVELS.length;
  $('modal-title').textContent = `${LEVELS[levelIndex].name} — пройдено`;
  $('btn-next').hidden = !hasNext;
  $('btn-next').onclick = () => {
    sync.changeLevel(levelIndex + 1);
    enterLevel(levelIndex + 1);
  };
  $('btn-select').onclick = () => {
    sync.changeLevel(-1);
    closeModal();
    showScreen('lobby');
  };
  modal.hidden = false;
}

function closeModal() { modal.hidden = true; }

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ------------------------------------------------------------ ігровий цикл

function handleKey(e, isPressed) {
  if (!ALLOWED_KEYS.includes(e.code)) return;
  e.preventDefault();
  // Ввід іде НАПРЯМУ у власного персонажа — жодного мережевого кола.
  game?.setInput(e.code, isPressed);
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (game) {
    game.update(dt);
    sync?.tick(now);
    game.render();
  }

  requestAnimationFrame(loop);
}

$('reset-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  P2PConnection.forgetRole(roomId);
  window.location.href = window.location.pathname;
});

setupConnection();
