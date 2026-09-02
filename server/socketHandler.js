const { Game4P } = require('./game');
const { createBot, shouldCallBet, respondBet, chooseCard } = require('./bot');
const { admin } = require('./firebaseAdmin');

const rooms = new Map();
const MAX_ROOMS = 8;
const OFFLINE_TIMEOUT = 90000; // 90 segundos
const BOT_WAIT_SECONDS = 15;
const BET_FUNCTIONS = {
  respond: 'respondBet',
  turn: 'checkBotTurn',
  response: 'checkBotResponse'
};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcastRooms(io) {
  const openRooms = [];
  for (const [code, room] of rooms) {
    // Somente salas públicas aguardando jogadores aparecem no lobby.
    // Salas privadas e partidas já iniciadas ficam fora da lista pública.
    if (room.status === 'waiting' && room.isPublic !== false) {
      openRooms.push({ code, players: room.players.length, status: room.status });
    }
  }
  io.emit('roomsUpdate', openRooms);
}

function authenticateSocket(socket, token) {
  return admin.auth().verifyIdToken(token).then(decodedToken => {
    socket.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || null
    };
    return socket.user;
  });
}

function requireAuth(socket, callback) {
  if (socket.user) return true;
  if (typeof callback === 'function') callback({ error: 'Não autenticado' });
  else socket.emit('authError', { message: 'Sessão não autenticada. Faça login novamente.' });
  return false;
}

function handleSocket(io) {
  io.on('connection', (socket) => {
    broadcastRooms(io);

    socket.on('authenticate', async (token, callback) => {
      try {
        if (!token) throw new Error('Token ausente');
        const user = await authenticateSocket(socket, token);
        if (typeof callback === 'function') callback({ ok: true, uid: user.uid });
        socket.emit('authenticated', { uid: user.uid });
        broadcastRooms(io);
      } catch (error) {
        socket.user = null;
        console.error('[socket-auth] Token Firebase inválido:', error.message);
        if (typeof callback === 'function') callback({ error: 'Não autenticado' });
        socket.emit('authError', { message: 'Sessão inválida. Faça login novamente.' });
      }
    });

    socket.on('getRooms', () => broadcastRooms(io));

    // Suporta tanto a chamada antiga (playerName, callback) quanto a nova
    // (playerName, options, callback), mantendo compatibilidade com o cliente atual.
    socket.on('createRoom', (playerName, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      const options = (optionsOrCallback && typeof optionsOrCallback === 'object') ? optionsOrCallback : {};

      if (!requireAuth(socket, callback)) return;
      if (rooms.size >= MAX_ROOMS) {
        return callback({ error: 'Máximo de salas atingido.' });
      }

      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();

      const room = {
        players: [{ id: socket.id, uid: socket.user.uid, name: playerName, isBot: false, online: true, pendingReplace: false }],
        game: null,
        countdownInterval: null,
        pendingJoin: [],
        offlineTimers: new Map(),
        code,
        status: 'waiting',
        isPublic: options.visibility !== 'private',
        fillWithBots: options.fillWithBots !== false
      };
      rooms.set(code, room);
      socket.join(code);
      callback({
        roomCode: code,
        isPublic: room.isPublic,
        fillWithBots: room.fillWithBots,
        players: room.players.map(p => ({ name: p.name, isBot: false, online: true }))
      });
      broadcastRooms(io);

      if (room.fillWithBots) {
        let count = BOT_WAIT_SECONDS;
        io.to(code).emit('lobbyCountdown', { count });
        room.countdownInterval = setInterval(() => {
          count--;
          io.to(code).emit('lobbyCountdown', { count });
          if (count <= 0) {
            clearInterval(room.countdownInterval);
            room.countdownInterval = null;
            fillWithBotsAndStart(code, io);
          }
        }, 1000);
      }
    });

    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
      if (!requireAuth(socket, callback)) return;
      const room = rooms.get(roomCode);
      if (!room) return callback({ error: 'Sala não encontrada' });
      if (room.status === 'waiting' && room.players.length >= 4) {
        return callback({ error: 'Sala cheia' });
      }

      if (room.status === 'playing') {
        if (room.game && room.game.setWins[0] === 1 && room.game.setWins[1] === 1) {
          return callback({ error: 'Partida no terceiro set, entrada não permitida.' });
        }
        room.pendingJoin.push({ socket, playerName, uid: socket.user.uid });
        socket.join(roomCode);
        callback({ roomCode, waiting: true });
        return;
      }

      room.players.push({ id: socket.id, uid: socket.user.uid, name: playerName, isBot: false, online: true, pendingReplace: false });
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
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      updateActivity(room, socket.id, io);
      room.game.playCard(playerIndex, card);
      checkBotTurn(room, io);
    });

    socket.on('callBet', (betType) => {
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      updateActivity(room, socket.id, io);
      room.game.callBet(playerIndex, betType);
      checkBotResponse(room, io);
    });

    socket.on('respondBet', (action) => {
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      updateActivity(room, socket.id, io);
      room.game.respondBet(playerIndex, action);
      // Após resposta humana, verificar se precisa continuar com bots
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    });

    socket.on('fleeHand', () => {
      if (!requireAuth(socket)) return;
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
        // Limpar timer do turno se estava em andamento
        if (room.game && room.game.currentPlayer === room.players.indexOf(player)) {
          room.game.turnStage = 'play'; // para evitar travamento
        }
        const timer = setTimeout(() => {
          if (room.players.includes(player)) {
            player.pendingReplace = true;
          }
        }, OFFLINE_TIMEOUT);
        room.offlineTimers.set(socket.id, timer);
        broadcastRooms(io);
      }
    });
  });
}

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
  setTimeout(() => {
    checkBotTurn(room, io);
  }, 100);
  emitPlayerStatus(room, io);
}

function processPendingJoins(room, io) {
  while (room.pendingJoin.length > 0) {
    const botIndex = room.players.findIndex(p => p.isBot);
    if (botIndex === -1) break;
    const { socket, playerName, uid } = room.pendingJoin.shift();
    room.players[botIndex] = { id: socket.id, uid, name: playerName, isBot: false, online: true, pendingReplace: false };
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
    if (player && player.isBot) {
      setTimeout(() => {
        if (room.game && room.game.currentPlayer === cp && room.game.turnStage === 'play') {
          const hand = room.game.hands[cp];
          if (hand && hand.length > 0) {
            const card = chooseCard(hand, room.game.vira.rank);
            room.game.playCard(cp, card);
            checkBotTurn(room, io);
          }
        }
      }, 1000 + Math.random() * 2000);
    }
  }
  if (room.game.turnStage === 'play' && !room.game.betState && !room.game.maoDe11) {
    const cp = room.game.currentPlayer;
    const player = room.players[cp];
    if (player && player.isBot && hasBotPartner(room.players, cp)) {
      const hand = room.game.hands[cp];
      if (hand) {
        const bet = shouldCallBet(hand, room.game.vira.rank, room.game.handValue, room.game.maoDe11);
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
}

function checkBotResponse(room, io) {
  if (!room.game || room.game.turnStage !== 'respond' || !room.game.betState) return;
  const respTeam = room.game.betState.responderTeam;
  const teamPlayers = [respTeam, respTeam + 2];

  // Se TODOS os jogadores do time são bots, responder automaticamente
  if (teamPlayers.every(i => room.players[i] && room.players[i].isBot)) {
    const botPlayer = teamPlayers
      .map(i => ({ index: i, player: room.players[i] }))
      .find(p => p.player && p.player.isBot);
    if (botPlayer) {
      const playerIndex = botPlayer.index;
      const hand = room.game.hands[playerIndex];
      if (hand) {
        const action = respondBet(hand, room.game.vira.rank, room.game.betState.level);
        setTimeout(() => {
          if (room.game && room.game.betState) {
            room.game.respondBet(playerIndex, action);
            checkBotResponse(room, io);
            checkBotTurn(room, io);
          }
        }, 2000 + Math.random() * 2000);
      }
    }
  }
  // Se tem humano, o evento turnToRespond já foi emitido - aguardar resposta do socket
}

function hasBotPartner(players, playerIndex) {
  const partnerIndex = (playerIndex + 2) % 4;
  return Boolean(players[partnerIndex]?.isBot);
}

function findRoomBySocket(socketId) {
  for (const [, room] of rooms)
    if (room.players.some(p => p.id === socketId)) return room;
  return null;
}

module.exports = { handleSocket };