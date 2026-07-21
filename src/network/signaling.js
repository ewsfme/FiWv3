// src/network/signaling.js
//
// Тонка обгортка над HTTP-запитами до /api/signal.
// Нічого не знає ні про гру, ні про WebRTC — лише передає JSON туди-сюди.

export async function sendSignal(roomId, data) {
  await fetch(`/api/signal?room=${encodeURIComponent(roomId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getSignal(roomId) {
  const res = await fetch(`/api/signal?room=${encodeURIComponent(roomId)}`);
  return res.json();
}

export async function clearSignal(roomId) {
  await fetch(`/api/signal?room=${encodeURIComponent(roomId)}`, { method: 'DELETE' });
}
