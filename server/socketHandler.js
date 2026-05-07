const { Game4P } = require('./game');
const { createBot, shouldCallBet, respondBet, chooseCard } = require('./bot');

const rooms = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function handleSocket(io) {
  io.on('connection', (socket) => {
    console.log('Conectado:', socket.id);

    socket.on('createRoom', (playerName, callback) => {
      let code = generateRoomCode();
      while (rooms.has(code)) code = generateRoomCode();
      const room = {
        players: [{ id: socket.id, name: playerName, isBot: false }],
        game: null,
        botTimer: null,
        code
      };
      rooms.set(code, room);
      socket.join(code);
      callback({ roomCode: code, players: room.players.map(p => ({name:p.name, isBot:false})) });

      // Iniciar timer para preencher com bots
      room.botTimer = setTimeout(() => fillWithBots(code, io), 10000);
    });

    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
      const room = rooms.get(roomCode);
      if (!room) return callback({ error: 'Sala não encontrada' });
      if (room.players.length >= 4) return callback({ error: 'Sala cheia' });
      room.players.push({ id: socket.id, name: playerName, isBot: false });
      socket.join(roomCode);

      // Se completou 4 humanos, cancela timer e inicia jogo
      if (room.players.length === 4 && room.players.every(p => !p.isBot)) {
        clearTimeout(room.botTimer);
        startGame(room, io);
      } else {
        io.to(roomCode).emit('waiting', room.players.map(p => ({ name: p.name, isBot: p.isBot })));
      }
      callback({ roomCode, players: room.players.map(p => ({ name: p.name, isBot: p.isBot })) });
    });

    socket.on('playCard', (card) => {
      const room = findRoomBySocket(socket.id);
      if (!room || !room.game) return;
      const player = room.players.find(p => p.id === socket.id);
      const playerIndex = room.players.indexOf(player);
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

    socket.on('disconnect', () => {
      // ... mesma lógica de antes
      const room = findRoomBySocket(socket.id);
      if (room) {
        io.to(room.code).emit('playerLeft', { message: 'Um jogador saiu.' });
        rooms.delete(room.code);
      }
    });
  });
}

function fillWithBots(code, io) {
  const room = rooms.get(code);
  if (!room) return;
  const needed = 4 - room.players.length;
  for (let i = 0; i < needed; i++) {
    const bot = createBot(room.players.length);
    room.players.push(bot);
  }
  io.to(code).emit('waiting', room.players.map(p => ({ name: p.name, isBot: p.isBot })));
  startGame(room, io);
}

function startGame(room, io) {
  const emit = (event, data, target) => {
    if (target === 'all') {
      io.to(room.code).emit(event, data);
    } else {
      // target é o id do socket (humano) ou bot? Bots não têm socket, são ignorados
      if (!room.players.find(p => p.id === target)?.isBot) {
        io.to(target).emit(event, data);
      }
    }
  };
  room.game = new Game4P(room.code, room.players, emit);
  room.game.startGame();
  // Se o primeiro jogador for bot, agenda jogada
  checkBotTurn(room, io);
}

function checkBotTurn(room, io) {
  if (!room.game) return;
  if (room.game.turnStage === 'play') {
    const cp = room.game.currentPlayer;
    const player = room.players[cp];
    if (player.isBot) {
      // Pequeno atraso para simular pensamento
      setTimeout(() => {
        if (room.game && room.game.currentPlayer === cp) {
          const hand = room.game.hands[cp];
          const card = chooseCard(hand, room.game.vira.rank, room.game.roundCards, room.game.currentRound, cp);
          room.game.playCard(cp, card);
          checkBotTurn(room, io);
        }
      }, 1000 + Math.random() * 2000);
    }
  }
  // Verifica se o bot deve pedir truco
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
  // Se o time que deve responder tem bots, escolhe um deles para responder
  const respTeam = room.game.betState.responderTeam;
  const teamPlayers = [respTeam, respTeam+2]; // índices 0,2 ou 1,3
  const botPlayer = teamPlayers.map(i => room.players[i]).find(p => p.isBot);
  if (botPlayer) {
    const playerIndex = room.players.indexOf(botPlayer);
    const hand = room.game.hands[playerIndex];
    const action = respondBet(hand, room.game.vira.rank, room.game.betState.level);
    setTimeout(() => {
      if (room.game && room.game.betState && room.game.respondBet(playerIndex, action)) {
        checkBotTurn(room, io);
      }
    }, 2000 + Math.random() * 2000);
  }
}

function findRoomBySocket(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.some(p => p.id === socketId)) return { code, ...room };
  }
  return null;
}

module.exports = { handleSocket };