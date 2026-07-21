// Wire protocol. Every message is { t: <type>, ...payload }.
// Keep keys short: this goes out 30x/second.

export const MSG = {
  // --- unreliable lane (ordered:false, maxRetransmits:0) ---
  PLAYER_TRANSFORM: 'pt',   // { s:seq, x, y, vx, vy, a:animState, f:facing }
  OBJECT_SYNC:      'os',   // host -> peer, continuous object positions (elevators)

  // --- reliable lane (ordered:true) ---
  HELLO:            'hi',   // handshake / version check
  ROLE_ASSIGN:      'ra',   // host -> peer  { hostRole: 'fire'|'water' }
  LEVEL_CHANGE:     'lc',   // host -> peer  { levelId, seed }
  LEVEL_COMPLETE:   'lx',   // host -> peer  { levelId }
  PLAYER_DIED:      'pd',   // either -> either { role, cause }
  LEVEL_RESTART:    'lr',   // host -> peer  { reason }

  REQUEST_INTERACTION: 'ri', // peer -> host { objectId, action }
  STATE_UPDATE:        'su', // host -> peer { objectId, state }

  REQUEST_DOOR:     'rd',   // peer -> host { role, inside:bool }
  DOOR_STATE:       'ds',   // host -> peer { fire:bool, water:bool }
};

export const PROTOCOL_VERSION = 1;
