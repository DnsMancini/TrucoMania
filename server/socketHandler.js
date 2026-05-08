const { Game4P } = require('./game');
const { createBot, shouldCallBet, respondBet, chooseCard } = require('./bot');

const rooms = new Map();
const MAX_ROOMS = 8;
const OFFLINE_TIMEOUT = 90000; // 90 segundos

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcastRooms(io) {
  const openRooms = [];
  for (const [code, room] of rooms) {
    if (room.status === 'waiting' || room.status === 'playing') {
      openRooms.push({ code, players: room.players.length, status: room.status });
    }
  }
  io.emit('roomsUpdate', openRooms);
}

function handleSocket(io) {
  io.on('connection', (socket) => {
    broadcastRooms(io);

    socket.on('getRooms', () => broadcastRooms(io));

    socket.on('createRoom', (playerName, callback) => {
      if (rooms.size >= MAX_ROOMS) {
        return callback({ error: 'Máximo de salas atingido.' });
      }
      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();
      const room = {
        players: [{ id: socket.id, name: playerName, isBot: false, online: true, pendingReplace: false }],
        game: null,
        countdownInterval: null,
        pendingJoin: [],
        offlineTimers: new Map(),
        code,
        status: 'waiting'
      };
      rooms.set(code, room);
      socket.join(code);
      callback({ roomCode: code, players: room.players.map(p => ({name:p.name, isBot:false, online:true})) });
      broadcastRooms(io);

      let count = 3;
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
      if (room.players.length >= 4 && room.status !== 'playing') {
        return callback({ error: 'Sala cheia' });
      }

      if (room.status === 'playing') {
        if (room.game && room.game.setWins[0] === 1 && room.game.setWins[1] === 1) {
          return callback({ error: 'Partida no terceiro set, entrada não permitida.' });
        }
        room.pendingJoin.push({ socket, playerName });
        socket.join(roomCode);
        callback({ roomCode, waiting: true });
        return;
      }

      room.players.push({ id: socket.id, name: playerName, isBot: false, online: true, pendingReplace: false });
      socket.join(roomCode);
      callback({ roomCode, players: room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online })) });
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
      updateActivity(room, socket.id, io);
      room.game.playCard(playerIndex, card);
      checkBotTurn(room, io);
    });

    socket.on('callBet', (betType) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      updateActivity(room, socket.id, io);
      room.game.callBet(playerIndex, betType);
      checkBotResponse(room, io);
    });

    socket.on('respondBet', (action) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      updateActivity(room, socket.id, io);
      room.game.respondBet(playerIndex, action);
      checkBotTurn(room, io);
    });

    socket.on('fleeHand', () => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      updateActivity(room, socket.id, io);
      room.game.fleeHand(playerIndex);
    });

    socket.on('disconnect', () => {
      const room = findRoomBySocket(socket.id);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (player && !player.isBot) {
        player.online = false;
        emitPlayerStatus(room, io);
        const timer = setTimeout(() => {
          if (room.players.includes(player)) {
            player.pendingReplace = true;
          }
        }, OFFLINE_TIMEOUT);
        room.offlineTimers.set(socket.id, timer);
      }
    });
  });
}

// Corrigida: agora recebe io e repassa para emitPlayerStatus
function updateActivity(room, socketId, io) {
  const timer = room.offlineTimers.get(socketId);
  if (timer) {
    clearTimeout(timer);
    room.offlineTimers.delete(socketId);
  }
  const player = room.players.find(p => p.id === socketId);
  if (player && !player.online) {
    player.online = true;
    player.pendingReplace = false;
    emitPlayerStatus(room, io);
  }
}

function fillWithBotsAndStart(code, io) {
  const room = rooms.get(code);
  if (!room || room.status !== 'waiting') return;
  const needed = 4 - room.players.length;
  for (let i = 0; i < needed; i++) {
    const bot = createBot(room.players.length);
    bot.online = true;
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
  room.game = new Game4P(
    room.code,
    room.players,
    emit,
    () => {
      rooms.delete(room.code);
      broadcastRooms(io);
    },
    () => processPendingJoins(room, io)
  );
  room.game.checkBotTurn = () => checkBotTurn(room, io);
  room.game.startGame();
  checkBotTurn(room, io);
  emitPlayerStatus(room, io);
}

function processPendingJoins(room, io) {
  while (room.pendingJoin.length > 0) {
    const botIndex = room.players.findIndex(p => p.isBot);
    if (botIndex === -1) break;
    const { socket, playerName } = room.pendingJoin.shift();
    room.players[botIndex] = { id: socket.id, name: playerName, isBot: false, online: true, pendingReplace: false };
    socket.join(room.code);
  }
  for (let i = 0; i < room.players.length; i++) {
    const p = room.players[i];
    if (!p.isBot && p.pendingReplace) {
      const bot = createBot(i);
      bot.online = true;
      room.players[i] = bot;
    }
  }
  emitPlayerStatus(room, io);
  checkAllHumansGone(room, io);
}

function checkAllHumansGone(room, io) {
  const humansLeft = room.players.some(p => !p.isBot && p.online);
  if (!humansLeft) {
    io.to(room.code).emit('matchOver', { winnerTeam: -1, setWins: [0,0], message: 'Todos os jogadores saíram.' });
    rooms.delete(room.code);
    broadcastRooms(io);
  }
}

function emitPlayerStatus(room, io) {
  io.to(room.code).emit('playerStatusUpdate', room.players.map(p => ({
    name: p.name,
    isBot: p.isBot,
    online: p.online
  })));
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