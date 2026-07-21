// src/sync/protocol.js
//
// Єдиний контракт мережевих повідомлень. Розділений за каналами:
// ненадійний канал везе те, що застаріває за кадр (позиції), надійний —
// те, втрата чого розсинхронізує світ (натиснуті кнопки, зміна рівня).

export const MSG = {
  // --- ненадійний канал: { ordered: false, maxRetransmits: 0 } ---
  PLAYER_TRANSFORM: 'PLAYER_TRANSFORM', // { s, x, y, vx, vy, anim, face }
  OBJECT_SYNC:      'OBJECT_SYNC',      // хост -> клієнт: позиції ліфтів

  // --- надійний канал: { ordered: true } ---
  HELLO:            'HELLO',
  ROLE_ASSIGN:      'ROLE_ASSIGN',      // хост -> клієнт { hostRole }
  LEVEL_CHANGE:     'LEVEL_CHANGE',     // хост -> клієнт { levelIndex } (-1 = лоббі)
  LEVEL_COMPLETE:   'LEVEL_COMPLETE',   // хост -> клієнт { levelIndex }
  LEVEL_RESTART:    'LEVEL_RESTART',    // хост -> клієнт { reason }
  PLAYER_DIED:      'PLAYER_DIED',      // будь-хто { role, cause }

  REQUEST_INTERACTION: 'REQUEST_INTERACTION', // клієнт -> хост { objectId, action, role }
  STATE_UPDATE:        'STATE_UPDATE',        // хост -> клієнт { objectId, state }
  REQUEST_DOOR:        'REQUEST_DOOR',        // клієнт -> хост { role, inside }
  DOOR_STATE:          'DOOR_STATE',          // хост -> клієнт { fire, water }
};

export const PROTOCOL_VERSION = 2;
