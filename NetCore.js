import { MSG, PROTOCOL_VERSION } from './Protocol.js';

/**
 * NetCore — two RTCDataChannels over one PeerJS peer connection.
 *
 *   reliable   : { ordered: true }                        -> game logic, world state
 *   unreliable : { ordered: false, maxRetransmits: 0 }    -> player transforms
 *
 * PeerJS opens one DataChannel per DataConnection, so we open two connections
 * and tag them via connection metadata.
 */
export class NetCore {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.roomId = null;
    this.reliable = null;
    this.unreliable = null;
    this._handlers = new Map();
    this._ready = false;
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(fn);
    return this;
  }

  _dispatch(type, msg) {
    const list = this._handlers.get(type);
    if (list) for (const fn of list) fn(msg);
  }

  // ---------------------------------------------------------------- hosting

  host() {
    this.isHost = true;
    this.roomId = 'fwg-' + Math.random().toString(36).slice(2, 8);
    this.peer = new Peer(this.roomId, { debug: 1 });

    this.peer.on('open', () => this._dispatch('room-open', { roomId: this.roomId }));
    this.peer.on('error', (e) => this._dispatch('error', e));

    this.peer.on('connection', (conn) => {
      const lane = conn.metadata?.lane;
      if (lane === 'unreliable') this._bindUnreliable(conn);
      else this._bindReliable(conn);
    });
  }

  // ---------------------------------------------------------------- joining

  join(roomId) {
    this.isHost = false;
    this.roomId = roomId;
    this.peer = new Peer({ debug: 1 });

    this.peer.on('error', (e) => this._dispatch('error', e));
    this.peer.on('open', () => {
      this._bindReliable(this.peer.connect(roomId, {
        reliable: true,
        serialization: 'json',
        metadata: { lane: 'reliable' },
      }));
      // reliable:false in PeerJS maps to { ordered:false, maxRetransmits:0 }
      this._bindUnreliable(this.peer.connect(roomId, {
        reliable: false,
        serialization: 'json',
        metadata: { lane: 'unreliable' },
      }));
    });
  }

  // ------------------------------------------------------------ lane wiring

  _bindReliable(conn) {
    this.reliable = conn;
    conn.on('open', () => {
      this.sendReliable({ t: MSG.HELLO, v: PROTOCOL_VERSION });
      this._checkReady();
    });
    conn.on('data', (m) => this._dispatch(m.t, m));
    conn.on('close', () => this._dispatch('peer-lost', {}));
    conn.on('error', (e) => this._dispatch('error', e));
  }

  _bindUnreliable(conn) {
    this.unreliable = conn;
    conn.on('open', () => this._checkReady());
    conn.on('data', (m) => this._dispatch(m.t, m));
  }

  _checkReady() {
    if (this._ready) return;
    if (this.reliable?.open && this.unreliable?.open) {
      this._ready = true;
      this._dispatch('ready', { isHost: this.isHost });
    }
  }

  get connected() { return this._ready; }

  sendReliable(msg)   { if (this.reliable?.open)   this.reliable.send(msg); }
  sendUnreliable(msg) { if (this.unreliable?.open) this.unreliable.send(msg); }
}
