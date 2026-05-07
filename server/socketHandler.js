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
    // Enviar lista inicial ao conectar
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
        botTimer: null,
        countdownInterval: null,
        code,
        status: 'waiting'
      };
      rooms.set(code, room);
      socket.join(code);
      callback({ roomCode: code, players: room.players.map(p => ({name:p.name, isBot:false})) });
      broadcastRooms(io);

      // Iniciar contagem regressiva de 10 segundos
      let count = 10;
      // Enviar primeiro valor
      io.to(code).emit('lobbyCountdown', { count });
      room.countdownInterval = setInterval(() => {
        count--;
        io.to(code).emit('lobbyCountdown', { count });
        if (count <= 0) {
          clearInterval(room.countdownInterval);
          // Preencher com bots e iniciar jogo
          fillWithBotsAndStart(code, io);
        }
      }, 1000);

      // Se a sala encher antes, parar contagem e iniciar imediatamente
      room.botTimer = null; // não usamos mais o timer antigo, mas mantemos referência
    });

    socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
      const room = rooms.get(roomCode);
      if (!room) return callback({ error: 'Sala não encontrada' });
      if (room.players.length >= 4) return callback({ error: 'Sala cheia' });
      room.players.push({ id: socket.id, name: playerName, isBot: false });
      socket.join(roomCode);
      callback({ roomCode, players: room.players.map(p => ({ name: p.name, isBot: p.isBot })) });
      broadcastRooms(io);

      // Se encheu, parar contagem e iniciar
      if (room.players.length === 4) {
        if (room.countdownInterval) {
          clearInterval(room.countdownInterval);
          room.countdownInterval = null;
        }
        fillWithBotsAndStart(roomCode, io);
      }
    });

    socket.on('playCard', (card) => {
      // ... (mesmo código anterior)
    });

    socket.on('callBet', (betType) => {
      // ... (mesmo código anterior)
    });

    socket.on('respondBet', (action) => {
      // ... (mesmo código anterior)
    });

    socket.on('fleeHand', () => {
      // ... (mesmo código anterior)
    });

    socket.on('disconnect', () => {
      // Remover jogador da sala, se ficar vazia remover sala
      for (const [code, room] of rooms) {
        const idx = room.players.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          if (room.players.length === 0) {
            if (room.countdownInterval) clearInterval(room.countdownInterval);
            rooms.delete(code);
            broadcastRooms(io);
          } else {
            // Se estava esperando, atualizar lista
            broadcastRooms(io);
            // Se o jogo já começou, pode continuar? Vamos simplificar: se o jogo está ativo, continua (bots ou jogadores restantes).
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
  broadcastRooms(io); // remover da lista de espera
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
  room.game = new Game4P(room.code, room.players, emit);
  room.game.checkBotTurn = () => checkBotTurn(room, io);
  room.game.startGame();
  checkBotTurn(room, io);
}

// Funções checkBotTurn e checkBotResponse permanecem idênticas
function checkBotTurn(room, io) {
  // ... (mesmo código)
}
function checkBotResponse(room, io) {
  // ... (mesmo código)
}

// Precisamos modificar gameOver para remover a sala
// Vamos estender o Game4P ou alterar no socketHandler após o gameOver.
// Na função startGame, podemos sobrescrever o comportamento de 'gameOver' adicionando um listener.
// Melhor: modificar a classe Game4P para aceitar um callback 'onGameOver'. Mas para simplificar,
// vamos ouvir o evento 'gameOver' no socketHandler e então remover a sala.

// Adicione dentro de handleSocket, no escopo adequado:
function setupGameOverRemoval(code, io) {
  // Quando o jogo emitir 'gameOver', removemos a sala.
  // Isso é feito na classe Game4P, ela emite 'gameOver' para 'all'. Podemos interceptar.
  // Vamos adicionar um listener único no namespace da sala.
  const room = rooms.get(code);
  if (!room) return;
  // Usar um event listener no game
  // Mas o game emite internamente; podemos usar o próprio socket.io: ao invés de emitir para todos,
  // podemos fazer o servidor escutar o evento. Contudo, o servidor não escuta eventos de socket.io a não ser que os assine.
  // Solução: na classe Game4P, adicionamos um callback opcional 'onGameOver'. Vamos modificar game.js para isso.
  // Como forneci o game.js anterior, podemos alterar lá: adicionar this.onGameOver callback.
}

// Atualização do game.js (server) para suportar onGameOver:
// Adicione na classe Game4P um parâmetro onGameOver no construtor e chame quando terminar.

module.exports = { handleSocket };