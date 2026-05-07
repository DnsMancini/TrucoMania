const { Game2P } = require('./game');

const rooms = new Map(); // roomId -> Game2P

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function handleSocket(io) {
  io.on('connection', (socket) => {
    console.log(` conectado: ${socket.id}`);

    socket.on('createRoom', (playerName, callback) => {
      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();
      const room = {
        players: [{ id: socket.id, name: playerName }],
        game: null,
      };
      rooms.set(code, room);
      socket.join(code);
      callback({ roomCode: code, players: room.players });
    });

    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
      const room = rooms.get(roomCode);
      if (!room) return callback({ error: 'Sala não encontrada' });
      if (room.players.length >= 2) return callback({ error: 'Sala cheia' });
      room.players.push({ id: socket.id, name: playerName });
      socket.join(roomCode);

      // Iniciar jogo quando 2 jogadores
      if (room.players.length === 2) {
        const emit = (event, data, target) => {
          if (target === 'all') io.to(roomCode).emit(event, data);
          else io.to(target).emit(event, data);
        };
        room.game = new Game2P(roomCode, room.players, emit);
        room.game.startGame();
      } else {
        io.to(roomCode).emit('waiting', room.players);
      }
      callback({ roomCode, players: room.players });
    });

    socket.on('playCard', (card) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      room.game.playCard(playerIndex, card);
    });

    socket.on('callBet', (betType) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      room.game.callBet(playerIndex, betType);
    });

    socket.on('respondBet', (action) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      room.game.respondBet(playerIndex, action);
    });

    socket.on('disconnect', () => {
      const room = findRoomBySocket(socket.id);
      if (room) {
        io.to(room.roomId).emit('playerLeft', { message: 'Oponente desconectou' });
        rooms.delete(room.roomId);
      }
    });
  });
}

function findRoomBySocket(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.some(p => p.id === socketId)) {
      return { roomId: code, ...room };
    }
  }
  return null;
}

module.exports = { handleSocket };
