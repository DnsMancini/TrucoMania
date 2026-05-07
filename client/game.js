const socket = io(window.location.origin);

// Telas
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

// Elementos do lobby
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

// Elementos do jogo
const teamAScoreEl = document.getElementById('teamAScore');
const teamBScoreEl = document.getElementById('teamBScore');
const roomCodeEl = document.getElementById('roomCodeDisplay');
const viraCardEl = document.getElementById('viraCard');
const playerHandDiv = document.getElementById('playerHand');
const tableArea = document.getElementById('tableArea');
const actionsArea = document.getElementById('actionsArea');
const betActions = document.getElementById('betActions');
const messageArea = document.getElementById('messageArea');

// Slots dos jogadores
const slots = {
  0: document.getElementById('slotP0'),
  1: document.getElementById('slotP1'),
  2: document.getElementById('slotP2'),
  3: document.getElementById('slotP3')
};

// Áudios
const audioTruco = document.getElementById('audioTruco');
const audioCarta = document.getElementById('audioCarta');
const audioDistribuir = document.getElementById('audioDistribuir');
const audioNove = document.getElementById('audioNove');
const audioSeis = document.getElementById('audioSeis');
const audioDoze = document.getElementById('audioDoze');

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
  const me = players.find(p => p.name === nameInput.value.trim() || 'Jogador');
  myPlayerIndex = players.indexOf(me);
  updatePlayerSlots(players);
  if (players.length < 4) {
    messageArea.textContent = 'Aguardando jogadores... (Bots entrarão em breve)';
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
  // Toca áudio de distribuição
  audioDistribuir.play().catch(() => {});
  // Atualiza nomes e avatares
  data.players.forEach((p, i) => {
    const slot = slots[i];
    if (slot) {
      slot.querySelector('.name').textContent = p.name + (p.isBot ? ' (Bot)' : '');
      updateSlotAvatar(i, p.isBot, data.players.length === 4);
    }
  });
  // Mãos dos oponentes como costas
  for (let i = 0; i < 4; i++) {
    if (i !== myPlayerIndex) {
      slots[i].querySelector('.hand').innerHTML =
        '<div class="card back"></div><div class="card back"></div><div class="card back"></div>';
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
    const backs = handDiv.querySelectorAll('.back');
    if (backs.length > 0) backs[0].remove();
  }
  // Cria elemento da carta jogada
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card';
  cardDiv.style.backgroundImage = "url('/img/carta-copag-vermelha.png')";
  cardDiv.style.backgroundSize = 'contain';
  cardDiv.style.backgroundRepeat = 'no-repeat';
  cardDiv.style.backgroundPosition = 'center';
  cardDiv.innerHTML = `<span class="card-value">${card.rank}${suitSymbol(card.suit)}</span>`;
  cardDiv.setAttribute('data-player', player);
  tableArea.appendChild(cardDiv);
  audioCarta.play().catch(() => {});
});

socket.on('roundResult', ({ winner }) => {
  setTimeout(clearTable, 2000);
});

socket.on('handEnd', ({ winnerTeam, points, scores }) => {
  gameActive = false;
  teamAScoreEl.textContent = scores[0];
  teamBScoreEl.textContent = scores[1];
  messageArea.textContent = winnerTeam === myPlayerIndex % 2 ? 'Seu time ganhou a mão!' : 'Time adversário ganhou a mão.';
  if (points === 6) audioSeis.play().catch(() => {});
  else if (points === 9) audioNove.play().catch(() => {});
  else if (points === 12) audioDoze.play().catch(() => {});
  playerHandDiv.innerHTML = '';
  for (let i = 0; i < 4; i++) slots[i].querySelector('.hand').innerHTML = '';
});

socket.on('gameOver', ({ winnerTeam }) => {
  alert(winnerTeam === myPlayerIndex % 2 ? 'Seu time venceu o jogo!' : 'Time adversário venceu!');
  location.reload();
});

socket.on('betCalled', ({ challenger, level, responderTeam }) => {
  messageArea.textContent = `${slots[challenger].querySelector('.name').textContent} pediu ${level.toUpperCase()}!`;
  audioTruco.play().catch(() => {});
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

socket.on('playerLeft', () => {
  alert('Oponente saiu do jogo.');
  location.reload();
});

function updatePlayerSlots(players) {
  for (let i = 0; i < 4; i++) {
    const slot = slots[i];
    if (slot) {
      if (i < players.length) {
        slot.style.display = 'flex';
        slot.querySelector('.name').textContent = players[i].name + (players[i].isBot ? ' (Bot)' : '');
        updateSlotAvatar(i, players[i].isBot, players.length === 4);
      } else {
        slot.style.display = 'none';
      }
    }
  }
}

function updateSlotAvatar(index, isBot, isFull) {
  const slot = slots[index];
  const avatarImg = slot.querySelector('.avatar');
  if (!avatarImg) return;
  const isParceiro = (myPlayerIndex !== null && index % 2 === myPlayerIndex % 2 && index !== myPlayerIndex);
  const isVoce = (index === myPlayerIndex);
  if (isVoce) {
    avatarImg.src = '/img/voce.png';
  } else if (isBot) {
    avatarImg.src = index % 2 === 0 ? '/img/bot1.png' : '/img/bot2.png';
  } else if (isParceiro && isFull) {
    avatarImg.src = '/img/Avatarparceiro.png';
  } else {
    avatarImg.src = '/img/Avatarparceiro.png';
  }
}

function updateTurn(cp) {
  actionsArea.innerHTML = '';
  betActions.innerHTML = '';
  if (!gameActive) return;
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
    `<div class="card my-card" data-index="${idx}" style="background-image: url('/img/carta-copag-vermelha.png'); background-size: contain; background-repeat: no-repeat; background-position: center;">
      <span class="card-value">${c.rank}${suitSymbol(c.suit)}</span>
    </div>`
  ).join('');
}

function clearTable() {
  tableArea.innerHTML = '';
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}