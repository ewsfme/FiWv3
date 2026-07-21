// src/network/network.js
//
// Шар "мережа": відповідає лише за встановлення P2P DataChannel через
// RTCPeerConnection (STUN + TURN metered.ca) і сигналінг на Vercel.
// Не знає нічого про формат ігрових повідомлень — приймає/віддає сирий
// JSON-об'єкт. Про сумісність повідомлень дбає шар sync/.

// !!! Замініть username/credential на свої дані з https://www.metered.ca
// (Dashboard -> TURN Server -> ваш API key дає можливість згенерувати
// тимчасові облікові дані через REST API, або можна використати статичні,
// як тут).
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: '69f9b59922f69b901485030f',
    credential: 'GaGpQbomFl5tvN4e',
  },
  {
    urls: 'turn:global.relay.metered.ca:443?transport=tcp',
    username: '69f9b59922f69b901485030f',
    credential: 'GaGpQbomFl5tvN4e',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: '69f9b59922f69b901485030f',
    credential: 'GaGpQbomFl5tvN4e',
  },
];

import { sendSignal, getSignal } from './signaling.js';

const ANSWER_POLL_MS = 1500;
const OFFER_WAIT_POLL_MS = 1000;

// Роль ("host"/"client") пам'ятається в sessionStorage — саме на вкладку,
// тому й переживає F5, але не плутається між різними вкладками/кімнатами.
const roleKey = (roomId) => `p2p:role:${roomId}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class P2PConnection {
  constructor(roomId) {
    this.roomId = roomId;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    // Два канали: ігрова логіка не переживе втрати пакета, а позиції —
    // переживуть, і краще хай губляться, ніж чекають на ретрансміт.
    this.reliable = null;   // { ordered: true }
    this.unreliable = null; // { ordered: false, maxRetransmits: 0 }
    this._openCount = 0;
    this.isHost = false;
    this.epoch = null; // унікальна мітка поточної спроби з'єднання (Date.now())
    this._stopped = false;
    this._disconnectFired = false;

    // Колбеки, які виставляє той, хто створює з'єднання (main.js / sync.js)
    this.onOpen = null;         // () => void — DataChannel відкрито
    this.onDisconnected = null; // () => void — з'єднання розірвано (треба перепідключатись)
    this.onMessage = null;      // (obj) => void
    this.onStatus = null;       // (status) => void, статуси описані в main.js

    this._pollTimer = null;

    this.pc.onicecandidate = (event) => {
      // Чекаємо, поки зберуться всі ICE-кандидати (важливо для TURN-релею),
      // і лише тоді публікуємо повний SDP на сигнальний сервер.
      if (event.candidate === null && this.epoch !== null) {
        sendSignal(this.roomId, {
          [this.isHost ? 'offer' : 'answer']: { sdp: this.pc.localDescription, epoch: this.epoch },
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'connected') this.onStatus?.('connected');
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this._fireDisconnected();
      }
    };
  }

  _fireDisconnected() {
    if (this._disconnectFired) return;
    this._disconnectFired = true;
    this._stopped = true;
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.onDisconnected?.();
  }

  /** Надіслати JSON гарантовано і по порядку (ігрова логіка). */
  sendReliable(obj) {
    if (this.reliable?.readyState === 'open') this.reliable.send(JSON.stringify(obj));
  }

  /** Надіслати JSON без гарантій (позиції, які застаріють за кадр). */
  sendUnreliable(obj) {
    if (this.unreliable?.readyState === 'open') this.unreliable.send(JSON.stringify(obj));
  }

  /** Сумісність зі старим кодом — типово надійний канал. */
  send(obj) {
    this.sendReliable(obj);
  }

  _setupChannel(channel) {
    if (channel.label === 'fast') this.unreliable = channel;
    else this.reliable = channel;

    channel.onopen = () => {
      this._openCount++;
      // Гру запускаємо лише коли ОБИДВА канали відкриті, інакше перші
      // interaction-події полетять у ще неіснуючий канал.
      if (this._openCount >= 2) this.onOpen?.();
    };
    channel.onclose = () => this._fireDisconnected();
    channel.onmessage = (e) => this.onMessage?.(JSON.parse(e.data));
  }

  /**
   * Визначає роль для цієї спроби з'єднання:
   *  - якщо в sessionStorage вже записано роль для цієї кімнати (ми вже
   *    були тут до refresh) — повертаємось до тієї самої ролі;
   *  - інакше дивимось у сигнальну кімнату на сервері: якщо там вже offer
   *    або хтось щойно "заявив" (claim) хостинг — ми клієнт і чекаємо;
   *    якщо кімната порожня — стаємо хостом.
   */
  async connect() {
    const storedRole = sessionStorage.getItem(roleKey(this.roomId));

    if (storedRole === 'host') return this._becomeHost();
    if (storedRole === 'client') return this._becomeClient();

    const data = await getSignal(this.roomId);
    if (data.offer?.sdp) return this._becomeClient(data);
    if (data.hosting) return this._becomeClient(); // хтось саме зараз генерує offer — чекаємо
    return this._becomeHost();
  }

  async _becomeHost() {
    this.isHost = true;
    this._openCount = 0;
    this._stopped = false;
    this._disconnectFired = false;
    sessionStorage.setItem(roleKey(this.roomId), 'host');
    this.epoch = Date.now();
    this.onStatus?.('hosting');

    // КЛЮЧОВИЙ ФІКС гонки: заявляємо про хостинг ОДРАЗУ, ще до того, як
    // почнеться (повільний, особливо через TURN) збір ICE-кандидатів.
    // Друг, що відкриє посилання за мілісекунди, побачить цей claim і
    // коректно стане клієнтом замість того, щоб теж спробувати хостити.
    await sendSignal(this.roomId, { hosting: this.epoch });

    this._setupChannel(this.pc.createDataChannel('game', { ordered: true }));
    this._setupChannel(this.pc.createDataChannel('fast', {
      ordered: false,
      maxRetransmits: 0,
    }));

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this._pollForAnswer();
    return { role: 'host' };
  }

  async _becomeClient(preloadedData) {
    this.isHost = false;
    this._openCount = 0;
    this._stopped = false;
    this._disconnectFired = false;
    sessionStorage.setItem(roleKey(this.roomId), 'client');
    this.onStatus?.('waiting-for-offer');

    const data = preloadedData?.offer?.sdp ? preloadedData : await this._waitForOffer();
    this.epoch = data.offer.epoch;
    return { role: 'client', offer: data.offer.sdp };
  }

  /**
   * Полінгуємо кімнату, поки хост не опублікує повний offer.
   * Це ж рятує при refresh хоста: після перезавантаження він публікує
   * НОВИЙ offer з новим epoch, і клієнт (якщо теж ще на сторінці) підхопить
   * саме його, замість того щоб намертво чекати на давно застарілий.
   */
  async _waitForOffer() {
    while (!this._stopped) {
      const data = await getSignal(this.roomId);
      if (data.offer?.sdp) return data;
      await sleep(OFFER_WAIT_POLL_MS);
    }
    return { offer: null };
  }

  /** Клієнт викликає це після підтвердження користувачем. */
  async acceptAsClient(offerSdp) {
    this.pc.ondatachannel = (e) => this._setupChannel(e.channel);
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.onStatus?.('connecting');
  }

  _pollForAnswer() {
    this._pollTimer = setInterval(async () => {
      if (this._stopped) {
        clearInterval(this._pollTimer);
        return;
      }
      const signal = await getSignal(this.roomId);
      // Звіряємо epoch, щоб не підхопити застарілу відповідь від
      // попередньої (до refresh) спроби підключення.
      if (signal.answer?.epoch === this.epoch && this.pc.signalingState !== 'stable') {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal.answer.sdp));
        this.onStatus?.('connecting');
      }
    }, ANSWER_POLL_MS);
  }

  close() {
    this._stopped = true;
    if (this._pollTimer) clearInterval(this._pollTimer);
    this.reliable?.close();
    this.unreliable?.close();
    this.pc.close();
  }

  /** Забути збережену роль — наступний connect() почне кімнату "з нуля". */
  static forgetRole(roomId) {
    sessionStorage.removeItem(roleKey(roomId));
  }
}
