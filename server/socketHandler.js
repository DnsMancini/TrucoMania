const core = require('./socketHandler-core');

function hiddenHand(hand) {
  return Array.from({ length: Array.isArray(hand) ? hand.length : 0 }, () => ({ hidden: true }));
}

function hiddenRoundCards(roundCards) {
  if (!Array.isArray(roundCards)) return [];
  return roundCards.map(round => Array.isArray(round)
    ? round.map(card => card ? { hidden: true } : null)
    : round
  );
}

function buildGameState(room, playerIndex = null) {
  const game = room.game;
  const vira = game.maoDeFerro && game.currentRound === 0
    ? { hidden: true }
    : game.vira;

  return {
    roomCode: room.code,
    player: playerIndex,
    hand: playerIndex === null
      ? []
      : (game.maoDeFerro ? hiddenHand(game.hands[playerIndex]) : (game.hands[playerIndex] || [])),
    handsRemaining: game.hands.map(hand => hand.length),
    vira,
    currentPlayer: game.currentPlayer,
    dealer: game.dealerIndex,
    handValue: game.handValue,
    scores: game.scores,
    setWins: game.setWins,
    maoDe11: game.maoDe11,
    maoDe11Team: game.maoDe11Team,
    maoDe11DecisionMade: game.maoDe11DecisionMade,
    maoDeFerro: game.maoDeFerro,
    currentRound: game.currentRound,
    roundCards: game.maoDeFerro ? hiddenRoundCards(game.roundCards) : game.roundCards,
    playersInRound: game.playersInRound,
    roundStarter: game.roundStarter,
    turnStage: game.turnStage,
    betState: game.betState,
    players: room.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online }))
  };
}

function handleSocket(io) {
  const originalTo = io.to.bind(io);

  io.to = function patchedTo(target) {
    const operator = originalTo(target);
    const originalEmit = operator.emit.bind(operator);

    operator.emit = function patchedEmit(event, data, ...args) {
      let safeData = data;
      const room = typeof target === 'string' && target.length === 4
        ? core.rooms.get(target)
        : null;

      if (event === 'handStart' && data?.maoDeFerro) {
        safeData = {
          ...data,
          hand: hiddenHand(data.hand),
          vira: { hidden: true }
        };
      }

      const result = originalEmit(event, safeData, ...args);

      if (event === 'roundResult' && room?.game?.maoDeFerro && data?.round === 0) {
        setImmediate(() => {
          if (!core.rooms.has(room.code) || !room.game || !room.game.maoDeFerro) return;
          for (let playerIndex = 0; playerIndex < room.players.length; playerIndex++) {
            const player = room.players[playerIndex];
            if (!player || player.isBot || !player.id) continue;
            originalTo(player.id).emit('gameStateRestore', buildGameState(room, playerIndex));
          }
        });
      }

      return result;
    };

    return operator;
  };

  io.on('connection', (socket) => {
    const originalSocketEmit = socket.emit.bind(socket);
    socket.emit = function patchedSocketEmit(event, data, ...args) {
      let safeData = data;
      if (event === 'gameStateRestore' && data?.maoDeFerro && data.currentRound === 0) {
        safeData = { ...data, vira: { hidden: true } };
      }
      return originalSocketEmit(event, safeData, ...args);
    };

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
