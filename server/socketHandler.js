const { Game4P } = require('./game');
const { createBot, shouldCallBet, respondBet, chooseCard } = require('./bot');
const { admin, db } = require('./firebaseAdmin');

const rooms = new Map();
const MAX_ROOMS = 8;
const OFFLINE_TIMEOUT = 90000; // 90 segundos
const BOT_WAIT_SECONDS = 15;

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcastRooms(io) {
  const openRooms = [];
  for (const [code, room] of rooms) {
    if (room.status === 'waiting' && room.isPublic !== false) {
      openRooms.push({ code, players: room.players.length, status: room.status });
    }
  }
  io.emit('roomsUpdate', openRooms);
}

async function authenticateSocket(socket, token) {
  const decodedToken = await admin.auth().verifyIdToken(token);
  const playerDoc = await db.collection('players').doc(decodedToken.uid).get();
  const playerData = playerDoc.exists ? playerDoc.data() : null;

  if (playerData?.banned === true) {
    const error = new Error('Conta banida');
    error.code = 'account-banned';
    throw error;
  }

  socket.user = {
    uid: decodedToken.uid,
    email: decodedToken.email || null,
    name: decodedToken.name || null,
    banned: false
  };

  socket.banUnsubscribe = db.collection('players').doc(decodedToken.uid).onSnapshot(
    snapshot => {
      const banned = snapshot.exists && snapshot.data()?.banned === true;
      if (!socket.user) return;
      socket.user.banned = banned;
      if (banned) {
        console.warn(`[socket-auth] Usuário banido durante sessão: ${decodedToken.uid}`);
        socket.emit('authError', { message: 'Sua conta foi banida.' });
        socket.disconnect(true);
      }
    },
    error => {
      console.error('[socket-auth] Erro ao monitorar banimento:', error.message);
    }
  );

  return socket.user;
}

function requireAuth(socket, callback) {
  if (socket.user && socket.user.banned !== true) return true;
  if (typeof callback === 'function') callback({ error: socket.user?.banned ? 'Conta banida' : 'Não autenticado' });
  else socket.emit('authError', { message: socket.user?.banned ? 'Sua conta foi banida.' : 'Sessão não autenticada. Faça login novamente.' });
  return false;
}

function findRoomByUid(uid) {
  if (!uid) return null;
  for (const room of rooms.values()) {
    const playerIndex = room.players.findIndex(player => player.uid === uid && !player.isBot);
    if (playerIndex !== -1) return { room, playerIndex };
  }
  return null;
}

function restoreAuthenticatedPlayer(socket, uid, io) {
  const found = findRoomByUid(uid);
  if (!found) return null;

  const { room, playerIndex } = found;
  const player = room.players[playerIndex];
  const previousSocketId = player.id;

  if (previousSocketId === socket.id && player.online) return room;

  const previousTimer = room.offlineTimers.get(previousSocketId);
  if (previousTimer) {
    clearTimeout(previousTimer);
    room.offlineTimers.delete(previousSocketId);
  }

  player.id = socket.id;
  player.online = true;
  player.pendingReplace = false;
  socket.join(room.code);

  emitPlayerStatus(room, io);
  sendCurrentGameState(room, socket, playerIndex);
  return room;
}

function sendCurrentGameState(room, socket, playerIndex) {
  if (!room.game) return;

  socket.emit('gameStateRestore', {
    roomCode: room.code,
    player: playerIndex,
    hand: room.game.hands[playerIndex] || [],
    handsRemaining: room.game.hands.map(hand => hand.length),
    vira: room.game.vira,
    currentPlayer: room.game.currentPlayer,
    dealer: room.game.dealerIndex,
    handValue: room.game.handValue,
    scores: room.game.scores,
    setWins: room.game.setWins,
    maoDe11: room.game.maoDe11,
    maoDe11Team: room.game.maoDe11Team,
    maoDe11DecisionMade: room.game.maoDe11DecisionMade,
    currentRound: room.game.currentRound,
    roundCards: room.game.roundCards,
    roundWins: room.game.roundWins,
    playersInRound: room.game.playersInRound,
    roundStarter: room.game.roundStarter,
    turnStage: room.game.turnStage,
    betState: room.game.betState,
    players: room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online }))
  });

  if (room.game.turnStage === 'play') {
    socket.emit('turn', { currentPlayer: room.game.currentPlayer });
  } else if (room.game.turnStage === 'respond' && room.game.betState) {
    const responderTeam = room.game.betState.responderTeam;
    socket.emit('betCalled', {
      challenger: room.game.betState.challenger,
      level: room.game.betState.level,
      responderTeam
    });
    if (playerIndex % 2 === responderTeam) {
      socket.emit('turnToRespond', { responderTeam });
    }
  } else if (room.game.turnStage === 'mao11Decision' && room.game.maoDe11 && playerIndex % 2 === room.game.maoDe11Team && !room.game.maoDe11DecisionMade) {
    socket.emit('maoDe11Decision', { team: room.game.maoDe11Team });
  }
}

function handleSocket(io) {
  io.on('connection', (socket) => {
    broadcastRooms(io);

    socket.on('authenticate', async (token, callback) => {
      try {
        if (!token) throw new Error('Token ausente');
        const user = await authenticateSocket(socket, token);
        const found = findRoomByUid(user.uid);
        if (typeof callback === 'function') callback({ ok: true, uid: user.uid, reconnectAvailable: Boolean(found) });
        socket.emit('authenticated', { uid: user.uid, reconnectAvailable: Boolean(found) });
        broadcastRooms(io);
      } catch (error) {
        if (socket.banUnsubscribe) {
          socket.banUnsubscribe();
          socket.banUnsubscribe = null;
        }
        socket.user = null;
        console.error('[socket-auth] Falha na autenticação:', error.message);
        if (typeof callback === 'function') callback({ error: error.code === 'account-banned' ? 'Conta banida' : 'Não autenticado' });
        socket.emit('authError', { message: error.code === 'account-banned' ? 'Sua conta foi banida.' : 'Sessão inválida. Faça login novamente.' });
      }
    });

    socket.on('reconnectToGame', (callback) => {
      if (!requireAuth(socket, callback)) return;
      const room = restoreAuthenticatedPlayer(socket, socket.user.uid, io);
      if (!room) return callback?.({ error: 'Não há uma partida sua disponível para retornar.' });
      callback?.({ ok: true, roomCode: room.code });
      broadcastRooms(io);
    });

    socket.on('leaveRoom', (callback) => {
      if (!requireAuth(socket, callback)) return;

      const room = findRoomBySocket(socket.id);
      if (!room) return callback?.({ ok: true });

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return callback?.({ ok: true });
      const player = room.players[playerIndex];

      const offlineTimer = room.offlineTimers.get(socket.id);
      if (offlineTimer) {
        clearTimeout(offlineTimer);
        room.offlineTimers.delete(socket.id);
      }

      if (room.status === 'waiting') {
        room.players.splice(playerIndex, 1);
        if (room.countdownInterval && room.players.length === 0) {
          clearInterval(room.countdownInterval);
          room.countdownInterval = null;
          rooms.delete(room.code);
        }
        socket.leave(room.code);
        callback?.({ ok: true, roomCode: room.code, status: 'waiting' });
        emitPlayerStatus(room, io);
        broadcastRooms(io);
        return;
      }

      if (room.status === 'playing' && room.game) {
        const bot = createBot(playerIndex);
        bot.online = true;
        room.players[playerIndex] = bot;
        socket.leave(room.code);

        emitPlayerStatus(room, io);
        callback?.({ ok: true, roomCode: room.code, status: 'playing' });
        checkBotResponse(room, io);
        checkBotTurn(room, io);
        checkAllHumansGone(room, io);
        broadcastRooms(io);
        return;
      }

      socket.leave(room.code);
      callback?.({ ok: true });
    });

    socket.on('getRooms', () => broadcastRooms(io));

    socket.on('randomMatch', (playerName, callback) => {
      if (!requireAuth(socket, callback)) return;

      const candidatesPlaying = [];
      const candidatesWaiting = [];

      for (const room of rooms.values()) {
        if (room.isPublic === false) continue;
        if (room.players.some(player => player.uid === socket.user.uid && !player.isBot)) continue;

        if (room.status === 'playing') {
          const hasBot = room.players.some(player => player.isBot);
          const thirdSet = room.game && room.game.setWins[0] === 1 && room.game.setWins[1] === 1;
          const hasPendingJoin = room.pendingJoin?.some(join => join.uid === socket.user.uid);
          if (hasBot && !thirdSet && !hasPendingJoin) candidatesPlaying.push(room);
        } else if (room.status === 'waiting' && room.players.length < 4) {
          candidatesWaiting.push(room);
        }
      }

      if (candidatesPlaying.length > 0) {
        const room = candidatesPlaying[Math.floor(Math.random() * candidatesPlaying.length)];
        room.pendingJoin.push({ socket, playerName, uid: socket.user.uid });
        socket.join(room.code);
        return callback({ roomCode: room.code, waiting: true, mode: 'bot-replacement' });
      }

      if (candidatesWaiting.length > 0) {
        const room = candidatesWaiting[Math.floor(Math.random() * candidatesWaiting.length)];
        room.players.push({ id: socket.id, uid: socket.user.uid, name: playerName, isBot: false, online: true, pendingReplace: false });
        socket.join(room.code);
        callback({ roomCode: room.code, players: room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online })), mode: 'waiting-room' });
        broadcastRooms(io);

        if (room.players.length === 4) {
          if (room.countdownInterval) {
            clearInterval(room.countdownInterval);
            room.countdownInterval = null;
          }
          fillWithBotsAndStart(room.code, io);
        }
        return;
      }

      callback({ createNew: true, message: 'Nenhuma partida pública disponível. Criando uma nova mesa.' });
    });

    socket.on('createRoom', (playerName, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      const options = (optionsOrCallback && typeof optionsOrCallback === 'object') ? optionsOrCallback : {};

      if (!requireAuth(socket, callback)) return;
      if (rooms.size >= MAX_ROOMS) return callback({ error: 'Máximo de salas atingido.' });

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
      callback({ roomCode: code, isPublic: room.isPublic, fillWithBots: room.fillWithBots, players: room.players.map(p => ({ name: p.name, isBot: false, online: true })) });
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
      if (room.status === 'waiting' && room.players.length >= 4) return callback({ error: 'Sala cheia' });

      if (room.status === 'playing') {
        if (room.game && room.game.setWins[0] === 1 && room.game.setWins[1] === 1) return callback({ error: 'Partida no terceiro set, entrada não permitida.' });
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
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    });

    socket.on('respondMaoDe11', (action) => {
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      updateActivity(room, socket.id, io);
      const handled = room.game.respondMaoDe11(playerIndex, action);
      if (handled) {
        checkBotTurn(room, io);
        checkBotResponse(room, io);
      }
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
      if (socket.banUnsubscribe) {
        socket.banUnsubscribe();
        socket.banUnsubscribe = null;
      }
      const room = findRoomBySocket(socket.id);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (player && !player.isBot) {
        player.online = false;
        emitPlayerStatus(room, io);
        if (room.game && room.game.currentPlayer === room.players.indexOf(player) && room.game.turnStage === 'play') room.game.scheduleOfflineTurn();
        if (room.game && room.game.turnStage === 'mao11Decision') room.game.scheduleMaoDe11Decision();
        const timer = setTimeout(() => {
          if (room.players.includes(player)) player.pendingReplace = true;
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
    if (target === 'all') io.to(room.code).emit(event, data);
    else if (!room.players.find(p => p.id === target)?.isBot) io.to(target).emit(event, data);
  };
  room.game = new Game4P(room.code, room.players, emit, () => { rooms.delete(room.code); broadcastRooms(io); }, () => processPendingJoins(room, io));
  room.game.checkBotTurn = () => checkBotTurn(room, io);
  room.game.startGame();
  setTimeout(() => checkBotTurn(room, io), 100);
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
  io.to(room.code).emit('playerStatusUpdate', room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online })));
}

function buildBotContext(room, playerIndex) {
  const game = room.game;
  const player = room.players[playerIndex] || {};
  return {
    playerIndex,
    currentPlayer: game.currentPlayer,
    currentRound: game.currentRound,
    roundCards: game.roundCards,
    roundWins: game.roundWins,
    roundStarter: game.roundStarter,
    playersInRound: game.playersInRound,
    handValue: game.handValue,
    scores: game.scores,
    setWins: game.setWins,
    dealer: game.dealerIndex,
    betState: game.betState,
    style: player.style
  };
}

function checkBotTurn(room, io) {
  if (!room.game) return;

  if (room.game.turnStage === 'mao11Decision') {
    room.game.scheduleMaoDe11Decision();
    return;
  }

  if (room.game.turnStage === 'play') {
    const cp = room.game.currentPlayer;
    const player = room.players[cp];

    if (player && player.isBot) {
      setTimeout(() => {
        if (room.game && room.game.currentPlayer === cp && room.game.turnStage === 'play') {
          const hand = room.game.hands[cp];
          if (hand && hand.length > 0) {
            const context = buildBotContext(room, cp);
            const bet = shouldCallBet(hand, room.game.vira.rank, room.game.handValue, room.game.maoDe11, context);
            if (bet) {
              room.game.callBet(cp, bet);
              checkBotResponse(room, io);
              return;
            }

            const card = chooseCard(hand, room.game.vira.rank, context);
            room.game.playCard(cp, card);
            checkBotTurn(room, io);
          }
        }
      }, 1000 + Math.random() * 2000);
    }
  }
}

function checkBotResponse(room, io) {
  if (!room.game || room.game.turnStage !== 'respond' || !room.game.betState) return;
  const respTeam = room.game.betState.responderTeam;
  const teamPlayers = [respTeam, respTeam + 2];
  const botIndex = teamPlayers.find(index => room.players[index]?.isBot);
  if (botIndex === undefined) return;

  setTimeout(() => {
    if (!room.game || room.game.turnStage !== 'respond' || !room.game.betState) return;
    const player = room.players[botIndex];
    if (!player?.isBot) return;
    const context = buildBotContext(room, botIndex);
    const action = respondBet(room.game.betState.level, context);
    room.game.respondBet(botIndex, action);
    checkBotTurn(room, io);
  }, 1000 + Math.random() * 2000);
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(player => player.id === socketId)) return room;
  }
  return null;
}

module.exports = {
  handleSocket,
  rooms,
  findRoomByUid
};
