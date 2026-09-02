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

function broadcastRooms(io) {
  const publicRooms = Array.from(rooms.values())
    .filter(room => room.visibility !== 'private' && room.status === 'waiting')
    .map(room => ({
      code: room.code,
      players: room.players.map(player => ({
        name: player.name,
        isBot: player.isBot,
        online: player.online
      })),
      playerCount: room.players.length,
      maxPlayers: 4,
      status: room.status
    }));
  io.emit('roomsList', publicRooms);
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
        return;
      }
      callback?.({ ok: true });
    });

    socket.on('createRoom', (payload = {}, callback) => {
      if (!requireRateLimit(socket, 'createRoom', callback) || !requireAuth(socket, callback)) return;
      const playerName = normalizePlayerName(payload.playerName);
      const options = normalizeRoomOptions(payload.options);
      if (!playerName || !options) return callback?.({ error: 'Dados da sala inválidos.' });
      if (findRoomByUid(socket.user.uid)) return callback?.({ error: 'Você já está em uma partida.' });
      if (rooms.size >= MAX_ROOMS) return callback?.({ error: 'Limite de salas atingido.' });
      let code;
      do { code = generateRoomCode(); } while (rooms.has(code));
      const room = {
        code,
        status: 'waiting',
        visibility: options.visibility || 'public',
        players: [{ id: socket.id, uid: socket.user.uid, name: playerName, isBot: false, online: true, pendingReplace: false }],
        game: null,
        offlineTimers: new Map(),
        pendingJoins: new Map(),
        countdownInterval: null
      };
      rooms.set(code, room);
      socket.join(code);
      callback?.({ ok: true, roomCode: code });
      emitPlayerStatus(room, io);
      broadcastRooms(io);
      if (options.fillWithBots === true) scheduleBotFill(room, io);
    });

    socket.on('joinRoom', (payload = {}, callback) => {
      if (!requireRateLimit(socket, 'joinRoom', callback) || !requireAuth(socket, callback)) return;
      const playerName = normalizePlayerName(payload.playerName);
      const code = normalizeRoomCode(payload.roomCode);
      if (!playerName || !code) return callback?.({ error: 'Dados de entrada inválidos.' });
      if (findRoomByUid(socket.user.uid)) return callback?.({ error: 'Você já está em uma partida.' });
      const room = rooms.get(code);
      if (!room || room.status !== 'waiting') return callback?.({ error: 'Sala não encontrada ou partida já iniciada.' });
      if (room.players.length >= 4) return callback?.({ error: 'Sala cheia.' });
      if (room.pendingJoins.has(socket.user.uid)) return callback?.({ error: 'Entrada já solicitada.' });
      const player = { id: socket.id, uid: socket.user.uid, name: playerName, isBot: false, online: true, pendingReplace: false };
      room.pendingJoins.set(socket.user.uid, { socket, player });
      callback?.({ ok: true, pending: true });
      processPendingJoins(room, io);
    });

    socket.on('randomMatch', (payload = {}, callback) => {
      if (!requireRateLimit(socket, 'randomMatch', callback) || !requireAuth(socket, callback)) return;
      const playerName = normalizePlayerName(payload.playerName);
      if (!playerName) return callback?.({ error: 'Nome inválido.' });
      if (findRoomByUid(socket.user.uid)) return callback?.({ error: 'Você já está em uma partida.' });
      const candidates = Array.from(rooms.values()).filter(room => room.visibility !== 'private' && room.status === 'waiting' && room.players.length < 4);
      if (!candidates.length) return callback?.({ error: 'Nenhuma sala disponível.' });
      const room = candidates[Math.floor(Math.random() * candidates.length)];
      room.pendingJoins.set(socket.user.uid, { socket, player: { id: socket.id, uid: socket.user.uid, name: playerName, isBot: false, online: true, pendingReplace: false } });
      callback?.({ ok: true, pending: true });
      processPendingJoins(room, io);
    });

    socket.on('playCard', (card, callback) => {
      if (!requireRateLimit(socket, 'playCard', callback) || !requireAuth(socket, callback)) return;
      const room = findRoomBySocket(socket.id);
      if (!room?.game) return callback?.({ error: 'Partida não encontrada.' });
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex < 0 || room.players[playerIndex].isBot) return callback?.({ error: 'Jogador inválido.' });
      if (!card || typeof card !== 'object' || !['ouros','espadas','copas','paus'].includes(card.suit) || !['4','5','6','7','Q','J','K','A','2','3'].includes(card.rank)) return callback?.({ error: 'Carta inválida.' });
      try { room.game.playCard(playerIndex, card); callback?.({ ok: true }); } catch (error) { callback?.({ error: error.message }); }
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    });

    socket.on('callBet', (type, callback) => {
      if (!requireRateLimit(socket, 'callBet', callback) || !requireAuth(socket, callback)) return;
      const room = findRoomBySocket(socket.id);
      if (!room?.game) return callback?.({ error: 'Partida não encontrada.' });
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex < 0 || room.players[playerIndex].isBot || !['truco','retruco','valenove','valedoze'].includes(type)) return callback?.({ error: 'Aposta inválida.' });
      try { room.game.callBet(playerIndex, type); callback?.({ ok: true }); } catch (error) { callback?.({ error: error.message }); }
      checkBotResponse(room, io);
    });

    socket.on('respondBet', (response, callback) => {
      if (!requireRateLimit(socket, 'respondBet', callback) || !requireAuth(socket, callback)) return;
      const room = findRoomBySocket(socket.id);
      if (!room?.game) return callback?.({ error: 'Partida não encontrada.' });
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex < 0 || room.players[playerIndex].isBot || !['accept','flee','retruco','valenove','valedoze'].includes(response)) return callback?.({ error: 'Resposta inválida.' });
      try { room.game.respondBet(playerIndex, response); callback?.({ ok: true }); } catch (error) { callback?.({ error: error.message }); }
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    });

    socket.on('respondMaoDe11', (response, callback) => {
      if (!requireRateLimit(socket, 'respondMaoDe11', callback) || !requireAuth(socket, callback)) return;
      const room = findRoomBySocket(socket.id);
      if (!room?.game) return callback?.({ error: 'Partida não encontrada.' });
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex < 0 || room.players[playerIndex].isBot || !['play','flee'].includes(response)) return callback?.({ error: 'Resposta inválida.' });
      try { room.game.respondMaoDe11(playerIndex, response); callback?.({ ok: true }); } catch (error) { callback?.({ error: error.message }); }
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    });

    socket.on('fleeHand', (callback) => {
      if (!requireRateLimit(socket, 'fleeHand', callback) || !requireAuth(socket, callback)) return;
      const room = findRoomBySocket(socket.id);
      if (!room?.game) return callback?.({ error: 'Partida não encontrada.' });
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex < 0 || room.players[playerIndex].isBot) return callback?.({ error: 'Jogador inválido.' });
      try { room.game.fleeHand(playerIndex); callback?.({ ok: true }); } catch (error) { callback?.({ error: error.message }); }
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    });

    socket.on('disconnect', () => {
      if (typeof socket.banUnsubscribe === 'function') { socket.banUnsubscribe(); socket.banUnsubscribe = null; }
      socket.rateLimits?.clear();
      const room = findRoomBySocket(socket.id);
      if (!room) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      const player = room.players[playerIndex];
      if (room.pendingJoins?.has(player.uid)) room.pendingJoins.delete(player.uid);
      if (room.status === 'waiting') {
        room.players.splice(playerIndex, 1);
        socket.leave(room.code);
        if (room.players.length === 0) { if (room.countdownInterval) clearInterval(room.countdownInterval); rooms.delete(room.code); }
        emitPlayerStatus(room, io);
        broadcastRooms(io);
        return;
      }
      if (room.status === 'playing') {
        player.online = false;
        player.pendingReplace = true;
        emitPlayerStatus(room, io);
        const timer = setTimeout(() => {
          if (!rooms.has(room.code)) return;
          const current = room.players[playerIndex];
          if (current?.id === socket.id && !current.online && current.pendingReplace) {
            const bot = createBot(playerIndex);
            bot.online = true;
            room.players[playerIndex] = bot;
            current.pendingReplace = false;
            emitPlayerStatus(room, io);
            checkBotResponse(room, io);
            checkBotTurn(room, io);
          }
        }, OFFLINE_TIMEOUT);
        room.offlineTimers.set(socket.id, timer);
        setTimeout(() => { if (!room.players.some(p => !p.isBot && p.online)) { io.to(room.code).emit('matchOver', { reason: 'all_offline' }); rooms.delete(room.code); } }, OFFLINE_TIMEOUT);
      }
    });
  });
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) if (room.players.some(player => player.id === socketId)) return room;
  return null;
}

function emitPlayerStatus(room, io) {
  io.to(room.code).emit('playerStatus', room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online })));
}

function buildBotContext(room, playerIndex) {
  const game = room.game;
  return {
    hand: game.hands[playerIndex] || [],
    vira: game.vira,
    handValue: game.handValue,
    maoDe11: game.maoDe11,
    playerIndex,
    scores: game.scores,
    setWins: game.setWins,
    roundWins: game.roundWins,
    currentRound: game.currentRound,
    roundCards: game.roundCards,
    turnStage: game.turnStage,
    betState: game.betState,
    style: room.players[playerIndex]?.style
  };
}

function chooseBotBet(room, playerIndex) {
  const context = buildBotContext(room, playerIndex);
  const { hand, vira, handValue, maoDe11 } = context;
  if (maoDe11) return null;
  return shouldCallBet(hand, vira.rank, handValue, maoDe11, context);
}

function checkBotTurn(room, io) {
  if (!room.game || room.game.turnStage !== 'play') return;
  const playerIndex = room.game.currentPlayer;
  const player = room.players[playerIndex];
  if (!player?.isBot) return;
  if (room.game.botTurnTimer) return;
  room.game.botTurnTimer = setTimeout(() => {
    room.game.botTurnTimer = null;
    if (!rooms.has(room.code) || room.game.turnStage !== 'play' || room.game.currentPlayer !== playerIndex) return;
    const context = buildBotContext(room, playerIndex);
    const card = chooseCard(context.hand, context.vira.rank, context);
    if (!card) return;
    try { room.game.playCard(playerIndex, card); } catch (error) { console.error('[bot] Erro ao jogar carta:', error.message); }
    checkBotResponse(room, io);
    checkBotTurn(room, io);
  }, 900);
}

function checkBotResponse(room, io) {
  if (!room.game) return;
  if (room.game.turnStage === 'mao11Decision') {
    const team = room.game.maoDe11Team;
    const playerIndex = room.players.findIndex((p, index) => p.isBot && index % 2 === team);
    if (playerIndex !== -1) {
      if (room.game.botDecisionTimer) return;
      room.game.botDecisionTimer = setTimeout(() => {
        room.game.botDecisionTimer = null;
        if (!rooms.has(room.code) || room.game.turnStage !== 'mao11Decision') return;
        try { room.game.respondMaoDe11(playerIndex, 'play'); } catch (error) { console.error('[bot] Erro na decisão da mão de 11:', error.message); }
        checkBotResponse(room, io);
        checkBotTurn(room, io);
      }, 700);
    }
    return;
  }
  if (room.game.turnStage !== 'respond' || !room.game.betState) return;
  const responderTeam = room.game.betState.responderTeam;
  const playerIndex = room.players.findIndex((p, index) => p.isBot && index % 2 === responderTeam);
  if (playerIndex === -1) return;
  if (room.game.botResponseTimer) return;
  room.game.botResponseTimer = setTimeout(() => {
    room.game.botResponseTimer = null;
    if (!rooms.has(room.code) || room.game.turnStage !== 'respond' || !room.game.betState) return;
    const context = buildBotContext(room, playerIndex);
    const response = respondBet(context.hand, context.vira.rank, room.game.betState.level, context);
    try { room.game.respondBet(playerIndex, response); } catch (error) { console.error('[bot] Erro ao responder aposta:', error.message); }
    checkBotResponse(room, io);
    checkBotTurn(room, io);
  }, 700);
}

function processPendingJoins(room, io) {
  if (!rooms.has(room.code) || room.status !== 'waiting') return;
  for (const [uid, pending] of room.pendingJoins) {
    if (!pending?.socket?.connected || !pending.socket.user || pending.socket.user.uid !== uid) {
      room.pendingJoins.delete(uid);
      continue;
    }
    if (room.players.length >= 4) break;
    if (room.players.some(player => player.uid === uid && !player.isBot)) {
      room.pendingJoins.delete(uid);
      continue;
    }
    room.players.push(pending.player);
    room.pendingJoins.delete(uid);
    pending.socket.join(room.code);
    pending.socket.emit('roomJoined', { roomCode: room.code, player: room.players.length - 1 });
    emitPlayerStatus(room, io);
    broadcastRooms(io);
    if (room.players.length === 4) startGame(room, io);
  }
}

function scheduleBotFill(room, io) {
  if (room.status !== 'waiting') return;
  const startedAt = Date.now();
  room.botFillTimer = setTimeout(() => {
    if (!rooms.has(room.code) || room.status !== 'waiting') return;
    while (room.players.length < 4) {
      const bot = createBot(room.players.length);
      bot.online = true;
      room.players.push(bot);
    }
    emitPlayerStatus(room, io);
    broadcastRooms(io);
    startGame(room, io);
  }, BOT_WAIT_SECONDS * 1000);
  room.botFillStartedAt = startedAt;
}

function startGame(room, io) {
  if (room.status === 'playing') return;
  if (room.players.length !== 4) return;
  if (room.countdownInterval) { clearInterval(room.countdownInterval); room.countdownInterval = null; }
  if (room.botFillTimer) { clearTimeout(room.botFillTimer); room.botFillTimer = null; }
  room.status = 'playing';
  room.game = new Game4P(room.players, {
    onStateChange: () => {
      io.to(room.code).emit('gameState', room.game.getPublicState());
      checkBotResponse(room, io);
      checkBotTurn(room, io);
    },
    onGameEnd: (result) => {
      io.to(room.code).emit('gameEnd', result);
      updatePlayerStats(room, result).catch(error => console.error('[stats] Erro ao atualizar estatísticas:', error.message));
      rooms.delete(room.code);
      broadcastRooms(io);
    }
  });
  room.game.start();
  emitPlayerStatus(room, io);
  broadcastRooms(io);
}

async function updatePlayerStats(room, result) {
  if (!result?.winner || !Array.isArray(room.players)) return;
  const batch = db.batch();
  for (const player of room.players) {
    if (!player.uid || player.isBot) continue;
    const ref = db.collection('players').doc(player.uid);
    const isWinner = player.team === result.winner;
    batch.set(ref, {
      wins: admin.firestore.FieldValue.increment(isWinner ? 1 : 0),
      losses: admin.firestore.FieldValue.increment(isWinner ? 0 : 1)
    }, { merge: true });
  }
  await batch.commit();
}

module.exports = { handleSocket, rooms };
