// src/sync/sync.js
//
// Єдине місце, де зустрічаються game/ і network/. Модель — гібридна (ТЗ):
//   - PLAYER_TRANSFORM летить ненадійним каналом 33 рази/сек;
//   - усе, що змінює світ, — надійним, і проходить через хоста.

import { MSG, PROTOCOL_VERSION } from './protocol.js';

const TRANSFORM_HZ = 33;

export class Sync {
  constructor(game, connection) {
    this.game = game;
    this.connection = connection;
    this._lastSend = 0;

    game.setSides(connection.isHost, game.hostRole);

    connection.onMessage = (msg) => this._handle(msg);
    this._wireGame();

    if (connection.isHost) {
      connection.sendReliable({ type: MSG.HELLO, v: PROTOCOL_VERSION });
      connection.sendReliable({ type: MSG.ROLE_ASSIGN, hostRole: game.hostRole });
    }

    // Колбеки UI — виставляє main.js
    this.onRoleAssign = null;
    this.onLevelChange = null;
    this.onLevelComplete = null;
    this.onRestart = null;
  }

  _wireGame() {
    const { game, connection } = this;

    game.onDeath = (role, cause) => {
      connection.sendReliable({ type: MSG.PLAYER_DIED, role, cause });
      if (connection.isHost) this._hostRestart(deathReason(role, cause));
    };

    game.onInteract = (objectId, action, role) => {
      connection.sendReliable({ type: MSG.REQUEST_INTERACTION, objectId, action, role });
    };

    game.onDoorChange = (role, inside) => {
      if (!connection.isHost) {
        connection.sendReliable({ type: MSG.REQUEST_DOOR, role, inside });
      } else {
        connection.sendReliable({ type: MSG.DOOR_STATE, ...game.doorFlags });
      }
    };

    game.onObjectsChanged = (list) => {
      if (!connection.isHost) return;
      for (const c of list) {
        connection.sendReliable({ type: MSG.STATE_UPDATE, ...c });
      }
    };

    game.onWin = (levelIndex) => {
      if (!connection.isHost) return;
      connection.sendReliable({ type: MSG.LEVEL_COMPLETE, levelIndex });
      this.onLevelComplete?.(levelIndex);
    };
  }

  _hostRestart(reason) {
    this.connection.sendReliable({ type: MSG.LEVEL_RESTART, reason });
    setTimeout(() => {
      this.game.loadLevel(this.game.levelIndex);
      this.onRestart?.(reason);
    }, 600);
  }

  // --------------------------------------------------------- вихідні дії

  /** Хост змінив розподіл ролей. */
  assignRoles(hostRole) {
    if (!this.connection.isHost) return;
    const changed = this.game.setHostRole(hostRole);
    this.connection.sendReliable({ type: MSG.ROLE_ASSIGN, hostRole });
    return changed;
  }

  /** Хост обрав рівень (-1 = повернутись у меню вибору). */
  changeLevel(levelIndex) {
    if (!this.connection.isHost) return;
    this.connection.sendReliable({ type: MSG.LEVEL_CHANGE, levelIndex });
    if (levelIndex >= 0) this.game.loadLevel(levelIndex);
  }

  /** Викликати щокадру: сам обмежує частоту. */
  tick(now) {
    const interval = 1000 / TRANSFORM_HZ;
    if (now - this._lastSend < interval) return;
    this._lastSend = now;

    this.connection.sendUnreliable({ type: MSG.PLAYER_TRANSFORM, ...this.game.transform() });

    if (this.connection.isHost) {
      this.connection.sendUnreliable({
        type: MSG.OBJECT_SYNC, objects: this.game.objectsSnapshot(),
      });
    }
  }

  // -------------------------------------------------------- вхідні дані

  _handle(msg) {
    const { game, connection } = this;

    switch (msg.type) {
      case MSG.PLAYER_TRANSFORM:
        game.applyRemoteTransform(msg);
        break;

      case MSG.OBJECT_SYNC:
        if (!connection.isHost) game.applyObjectsSnapshot(msg.objects);
        break;

      case MSG.ROLE_ASSIGN:
        if (!connection.isHost) {
          game.setHostRole(msg.hostRole);
          this.onRoleAssign?.(msg.hostRole);
        }
        break;

      case MSG.LEVEL_CHANGE:
        if (!connection.isHost) {
          if (msg.levelIndex >= 0) game.loadLevel(msg.levelIndex);
          this.onLevelChange?.(msg.levelIndex);
        }
        break;

      case MSG.LEVEL_COMPLETE:
        if (!connection.isHost) {
          game.running = false;
          this.onLevelComplete?.(msg.levelIndex);
        }
        break;

      case MSG.LEVEL_RESTART:
        if (!connection.isHost) {
          setTimeout(() => {
            game.loadLevel(game.levelIndex);
            this.onRestart?.(msg.reason);
          }, 600);
        }
        break;

      case MSG.PLAYER_DIED:
        game.markRemoteDead();
        if (connection.isHost) this._hostRestart(deathReason(msg.role, msg.cause));
        break;

      // --- хост як джерело правди для світу ---
      case MSG.REQUEST_INTERACTION:
        if (connection.isHost) game.applyRequest(msg.objectId, msg.action, msg.role);
        break;

      case MSG.REQUEST_DOOR:
        if (connection.isHost) {
          game.setDoorFlag(msg.role, msg.inside);
          connection.sendReliable({ type: MSG.DOOR_STATE, ...game.doorFlags });
        }
        break;

      case MSG.STATE_UPDATE:
        if (!connection.isHost) game.applyObjectState(msg.objectId, msg.state);
        break;

      case MSG.DOOR_STATE:
        if (!connection.isHost) {
          game.doorFlags = { fire: msg.fire, water: msg.water };
        }
        break;
    }
  }
}

function deathReason(role, cause) {
  const who = role === 'fire' ? 'Fireboy' : 'Watergirl';
  const what = cause === 'goo' ? 'у зелену слиз'
    : cause === 'lava' ? 'у лаву'
    : cause === 'water' ? 'у воду'
    : 'у пастку';
  return `${who} потрапив ${what}`;
}
