const socket = io(window.location.origin);

// Telas
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

// Lobby elements
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

// Game elements
const oppNameEl = document.getElementById('oppName');
const oppScoreEl = document.getElementById('oppScore');
const playerNameEl = document.getElementById('playerName');
const playerScoreEl = document.getElementById('playerScore');
const roomCodeEl = document.getElementById('roomCodeDisplay');
const viraCardEl = document.getElementById('viraCard');
const oppHandDiv = document.getElementById('oppHand');
const tableArea = document.getElementById('tableArea');
const playerHandDiv = document.getElementById('playerHand');
const actionsArea = document.getElementById('actionsArea');
const betActions = document.getElementById('betActions');
const messageArea = document.getElementById('messageArea');

let myPlayerIndex = null;
let playerHand = [];
let currentTurn = null;
let gameActive = false;
let roomCode = '';

createBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Jogador';
  socket.emit('createRoom', name, (res) => {
    if (res.error) return alert(res.error);
    enterRoom(res.roomCode, res.players);
  });
};

joinBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Jogador';
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return;
  socket.emit('joinRoom', { roomCode: code, playerName: name }, (res) => {
    if (res.error) return alert(res.error);
    enterRoom(res.roomCode, res.players);
  });
};

function enterRoom(code, players) {
  roomCode = code;
  lobbyDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  roomCodeEl.textContent = code;
  // Identifica qual jogador você é
  const me = players.find(p => p.id === socket.id);
  const opp = players.find(p => p.id !== socket.id);
  myPlayerIndex = players.indexOf(me);
  playerNameEl.textContent = me.name;
  if (opp) oppNameEl.textContent = opp.name;
}

// Atualiza interface quando recebe mão
socket.on('handStart', (data) => {
  playerHand = data.hand;
  renderHand(playerHand);
  oppHandDiv.innerHTML = '<p>Cartas do oponente: 🂠 🂠 🂠</p>';
  viraCardEl.textContent = `${data.vira.rank}${suitSymbol(data.vira.suit)}`;
  playerScoreEl.textContent = data.scores[0];
  oppScoreEl.textContent = data.scores[1];
  gameActive = true;
  clearTable();
  messageArea.textContent = '';
  betActions.innerHTML = '';
  updateTurn(data.currentPlayer);
});

socket.on('turn', ({ currentPlayer }) => {
  updateTurn(currentPlayer);
});

socket.on('cardPlayed', ({ player, card }) => {
  showPlayedCard(player, card);
});

socket.on('roundResult', ({ winner }) => {
  // Aguardar próximo evento
});

socket.on('handEnd', ({ winner, scores }) => {
  gameActive = false;
  playerScoreEl.textContent = scores[0];
  oppScoreEl.textContent = scores[1];
  messageArea.textContent = winner === myPlayerIndex ? 'Você ganhou a mão!' : 'Oponente ganhou a mão!';
  playerHandDiv.innerHTML = '';
  oppHandDiv.innerHTML = '';
});

socket.on('gameOver', ({ winner, scores }) => {
  gameActive = false;
  alert(winner === myPlayerIndex ? 'Você venceu o jogo!' : 'Oponente venceu o jogo!');
  location.reload();
});

socket.on('betCalled', ({ challenger, level }) => {
  messageArea.textContent = `${challenger === myPlayerIndex ? 'Você' : 'Oponente'} pediu ${level.toUpperCase()}!`;
  // Se for sua vez de responder, mostra botões
  if (challenger !== myPlayerIndex) {
    showBetActions(level);
  } else {
    betActions.innerHTML = '';
  }
});

socket.on('betAccepted', ({ handValue }) => {
  messageArea.textContent = `Aposta aceita! Mão vale ${handValue} pontos.`;
  betActions.innerHTML = '';
});

socket.on('turnToRespond', ({ responder }) => {
  if (responder === myPlayerIndex) {
    // O estado betState já contém o nível
  }
});

socket.on('playerLeft', () => {
  alert('Oponente saiu do jogo.');
  location.reload();
});

function updateTurn(currentPlayer) {
  currentTurn = currentPlayer;
  actionsArea.innerHTML = '';
  betActions.innerHTML = '';
  if (!gameActive) return;
  if (currentPlayer === myPlayerIndex) {
    if (playerHand.length > 0) {
      actionsArea.innerHTML = '<button id="playCardBtn">Jogar Carta</button>';
      document.getElementById('playCardBtn').onclick = () => {
        // O jogador deve clicar na carta, depois confirmar
        highlightCardsForPlay();
      };
    }
  } else {
    actionsArea.innerHTML = '<p>Aguardando oponente...</p>';
  }
}

function highlightCardsForPlay() {
  const cards = document.querySelectorAll('.player-hand .card');
  cards.forEach(card => {
    card.onclick = () => {
      const index = parseInt(card.dataset.index);
      const selected = playerHand[index];
      if (!selected) return;
      // Enviar jogada
      socket.emit('playCard', selected);
      // Remover da mão visualmente
      playerHand.splice(index, 1);
      renderHand(playerHand);
      actionsArea.innerHTML = '';
    };
    card.classList.add('selectable');
  });
}

function showBetActions(level) {
  betActions.innerHTML = `
    <button id="acceptBtn">Aceitar</button>
    <button id="fleeBtn">Correr</button>
    ${level === 'truco' ? '<button id="retrucoBtn">Retruco</button>' : ''}
    ${level === 'retruco' ? '<button id="valequatroBtn">Vale Quatro</button>' : ''}
  `;
  document.getElementById('acceptBtn').onclick = () => socket.emit('respondBet', 'accept');
  document.getElementById('fleeBtn').onclick = () => socket.emit('respondBet', 'flee');
  if (document.getElementById('retrucoBtn'))
    document.getElementById('retrucoBtn').onclick = () => socket.emit('respondBet', 'retruco');
  if (document.getElementById('valequatroBtn'))
    document.getElementById('valequatroBtn').onclick = () => socket.emit('respondBet', 'valequatro');
}

function renderHand(hand) {
  playerHandDiv.innerHTML = hand.map((card, idx) =>
    `<div class="card" data-index="${idx}">${card.rank}${suitSymbol(card.suit)}</div>`
  ).join('');
}

function showPlayedCard(player, card) {
  const div = document.createElement('div');
  div.className = 'card played';
  div.textContent = `${card.rank}${suitSymbol(card.suit)}`;
  div.setAttribute('data-player', player);
  tableArea.appendChild(div);
  setTimeout(() => {
    if (tableArea.children.length >= 2) clearTable();
  }, 2000);
}

function clearTable() {
  tableArea.innerHTML = '';
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}
