// src/game/levels/level3.js
//
// Важіль (на відміну від кнопки) лишається у ввімкненому стані — тож
// підняти міст може один гравець, а перейти можуть обидва.
// Нахилена платформа демонструє, що колізії справді OBB, а не AABB.
export default {
  name: 'Слизький схил',
  background: '#111827',
  spawn: {
    fire:  { x: 30, y: 300 },
    water: { x: 95, y: 300 },
  },
  platforms: [
    { x: 0, y: 360, w: 215, h: 40 },
    { x: 585, y: 360, w: 215, h: 40 },
    { x: 300, y: 250, w: 200, h: 18, angle: -0.25 },
  ],
  zones: [
    { x: 215, y: 344, w: 370, h: 16, type: 'goo' },
  ],
  levers: [
    { id: 'lv1', link: 'lift', x: 155, y: 320, w: 18, h: 40 },
  ],
  elevators: [
    { id: 'eLift', link: 'lift', x: 220, w: 80, h: 16, yTop: 235, yBottom: 332, speed: 80 },
  ],
  gems: [
    { id: 'g1', role: 'fire',  x: 330, y: 205, w: 16, h: 16 },
    { id: 'g2', role: 'water', x: 450, y: 175, w: 16, h: 16 },
  ],
  doors: {
    fire:  { x: 620, y: 300, w: 32, h: 60 },
    water: { x: 740, y: 300, w: 32, h: 60 },
  },
};
