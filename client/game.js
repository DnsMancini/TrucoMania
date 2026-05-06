const socket = io();

const statusEl = document.getElementById('status');
const roomInput = document.getElementById('roomId');
const nameInput = document.getElementById('playerName');

let currentRoomId = null;

function updateStatus(data) {
  statusEl.textContent = JSON.stringify(data, null, 2);
}

document.getElementById('createBtn').addEventListener('click', () => {
  const roomId = roomInput.value.trim();
  const playerName = nameInput.value.trim();
  if (!roomId) return;

  currentRoomId = roomId;
  socket.emit('room:create', { roomId, playerName });
});

document.getElementById('joinBtn').addEventListener('click', () => {
  const roomId = roomInput.value.trim();
  const playerName = nameInput.value.trim();
  if (!roomId) return;

  currentRoomId = roomId;
  socket.emit('room:join', { roomId, playerName });
});

document.getElementById('nextTurnBtn').addEventListener('click', () => {
  if (!currentRoomId) return;

  socket.emit('turn:next', { roomId: currentRoomId });
});

socket.on('connected', (payload) => {
  updateStatus({ message: 'Conectado', ...payload });
});

socket.on('room:update', (room) => {
  updateStatus(room);
});

socket.on('room:error', (err) => {
  updateStatus(err);
});
