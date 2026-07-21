import { NetCore } from './net/NetCore.js';
import { MSG } from './net/Protocol.js';
import { Game } from './game/Game.js';
import { LEVELS } from './game/Levels.js';

const $ = (s) => document.querySelector(s);
const screens = {
  connect: $('#screen-connect'),
  lobby:   $('#screen-lobby'),
  game:    $('#screen-game'),
};
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
}

const net = new NetCore();
const game = new Game(net, $('#stage'), {
  onComplete: (levelId) => openComplete(levelId),
  onStatus:   (text) => toast(text),
  onRoles:    (hostRole) => renderRoles(hostRole),
  onLevelChange: (levelId) => startLevel(levelId, false),
});

// ---------------------------------------------------------------- connect

const hashRoom = location.hash.startsWith('#room-') ? location.hash.slice(6) : null;

if (hashRoom) {
  $('#connect-title').textContent = 'Joining room';
  $('#connect-note').textContent = 'Handshaking with the host over WebRTC…';
  net.join(hashRoom);
} else {
  net.host();
}

net.on('room-open', ({ roomId }) => {
  const url = `${location.origin}${location.pathname}#room-${roomId.slice(4)}`;
  $('#connect-title').textContent = 'Room ready';
  $('#connect-note').textContent = 'Send this link to your partner. The game starts when they arrive.';
  $('#share-link').value = url;
  $('#share-row').hidden = false;
});

net.on('ready', () => {
  toast('Peer connected');
  if (net.isHost) net.sendReliable({ t: MSG.ROLE_ASSIGN, hostRole: game.hostRole });
  renderRoles(game.hostRole);
  show('lobby');
});

net.on('peer-lost', () => { toast('Partner disconnected'); show('connect');
  $('#connect-title').textContent = 'Connection lost';
  $('#connect-note').textContent = 'Reload the page to start a new room.'; });

net.on('error', (e) => toast('Network error: ' + (e?.type || e?.message || e)));

$('#copy-link').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#share-link').value);
  toast('Link copied');
});

// ------------------------------------------------------------------ lobby

const levelGrid = $('#level-grid');
LEVELS.forEach((lv) => {
  const b = document.createElement('button');
  b.className = 'level-card';
  b.innerHTML = `<span class="num">${String(lv.id + 1).padStart(2, '0')}</span>
                 <span class="name">${lv.name}</span>`;
  b.addEventListener('click', () => {
    if (!net.isHost) return;
    startLevel(lv.id, true);
  });
  levelGrid.appendChild(b);
});

function renderRoles(hostRole) {
  const mine = net.isHost ? hostRole : (hostRole === 'fire' ? 'water' : 'fire');
  $('#role-mine').textContent = mine === 'fire' ? 'Fireboy' : 'Watergirl';
  $('#role-mine').className = 'role-chip ' + mine;
  $('#role-theirs').textContent = mine === 'fire' ? 'Watergirl' : 'Fireboy';
  $('#role-theirs').className = 'role-chip ' + (mine === 'fire' ? 'water' : 'fire');
  for (const el of document.querySelectorAll('.host-only')) el.hidden = !net.isHost;
  levelGrid.classList.toggle('locked', !net.isHost);
  $('#lobby-hint').textContent = net.isHost
    ? 'Pick a level to start. You can swap characters at any time.'
    : 'The host picks the level and assigns characters.';
}

for (const btn of document.querySelectorAll('[data-action="swap"]')) {
  btn.addEventListener('click', () => {
    if (!net.isHost) return;
    game.setRoles(game.hostRole === 'fire' ? 'water' : 'fire');
    renderRoles(game.hostRole);
  });
}

// ------------------------------------------------------------------- game

function startLevel(levelId, broadcast) {
  if (broadcast && net.isHost) net.sendReliable({ t: MSG.LEVEL_CHANGE, levelId });
  closeComplete();
  show('game');
  $('#hud-level').textContent = LEVELS[levelId].name;
  game.loadLevel(levelId);
}

$('#btn-to-lobby').addEventListener('click', () => { closeComplete(); show('lobby'); });

// -------------------------------------------------------- completion modal

function openComplete(levelId) {
  const hasNext = levelId + 1 < LEVELS.length;
  $('#complete-title').textContent = `${LEVELS[levelId].name} cleared`;
  $('#btn-next').hidden = !(net.isHost && hasNext);
  $('#btn-select').hidden = !net.isHost;
  $('#complete-wait').hidden = net.isHost;
  $('#btn-next').onclick = () => startLevel(levelId + 1, true);
  $('#btn-select').onclick = () => {
    net.sendReliable({ t: MSG.LEVEL_CHANGE, levelId: -1 });
    show('lobby'); closeComplete();
  };
  $('#modal-complete').hidden = false;
}
function closeComplete() { $('#modal-complete').hidden = true; }

net.on(MSG.LEVEL_CHANGE, (m) => {
  if (m.levelId === -1) { closeComplete(); show('lobby'); }
});

// ------------------------------------------------------------------ toast

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
