// src/game/levels/index.js
//
// Рівні маркуються числом у назві файлу (levelN.js) і йдуть по порядку.
// Браузерні ES-модулі не вміють сканувати папку (glob), тому список тут
// статичний. Щоб додати рівень:
//   1. створіть src/game/levels/levelN.js за зразком level1.js;
//   2. імпортуйте його нижче та додайте у масив LEVELS.
//
// Формат рівня: spawn.fire/spawn.water, platforms[], zones[] (lava/water/
// goo/damage/heal), buttons[], levers[], elevators[], gems[], doors.fire/
// doors.water. Усе, крім platforms і zones, — опційне.

import level1 from './level1.js';
import level2 from './level2.js';
import level3 from './level3.js';

export const LEVELS = [level1, level2, level3];
