const core = require('./socketHandler-core');

function invalidateBotTimersOnHumanReplacement(room) {
  if (!room?.game) return;
  for (const timerName of ['botTurnTimer', 'botDecisionTimer', 'botResponseTimer']) {
    if (room.game[timerName]) {
      clearTimeout(room.game[timerName]);
      room.game[timerName] = null;
    }
  }
}

const originalRoomsSet = core.rooms.set.bind(core.rooms);
core.rooms.set = (roomCode, room) => {
  if (room?.players && !room.players.__botReplacementGuard) {
    const players = room.players;
    const guardedPlayers = new Proxy(players, {
      set(target, property, value) {
        if (property !== 'length' && Number.isInteger(Number(property))) {
          const index = Number(property);
          if (target[index]?.isBot === true && value?.isBot === false) {
            invalidateBotTimersOnHumanReplacement(room);
          }
        }
        return Reflect.set(target, property, value);
      }
    });
    Object.defineProperty(guardedPlayers, '__botReplacementGuard', { value: true });
    room.players = guardedPlayers;
  }
  return originalRoomsSet(roomCode, room);
};

function handleSocket(io) {
  io.on('connection', (socket) => {
    socket.use((packet, next) => {
      if (packet[0] === 'playCard' && packet[1] && typeof packet[1] === 'object' && Number.isInteger(packet[1].blindIndex)) {
        packet[1] = { ...packet[1], suit: '4', rank: '4' };
      }
      next();
    });
  });

  core.handleSocket(io);
}

module.exports = { handleSocket, rooms: core.rooms };
