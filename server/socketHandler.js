const crypto = require('crypto');
const { Game4P } = require('./game');
const { createBot, shouldCallBet, respondBet, chooseCard } = require('./bot');
const { admin, db } = require('./firebaseAdmin');

const rooms = new Map();
const MAX_ROOMS = 8;
const OFFLINE_TIMEOUT = 90000; // 90 segundos
const BOT_WAIT_SECONDS = 15;
const RATE_LIMITS = {
  authenticate: { windowMs: 10000, max: 5 },
  createRoom: { windowMs: 10000, max: 5 },
  joinRoom: { windowMs: 10000, max: 10 },
  randomMatch: { windowMs: 10000, max: 10 },
  playCard: { windowMs: 1000, max: 5 },
  callBet: { windowMs: 1000, max: 5 },
  respondBet: { windowMs: 1000, max: 5 },
  respondMaoDe11: { windowMs: 1000, max: 5 },
  fleeHand: { windowMs: 1000, max: 5 }
};

function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').substring(0, 4).toUpperCase();
}

function normalizePlayerName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 20) return null;
  return name;
}

function normalizeRoomCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return null;
  return code;
}

function normalizeRoomOptions(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.visibility !== undefined && value.visibility !== 'private' && value.visibility !== 'public') return null;
  if (value.fillWithBots !== undefined && typeof value.fillWithBots !== 'boolean') return null;
  return { visibility: value.visibility, fillWithBots: value.fillWithBots };
}

function isRateLimited(socket, eventName) {
  const limit = RATE_LIMITS[eventName];
  if (!limit) return false;
  if (!socket.rateLimits) socket.rateLimits = new Map();
  const now = Date.now();
  const state = socket.rateLimits.get(eventName);
  if (!state || now - state.startedAt >= limit.windowMs) {
    socket.rateLimits.set(eventName, { startedAt: now, count: 1 });
    return false;
  }
  state.count++;
  return state.count > limit.max;
}

function requireRateLimit(socket, eventName, callback) {
  if (!isRateLimited(socket, eventName)) return true;
  const message = 'Muitas solicitações. Aguarde um momento e tente novamente.';
  if (typeof callback === 'function') callback({ error: message });
  else socket.emit('gameError', { message });
  return false;
}

async function authenticateSocket(socket, token) {
  if (typeof socket.banUnsubscribe === 'function') {
    socket.banUnsubscribe();
    socket.banUnsubscribe = null;
  }
  const decodedToken = await admin.auth().verifyIdToken(token);
  const playerDoc = await db.collection('players').doc(decodedToken.uid).get();
  const playerData = playerDoc.exists ? playerDoc.data() : null;
  if (playerData?.banned === true) {
    const error = new Error('Conta banida');
    error.code = 'account-banned';
    throw error;
  }
  socket.user = { uid: decodedToken.uid, email: decodedToken.email || null, name: decodedToken.name || null, banned: false };
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
    error => console.error('[socket-auth] Erro ao monitorar banimento:', error.message)
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
    socket.emit('betCalled', { challenger: room.game.betState.challenger, level: room.game.betState.level, responderTeam });
    if (playerIndex % 2 === responderTeam) socket.emit('turnToRespond', { responderTeam });
  } else if (room.game.turnStage === 'mao11Decision' && room.game.maoDe11 && playerIndex % 2 === room.game.maoDe11Team && !room.game.maoDe11DecisionMade) {
    socket.emit('maoDe11Decision', { team: room.game.maoDe11Team });
  }
}

function handleSocket(io) {
  io.on('connection', (socket) => {
    broadcastRooms(io);

    socket.on('authenticate', async (token, callback) => {
      if (!requireRateLimit(socket, 'authenticate', callback)) return;
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
        console.error('[socket-auth] Token Firebase inválido:', error.message);
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
      const offlineTimer = room.offlineTimers.get(socket.id);
      if (offlineTimer) { clearTimeout(offlineTimer); room.offlineTimers.delete(socket.id); }
      if (room.status === 'waiting') {
        room.players.splice(playerIndex, 1);
        if (room.countdownInterval && room.players.length === 0) { clearInterval(room.countdownInterval); room.countdownInterval = null; rooms.delete(room.code); }
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
      if (!requireRateLimit(socket, 'randomMatch', callback)) return;
      if (!requireAuth(socket, callback)) return;
      const normalizedName = normalizePlayerName(playerName);
      if (!normalizedName) return callback?.({ error: 'Nome inválido. Use de 1 a 20 caracteres.' });
      if (findRoomByUid(socket.user.uid)) return callback?.({ error: 'Você já está em uma partida.' });
      const candidatesPlaying = [];
      const candidatesWaiting = [];
      for (const room of rooms.values()) {
        if (room.isPublic === false) continue;
        if (room.players.some(player => player.uid === socket.user.uid && !player.isBot)) continue;
        if (room.pendingJoin?.some(join => join.uid === socket.user.uid)) continue;
        if (room.status === 'playing') {
          const hasBot = room.players.some(player => player.isBot);
          const thirdSet = room.game && room.game.setWins[0] === 1 && room.game.setWins[1] === 1;
          if (hasBot && !thirdSet) candidatesPlaying.push(room);
        } else if (room.status === 'waiting' && room.players.length < 4) candidatesWaiting.push(room);
      }
      if (candidatesPlaying.length > 0) {
        const room = candidatesPlaying[Math.floor(Math.random() * candidatesPlaying.length)];
        room.pendingJoin.push({ socket, playerName: normalizedName, uid: socket.user.uid });
        socket.join(room.code);
        return callback?.({ roomCode: room.code, waiting: true, mode: 'bot-replacement' });
      }
      if (candidatesWaiting.length > 0) {
        const room = candidatesWaiting[Math.floor(Math.random() * candidatesWaiting.length)];
        room.players.push({ id: socket.id, uid: socket.user.uid, name: normalizedName, isBot: false, online: true, pendingReplace: false });
        socket.join(room.code);
        callback?.({ roomCode: room.code, players: room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online })), mode: 'waiting-room' });
        broadcastRooms(io);
        if (room.players.length === 4) {
          if (room.countdownInterval) { clearInterval(room.countdownInterval); room.countdownInterval = null; }
          fillWithBotsAndStart(room.code, io);
        }
        return;
      }
      callback?.({ createNew: true, message: 'Nenhuma partida pública disponível. Criando uma nova mesa.' });
    });

    socket.on('createRoom', (playerName, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      if (!requireRateLimit(socket, 'createRoom', callback)) return;
      const normalizedName = normalizePlayerName(playerName);
      if (!normalizedName) return callback?.({ error: 'Nome inválido. Use de 1 a 20 caracteres.' });
      const options = normalizeRoomOptions(typeof optionsOrCallback === 'function' ? null : optionsOrCallback);
      if (options === null) return callback?.({ error: 'Opções da sala inválidas.' });
      if (!requireAuth(socket, callback)) return;
      if (findRoomByUid(socket.user.uid)) return callback?.({ error: 'Você já está em uma partida.' });
      if (rooms.size >= MAX_ROOMS) return callback?.({ error: 'Máximo de salas atingido.' });
      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();
      const room = {
        players: [{ id: socket.id, uid: socket.user.uid, name: normalizedName, isBot: false, online: true, pendingReplace: false }],
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
      callback?.({ roomCode: code, isPublic: room.isPublic, fillWithBots: room.fillWithBots, players: room.players.map(p => ({ name: p.name, isBot: false, online: true })) });
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

    socket.on('joinRoom', (payload, callback) => {
      if (!requireRateLimit(socket, 'joinRoom', callback)) return;
      if (!requireAuth(socket, callback)) return;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return callback?.({ error: 'Dados da sala inválidos.' });
      const roomCode = normalizeRoomCode(payload.roomCode);
      const playerName = normalizePlayerName(payload.playerName);
      if (!roomCode) return callback?.({ error: 'Código da sala inválido.' });
      if (!playerName) return callback?.({ error: 'Nome inválido. Use de 1 a 20 caracteres.' });
      if (findRoomByUid(socket.user.uid)) return callback?.({ error: 'Você já está em uma partida.' });
      const room = rooms.get(roomCode);
      if (!room) return callback?.({ error: 'Sala não encontrada' });
      if (room.pendingJoin?.some(join => join.uid === socket.user.uid)) return callback?.({ error: 'Você já solicitou entrada nesta partida.' });
      if (room.status === 'waiting' && room.players.length >= 4) return callback?.({ error: 'Sala cheia' });
      if (room.status === 'playing') {
        if (room.game && room.game.setWins[0] === 1 && room.game.setWins[1] === 1) return callback?.({ error: 'Partida no terceiro set, entrada não permitida.' });
        room.pendingJoin.push({ socket, playerName, uid: socket.user.uid });
        socket.join(roomCode);
        callback?.({ roomCode, waiting: true });
        return;
      }
      room.players.push({ id: socket.id, uid: socket.user.uid, name: playerName, isBot: false, online: true, pendingReplace: false });
      socket.join(roomCode);
      callback?.({ roomCode, players: room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online })) });
      broadcastRooms(io);
      if (room.players.length === 4) {
        if (room.countdownInterval) { clearInterval(room.countdownInterval); room.countdownInterval = null; }
        fillWithBotsAndStart(roomCode, io);
      }
    });

    socket.on('playCard', (card) => {
      if (!requireRateLimit(socket, 'playCard')) return;
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      updateActivity(room, socket.id, io);
      room.game.playCard(playerIndex, card);
      checkBotTurn(room, io);
    });

    socket.on('callBet', (betType) => {
      if (!requireRateLimit(socket, 'callBet')) return;
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      updateActivity(room, socket.id, io);
      room.game.callBet(playerIndex, betType);
      checkBotResponse(room, io);
    });

    socket.on('respondBet', (action) => {
      if (!requireRateLimit(socket, 'respondBet')) return;
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      updateActivity(room, socket.id, io);
      room.game.respondBet(playerIndex, action);
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    });

    socket.on('respondMaoDe11', (action) => {
      if (!requireRateLimit(socket, 'respondMaoDe11')) return;
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      updateActivity(room, socket.id, io);
      const handled = room.game.respondMaoDe11(playerIndex, action);
      if (handled) {
        checkBotTurn(room, io);
        checkBotResponse(room, io);
      }
    });

    socket.on('fleeHand', () => {
      if (!requireRateLimit(socket, 'fleeHand')) return;
      if (!requireAuth(socket)) return;
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      updateActivity(room, socket.id, io);
      room.game.fleeHand(playerIndex);
    });

    socket.on('disconnect', () => {
      if (socket.banUnsubscribe) {
        socket.banUnsubscribe();
        socket.banUnsubscribe = null;
      }
      if (socket.rateLimits) socket.rateLimits.clear();
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
    if (!socket || !socket.connected || !uid || findRoomByUid(uid)) continue;
    room.players[botIndex] = { id: socket.id, uid, name: playerName, isBot: false, online: true, pendingReplace: false };
    socket.join(room.code);
    sendCurrentGameState(room, socket, botIndex);
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
    playerName: player.name,
    hand: game.hands[playerIndex] || [],
    vira: game.vira,
    currentRound: game.currentRound,
    roundCards: game.roundCards,
    roundWins: game.roundWins,
    handValue: game.handValue,
    scores: game.scores,
    setWins: game.setWins,
    maoDe11: game.maoDe11,
    maoDe11Team: game.maoDe11Team,
    maoDe11DecisionMade: game.maoDe11DecisionMade,
    turnStage: game.turnStage,
    betState: game.betState,
    style: player.style,
    players: room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online }))
  };
}

function checkBotTurn(room, io) {
  if (!room || !room.game) return;
  const game = room.game;
  if (game.turnStage !== 'play') return;
  const playerIndex = game.currentPlayer;
  const player = room.players[playerIndex];
  if (!player?.isBot) return;
  setTimeout(() => {
    if (!room.game || room.status !== 'playing') return;
    if (room.game.turnStage !== 'play' || room.game.currentPlayer !== playerIndex) return;
    const context = buildBotContext(room, playerIndex);
    const viraRank = context.vira?.rank;
    const bet = shouldCallBet(context.hand, viraRank, context.handValue, context.maoDe11, context);
    if (bet) {
      if (room.game.callBet(playerIndex, bet)) {
        checkBotResponse(room, io);
        return;
      }
    }
    const card = chooseCard(context.hand, viraRank, context);
    if (!card) return;
    room.game.playCard(playerIndex, card);
    checkBotResponse(room, io);
    checkBotTurn(room, io);
  }, 700);
}

function checkBotResponse(room, io) {
  if (!room || !room.game || room.game.turnStage !== 'respond' || !room.game.betState) return;
  const responderTeam = room.game.betState.responderTeam;
  const responderIndex = room.players.findIndex(p => p.isBot && p.team === responderTeam);
  if (responderIndex === -1) return;
  setTimeout(() => {
    if (!room.game || room.status !== 'playing') return;
    if (room.game.turnStage !== 'respond' || room.game.betState?.responderTeam !== responderTeam) return;
    const context = buildBotContext(room, responderIndex);
    const viraRank = context.vira?.rank;
    const action = respondBet(context.hand, viraRank, context.betState.level, context);
    room.game.respondBet(responderIndex, action);
    checkBotTurn(room, io);
    checkBotResponse(room, io);
  }, 700);
}

module.exports = { handleSocket };