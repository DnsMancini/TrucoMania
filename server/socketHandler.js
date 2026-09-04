const core = require('./socketHandler-core');

function handleSocket(io) {
  io.on('connection', (socket) => {
    socket.use((packet, next) => {
      if (packet[0] === 'authenticate' && socket.user) {
        socket.emit('authError', { message: 'Socket já autenticado. Reconecte para trocar de conta.' });
        return next(new Error('Socket já autenticado'));
      }

      if (packet[0] === 'playCard' && packet[1] && typeof packet[1] === 'object' && Number.isInteger(packet[1].blindIndex)) {
        packet[1] = { ...packet[1], suit: '4', rank: '4' };
      }
      next();
    });
  });

  core.handleSocket(io);
}

module.exports = { handleSocket, rooms: core.rooms };