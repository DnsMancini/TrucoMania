const { Game4P } = require('./game');
const { createBot, shouldCallBet, respondBet, chooseCard } = require('./bot');

const rooms = new Map();
const MAX_ROOMS = 8;

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcastRooms(io) {
  const openRooms = [];
  for (const [code, room] of rooms) {
    if (room.status === 'waiting') {
      openRooms.push({ code, players: room.players.length });
    }
  }
  io.emit('roomsUpdate', openRooms);
}

function handleSocket(io) {
  io.on('connection', (socket) => {
    broadcastRooms(io);

    socket.on('getRooms', () => {
      broadcastRooms(io);
    });

    socket.on('createRoom', (playerName, callback) => {
      if (rooms.size >= MAX_ROOMS) {
        return callback({ error: 'Máximo de salas atingido.' });
      }
      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();
      const room = {
        players: [{ id: socket.id, name: playerName, isBot: false }],
        game: null,
        countdownInterval: null,
        code,
        status: 'waiting'
      };
      rooms.set(code, room);
      socket.join(code);
      callback({ roomCode: code, players: room.players.map(p => ({name:p.name, isBot:false})) });
      broadcastRooms(io);

      let count = 10;
      io.to(code).emit('lobbyCountdown', { count });
      room.countdownInterval = setInterval(() => {
        count--;
        io.to(code).emit('lobbyCountdown', { count });
        if (count <= 0) {
          clearInterval(room.countdownInterval);
          fillWithBotsAndStart(code, io);
        }
      }, 1000);
    });

    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
      const room = rooms.get(roomCode);
      if (!room) return callback({ error: 'Sala não encontrada' });
      if (room.players.length >= 4) return callback({ error: 'Sala cheia' });
      room.players.push({ id: socket.id, name: playerName, isBot: false });
      socket.join(roomCode);
      callback({ roomCode, players: room.players.map(p => ({ name: p.name, isBot: p.isBot })) });
      broadcastRooms(io);

      if (room.players.length === 4) {
        if (room.countdownInterval) {
          clearInterval(room.countdownInterval);
          room.countdownInterval = null;
        }
        fillWithBotsAndStart(roomCode, io);
      }
    });

    socket.on('playCard', (card) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      room.game.playCard(playerIndex, card);
      checkBotTurn(room, io);
    });

    socket.on('callBet', (betType) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      room.game.callBet(playerIndex, betType);
      checkBotResponse(room, io);
    });

    socket.on('respondBet', (action) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      room.game.respondBet(playerIndex, action);
      checkBotTurn(room, io);
    });

    socket.on('fleeHand', () => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      room.game.fleeHand(playerIndex);
    });

    socket.on('disconnect', () => {
      for (const [code, room] of rooms) {
        const idx = room.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          if (room.players.length === 0) {
            if (room.countdownInterval) clearInterval(room.countdownInterval);
            rooms.delete(code);
            broadcastRooms(io);
          } else {
            broadcastRooms(io);
          }
          break;
        }
      }
    });
  });
}

function fillWithBotsAndStart(code, io) {
  const room = rooms.get(code);
  if (!room || room.status !== 'waiting') return;
  const needed = 4 - room.players.length;
  for (let i = 0; i < needed; i++) {
    const bot = createBot(room.players.length);
    room.players.push(bot);
  }
  room.status = 'playing';
  broadcastRooms(io);
  startGame(room, io);
}

function startGame(room, io) {
  const emit = (event, data, target) => {
    if (target === 'all') {
      io.to(room.code).emit(event, data);
    } else {
      if (!room.players.find(p => p.id === target)?.isBot)
        io.to(target).emit(event, data);
    }
  };
  room.game = new Game4P(room.code, room.players, emit, () => {
    rooms.delete(room.code);
    broadcastRooms(io);
  });
  room.game.checkBotTurn = () => checkBotTurn(room, io);
  room.game.startGame();
  checkBotTurn(room, io);
}

function checkBotTurn(room, io) {
  if (!room.game) return;
  if (room.game.turnStage === 'play') {
    const cp = room.game.currentPlayer;
    const player = room.players[cp];
    if (player.isBot) {
      setTimeout(() => {
        if (room.game && room.game.currentPlayer === cp && room.game.turnStage === 'play') {
          const hand = room.game.hands[cp];
          const card = chooseCard(hand, room.game.vira.rank);
          room.game.playCard(cp, card);
          checkBotTurn(room, io);
        }
      }, 1000 + Math.random() * 2000);
    }
  }
  if (room.game.turnStage === 'play' && !room.game.betState && !room.game.maoDe11) {
    const cp = room.game.currentPlayer;
    const player = room.players[cp];
    if (player.isBot) {
      const bet = shouldCallBet(room.game.hands[cp], room.game.vira.rank, room.game.handValue, room.game.maoDe11);
      if (bet) {
        setTimeout(() => {
          if (room.game && room.game.currentPlayer === cp && !room.game.betState) {
            room.game.callBet(cp, bet);
            checkBotResponse(room, io);
          }
        }, 1500 + Math.random() * 1000);
      }
    }
  }
}

function checkBotResponse(room, io) {
  if (!room.game || room.game.turnStage !== 'respond') return;
  const respTeam = room.game.betState.responderTeam;
  const teamPlayers = [respTeam, respTeam+2];
  const botPlayer = teamPlayers.map(i => room.players[i]).find(p => p.isBot);
  if (botPlayer) {
    const playerIndex = room.players.indexOf(botPlayer);
    const hand = room.game.hands[playerIndex];
    const action = respondBet(hand, room.game.vira.rank, room.game.betState.level);
    setTimeout(() => {
      if (room.game && room.game.betState && room.game.respondBet(playerIndex, action))
        checkBotTurn(room, io);
    }, 2000 + Math.random() * 2000);
  }
}

function findRoomBySocket(socketId) {
  for (const [code, room] of rooms)
    if (room.players.some(p => p.id === socketId)) return { code, ...room };
  return null;
}

module.exports = { handleSocket };