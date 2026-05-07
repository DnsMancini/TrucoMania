const socket = io(window.location.origin);

const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

const teamAScoreEl = document.getElementById('teamAScore');
const teamBScoreEl = document.getElementById('teamBScore');
const roomCodeEl = document.getElementById('roomCodeDisplay');
const viraCardEl = document.getElementById('viraCard');
const playerHandDiv = document.getElementById('playerHand');
const tableArea = document.getElementById('tableArea');
const actionsArea = document.getElementById('actionsArea');
const betActions = document.getElementById('betActions');
const messageArea = document.getElementById('messageArea');

const slots = {
  0: document.getElementById('slotP1'),
  1: document.getElementById('slotP2'),
  2: document.getElementById('slotP3'),
  3: document.getElementById('slotP4')
};

let myPlayerIndex = null;
let playerHand = [];
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
  // Encontrar nosso índice
  const me = players.find(p => p.name === nameInput.value.trim() || 'Jogador');
  myPlayerIndex = players.indexOf(me);
  updatePlayerSlots(players);
  // Se jogo já iniciou (handStart será enviado), senão mensagem de espera
  if (players.length < 4) {
    messageArea.textContent = 'Aguardando jogadores...';
  }
}

socket.on('waiting', (players) => {
  updatePlayerSlots(players);
  if (players.length < 4) {
    messageArea.textContent = 'Aguardando jogadores... (Bots entrarão em breve)';
  }
});

socket.on('handStart', (data) => {
  playerHand = data.hand;
  myPlayerIndex = data.player;
  renderMyHand(playerHand);
  viraCardEl.textContent = `${data.vira.rank}${suitSymbol(data.vira.suit)}`;
  teamAScoreEl.textContent = data.scores[0];
  teamBScoreEl.textContent = data.scores[1];
  gameActive = true;
  clearTable();
  messageArea.textContent = '';
  betActions.innerHTML = '';
  updateTurn(data.currentPlayer);
  // Atualiza nomes/dados dos jogadores (incluindo bots)
  data.players.forEach((p, i) => {
    const slot = slots[i];
    if (slot) {
      slot.querySelector('.name').textContent = p.name + (p.isBot ? ' (Bot)' : '');
    }
  });
  // Mostrar mãos dos oponentes como costas
  for (let i = 0; i < 4; i++) {
    if (i !== myPlayerIndex) {
      slots[i].querySelector('.hand').innerHTML = '<div class="card back">🂠</div><div class="card back">🂠</div><div class="card back">🂠</div>';
    }
  }
});

socket.on('turn', ({ currentPlayer }) => {
  updateTurn(currentPlayer);
});

socket.on('cardPlayed', ({ player, card }) => {
  const slot = slots[player];
  if (slot) {
    const handDiv = slot.querySelector('.hand');
    // Remove uma carta de costas
    const backs = handDiv.querySelectorAll('.back');
    if (backs.length > 0) backs[0].remove();
  }
  // Mostra carta na mesa
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  cardDiv.textContent = `${card.rank}${suitSymbol(card.suit)}`;
  cardDiv.setAttribute('data-player', player);
  tableArea.appendChild(cardDiv);
});

socket.on('roundResult', ({ winner }) => {
  setTimeout(clearTable, 2000);
});

socket.on('handEnd', ({ winnerTeam, scores }) => {
  gameActive = false;
  teamAScoreEl.textContent = scores[0];
  teamBScoreEl.textContent = scores[1];
  messageArea.textContent = winnerTeam === myPlayerIndex % 2 ? 'Seu time ganhou a mão!' : 'Time adversário ganhou a mão.';
  playerHandDiv.innerHTML = '';
  for (let i = 0; i < 4; i++) slots[i].querySelector('.hand').innerHTML = '';
});

socket.on('gameOver', ({ winnerTeam }) => {
  alert(winnerTeam === myPlayerIndex % 2 ? 'Seu time venceu o jogo!' : 'Time adversário venceu!');
  location.reload();
});

socket.on('betCalled', ({ challenger, level, responderTeam }) => {
  messageArea.textContent = `${slots[challenger].querySelector('.name').textContent} pediu ${level.toUpperCase()}!`;
  if (responderTeam === myPlayerIndex % 2) {
    showBetActions(level);
  }
});

socket.on('betAccepted', ({ handValue }) => {
  messageArea.textContent = `Aposta aceita! Mão vale ${handValue} pontos.`;
  betActions.innerHTML = '';
});

socket.on('turnToRespond', ({ responderTeam }) => {
  if (responderTeam === myPlayerIndex % 2) {
    // Botões já aparecem via betCalled
  }
});

function updatePlayerSlots(players) {
  for (let i = 0; i < 4; i++) {
    const slot = slots[i];
    if (i < players.length) {
      slot.style.display = 'flex';
      slot.querySelector('.name').textContent = players[i].name + (players[i].isBot ? ' (Bot)' : '');
    } else {
      slot.style.display = 'none';
    }
  }
}

function updateTurn(cp) {
  actionsArea.innerHTML = '';
  betActions.innerHTML = '';
  if (!gameActive) return;
  // Destacar slot do jogador da vez
  for (let i = 0; i < 4; i++) {
    slots[i].classList.toggle('active', i === cp);
  }
  if (cp === myPlayerIndex && playerHand.length > 0) {
    actionsArea.innerHTML = `
      <button id="playBtn">Jogar Carta</button>
      <button id="trucoBtn">Truco</button>
    `;
    document.getElementById('playBtn').onclick = () => highlightCardsForPlay();
    document.getElementById('trucoBtn').onclick = () => socket.emit('callBet', 'truco');
  }
}

function highlightCardsForPlay() {
  const cards = document.querySelectorAll('.my-hand .card');
  cards.forEach(card => {
    card.onclick = () => {
      const index = parseInt(card.dataset.index);
      socket.emit('playCard', playerHand[index]);
      playerHand.splice(index, 1);
      renderMyHand(playerHand);
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

function renderMyHand(hand) {
  playerHandDiv.innerHTML = hand.map((c, idx) => 
    `<div class="card" data-index="${idx}">${c.rank}${suitSymbol(c.suit)}</div>`
  ).join('');
}

function clearTable() {
  tableArea.innerHTML = '';
}

function suitSymbol(s) {
  return { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' }[s] || s;
}