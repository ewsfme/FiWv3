// src/game/levels/level2.js
//
// Взаємна залежність: кнопка внизу піднімає ліфт для ДРУГОГО гравця,
// а кнопка нагорі — ліфт для першого. Наодинці рівень не проходиться.
export default {
  name: 'Два ліфти',
  background: '#141a24',
  spawn: {
    fire:  { x: 40, y: 300 },
    water: { x: 110, y: 300 },
  },
  platforms: [
    { x: 0, y: 360, w: 800, h: 40 },
    { x: 0, y: 180, w: 170, h: 18 },
    { x: 630, y: 180, w: 170, h: 18 },
  ],
  zones: [
    { x: 250, y: 344, w: 110, h: 16, type: 'lava' },
    { x: 430, y: 344, w: 110, h: 16, type: 'water' },
  ],
  buttons: [
    { id: 'b1', link: 'right', x: 60, y: 348, w: 60, h: 12 },
    { id: 'b2', link: 'left',  x: 680, y: 168, w: 60, h: 12 },
  ],
  elevators: [
    { id: 'eR', link: 'right', x: 600, w: 100, h: 16, yTop: 190, yBottom: 330, speed: 90 },
    { id: 'eL', link: 'left',  x: 180, w: 100, h: 16, yTop: 190, yBottom: 330, speed: 90 },
  ],
  gems: [
    { id: 'g1', role: 'fire',  x: 385, y: 318, w: 16, h: 16 },
    { id: 'g2', role: 'water', x: 200, y: 318, w: 16, h: 16 },
  ],
  doors: {
    fire:  { x: 30, y: 120, w: 32, h: 60 },
    water: { x: 740, y: 120, w: 32, h: 60 },
  },
};
