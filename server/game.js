const rooms = new Map();

function getRoom(roomId) {
  return rooms.get(roomId);
}

function createRoom(roomId, player) {
  const room = {
    id: roomId,
    players: [player],
    turn: 0,
    status: 'waiting'
  };

  rooms.set(roomId, room);
  return room;
}

function joinRoom(roomId, player) {
  const room = getRoom(roomId);
  if (!room) return { error: 'Sala não existe.' };
  if (room.players.length >= 2) return { error: 'Sala cheia.' };

  room.players.push(player);
  room.status = 'playing';
  return { room };
}

function removePlayer(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    room.players = room.players.filter((p) => p.socketId !== socketId);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      return null;
    }

    room.status = 'waiting';
    return room;
  }

  return null;
}

function nextTurn(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;

  room.turn = (room.turn + 1) % room.players.length;
  return room;
}

module.exports = {
  getRoom,
  createRoom,
  joinRoom,
  removePlayer,
  nextTurn
};
