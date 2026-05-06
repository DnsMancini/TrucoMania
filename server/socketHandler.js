const {
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  nextTurn
} = require('./game');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.emit('connected', { socketId: socket.id });

    socket.on('room:create', ({ roomId, playerName }) => {
      if (getRoom(roomId)) {
        socket.emit('room:error', { message: 'Sala já existe.' });
        return;
      }

      const player = { socketId: socket.id, name: playerName || 'Jogador 1' };
      const room = createRoom(roomId, player);

      socket.join(roomId);
      io.to(roomId).emit('room:update', room);
    });

    socket.on('room:join', ({ roomId, playerName }) => {
      const player = { socketId: socket.id, name: playerName || 'Jogador 2' };
      const result = joinRoom(roomId, player);

      if (result.error) {
        socket.emit('room:error', { message: result.error });
        return;
      }

      socket.join(roomId);
      io.to(roomId).emit('room:update', result.room);
    });

    socket.on('turn:next', ({ roomId }) => {
      const room = nextTurn(roomId);
      if (room) {
        io.to(roomId).emit('room:update', room);
      }
    });

    socket.on('disconnect', () => {
      const room = removePlayer(socket.id);
      if (room) {
        io.to(room.id).emit('room:update', room);
      }
    });
  });
}

module.exports = registerSocketHandlers;
