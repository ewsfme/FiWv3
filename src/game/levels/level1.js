// src/game/levels/level1.js
export default {
  name: 'Перші кроки',
  background: '#171a26',
  spawn: {
    fire:  { x: 40, y: 300 },
    water: { x: 100, y: 300 },
  },
  platforms: [
    { x: 0, y: 360, w: 800, h: 40 },
    { x: 190, y: 265, w: 150, h: 18 },
    { x: 450, y: 265, w: 150, h: 18 },
  ],
  zones: [
    { x: 350, y: 344, w: 50, h: 16, type: 'lava' },
    { x: 400, y: 344, w: 50, h: 16, type: 'water' },
  ],
  gems: [
    { id: 'g1', role: 'fire',  x: 250, y: 235, w: 16, h: 16 },
    { id: 'g2', role: 'water', x: 510, y: 235, w: 16, h: 16 },
  ],
  doors: {
    fire:  { x: 660, y: 300, w: 32, h: 60 },
    water: { x: 730, y: 300, w: 32, h: 60 },
  },
};
