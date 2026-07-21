// api/signal.js
//
// Мінімальний сигнальний сервер для WebRTC на Vercel Serverless Functions.
// Зберігає в пам'яті процесу offer/answer для кожної кімнати, поки одна
// з сторін (host) не забере answer. Це НЕ постійне сховище — на serverless
// платформі пам'ять може очищатись між викликами (cold start), тому для
// продакшн-навантаження варто замінити на Vercel KV / Redis. Для гри на
// двох гравців з коротким часом life-cycle кімнати цього достатньо.

const ROOM_TTL_MS = 5 * 60 * 1000; // 5 хвилин
const rooms = new Map();

function cleanupOldRooms() {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.updatedAt > ROOM_TTL_MS) {
      rooms.delete(id);
    }
  }
}

export default function handler(req, res) {
  const { method, query, body } = req;
  const roomId = query.room;

  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  cleanupOldRooms();

  if (method === 'POST') {
    const existing = rooms.get(roomId) || {};
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    rooms.set(roomId, { ...existing, ...payload, updatedAt: Date.now() });
    return res.status(200).json({ success: true });
  }

  if (method === 'GET') {
    return res.status(200).json(rooms.get(roomId) || {});
  }

  if (method === 'DELETE') {
    rooms.delete(roomId);
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
