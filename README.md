# Ember & Tide — P2P co-op platformer

A two-player Fireboy-and-Watergirl-style platformer that runs entirely browser-to-browser.
No game server, no database, no build step. The only backend touched is the public PeerJS
signalling server, and only for the initial SDP/ICE handshake.

## Folder structure

```
fireboy-watergirl-p2p/
├── index.html            screens: connect → lobby → game, plus the clear modal
├── css/ui.css            all UI chrome (the canvas draws itself)
└── js/
    ├── main.js           app shell: room links, lobby, level select, modals
    ├── net/
    │   ├── Protocol.js   message type constants — the single wire contract
    │   └── NetCore.js    PeerJS, two data channels, event bus
    └── game/
        ├── Levels.js     tilemap level data
        ├── World.js      tilemap collision, hazards, host-owned objects
        ├── Player.js     LocalPlayer (authoritative) + RemotePlayer (LERP)
        └── Game.js       loop, sync policy, rendering, input
```

## Running it

It uses ES modules, so it needs to be served over http, not opened as a file.

```bash
cd fireboy-watergirl-p2p
python3 -m http.server 8080
```

Open `http://localhost:8080` — that tab becomes the host and shows a share link like
`http://localhost:8080/#room-a7f3k2`. Open that link in a second tab, window, or machine.
Once both data channels report open, both players land on the level tree.

Deploy by copying the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages).
WebRTC requires https in production, which those all provide.

## The two channels

PeerJS opens one `RTCDataChannel` per `DataConnection`, so `NetCore` opens two connections
to the same peer and tags them via connection metadata:

| Lane | PeerJS option | Underlying config | Carries |
|---|---|---|---|
| `unreliable` | `{ reliable: false }` | `ordered: false, maxRetransmits: 0` | `PLAYER_TRANSFORM`, `OBJECT_SYNC` |
| `reliable` | `{ reliable: true }` | `ordered: true` | everything else |

Transforms are stamped with a monotonic `seq`; `RemotePlayer.applyTransform` drops anything
that arrives out of order, which is the price of an unordered lane. Losing a transform packet
costs one frame of smoothing. Losing a lever press would desync the level, which is why every
piece of game logic rides the reliable lane.

## Message schema

```js
// unreliable
{ t:'pt', s:seq, x, y, vx, vy, a:animState, f:facing }    // PLAYER_TRANSFORM
{ t:'os', o:[{ id, y, a }] }                              // OBJECT_SYNC (host → guest)

// reliable
{ t:'ra', hostRole:'fire'|'water' }                       // ROLE_ASSIGN     host → guest
{ t:'lc', levelId }                                       // LEVEL_CHANGE    host → guest (-1 = lobby)
{ t:'lx', levelId }                                       // LEVEL_COMPLETE  host → guest
{ t:'lr', reason }                                        // LEVEL_RESTART   host → guest
{ t:'pd', role, cause }                                   // PLAYER_DIED     either direction
{ t:'ri', objectId, action:'press'|'release'|'collect', role }  // REQUEST_INTERACTION  guest → host
{ t:'su', objectId, state }                               // STATE_UPDATE    host → guest
{ t:'rd', role, inside }                                  // REQUEST_DOOR    guest → host
{ t:'ds', fire, water }                                   // DOOR_STATE      host → guest
```

## Ownership model

**Your body is yours.** `LocalPlayer.update()` reads local input and resolves collisions
against the tilemap immediately — there is no prediction layer because there is nothing to
predict against. Every 1/33s the result is serialised and pushed down the unreliable lane.

**Their body is a puppet.** `RemotePlayer` never simulates. It extrapolates one frame from the
last known velocity to hide latency, then LERPs toward that target with a frame-rate-independent
factor (`1 - 0.0015^dt`), and hard-snaps if the error exceeds four tiles — which happens after a
loss burst or a throttled background tab.

**Deaths are self-reported.** Only your client decides that you touched the wrong element, then
announces it. This is trust-based, which is correct for a co-op game with a friend and wrong for
anything competitive.

**The world belongs to the host.** Buttons, elevators, gems and the win condition are all
resolved on one machine. The guest never mutates world state; it sends `REQUEST_INTERACTION` and
waits for `STATE_UPDATE`. Elevator positions also stream over the unreliable lane at 33Hz so the
guest's platforms stay visually locked to the host's, while `stepElevators(dt, false)` fills the
gaps between packets so motion stays smooth if one drops.

This split means the guest sees roughly one RTT of lag on *world* reactions (step on a button,
the lift starts a moment later) but zero lag on their own movement — the tradeoff that matters,
since movement is what a platformer's feel lives or dies on.

## Role assignment and the mid-level swap

`hostRole` is the only stored value; the guest's role is derived as the complement. The host
broadcasts `ROLE_ASSIGN` on connect and on every swap. `Game.setRoles()` reloads the current
level whenever a swap lands while a stage is running, satisfying the instant-restart rule — both
clients reach the same conclusion independently from the same message, so no extra sync is needed.

## Where to take it next

- **Rollback for the remote body.** Give `RemotePlayer` the same physics step as `LocalPlayer`
  and run it forward from the last packet instead of extrapolating linearly. Remote players will
  stop briefly clipping into walls during loss spikes.
- **Host migration.** Right now, if the host drops the room is over. Re-electing the guest as
  host is mostly a matter of re-broadcasting `objectSyncPacket()` state to a new peer.
- **Swap in a real physics engine.** `World.solidsNear` / `LocalPlayer._moveAxis` are a
  deliberately small arcade AABB solver. If you want slopes, ropes or crates, replace those two
  with Matter.js and keep everything else — the sync layer only cares about `x, y, vx, vy`.
- **Own the signalling.** The public PeerJS broker is rate-limited and best treated as a
  prototype dependency; `peerjs-server` is a ~20-line self-host.
- **Level editor.** Levels are plain character grids, so a grid editor that exports the same
  array is a short afternoon and beats hand-editing strings.

## Level authoring

Each level is an array of equal-length strings.

```
#  solid     .  empty      L  lava (kills Watergirl)    A  water (kills Fireboy)
G  goo (kills both)        f  Fireboy spawn             w  Watergirl spawn
F  Fireboy door            W  Watergirl door            r  red gem     c  cyan gem
1-4  button — activates every elevator whose `link` matches that digit
```

Elevators live outside the grid because they move:

```js
elevators: [{ id: 'elev1', link: '1', x: 3, yTop: 4, yBottom: 9, w: 3, speed: 60 }]
```

Both doors must be occupied *and* every gem collected before `LEVEL_COMPLETE` fires.
