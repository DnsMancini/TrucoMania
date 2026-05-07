const socket = io(window.location.origin);

// Telas
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

// Lobby
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

// Elementos do jogo
const teamAScoreEl = document.getElementById('teamAScore');
const teamBScoreEl = document.getElementById('teamBScore');
const playerHandDiv = document.getElementById('playerHand');
const trucoDisplay = document.getElementById('trucoDisplay');
const rodadasIndicador = document.getElementById('rodadasIndicador');
const historicoCartasDiv = document.getElementById('historicoCartas');
const rodadaAtualSpan = document.getElementById('rodadaAtual');
const trucoStatusSpan = document.getElementById('trucoStatus');
const trucoBtn = document.getElementById('trucoBtn');
const correrBtn = document.getElementById('correrBtn');
const parceiroNomeEl = document.getElementById('parceiroNome');

// Slots
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
  lobbyDiv.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  const me = players.find(p => p.name === nameInput.value.trim() || 'Jogador');
  myPlayerIndex = players.indexOf(me);
  updatePlayerSlots(players);
}

socket.on('waiting', (players) => {
  updatePlayerSlots(players);
});

socket.on('handStart', (data) => {
  playerHand = data.hand;
  myPlayerIndex = data.player;
  renderMyHand(playerHand);
  teamAScoreEl.textContent = data.scores[0];
  teamBScoreEl.textContent = data.scores[1];
  gameActive = true;
  historicoCartasDiv.innerHTML = '';
  rodadaAtualSpan.textContent = 'Rodada 1 de 3';
  trucoStatusSpan.textContent = 'Truco: Nenhum';
  trucoDisplay.textContent = 'TRUCO';
  trucoBtn.style.display = 'inline-block';
  correrBtn.style.display = 'none';

  audioDistribuir.play().catch(() => {});
  data.players.forEach((p, i) => {
    const slot = slots[i];
    if (slot) {
      slot.querySelector('.name').textContent = p.name + (p.isBot ? ' (Bot)' : '');
    }
  });
  const parceiro = data.players.find((_, i) => i % 2 === myPlayerIndex % 2 && i !== myPlayerIndex);
  if (parceiroNomeEl && parceiro) parceiroNomeEl.textContent = parceiro.name;

  for (let i = 0; i < 4; i++) {
    if (i !== myPlayerIndex) {
      slots[i].querySelector('.hand').innerHTML = '<div class="card back"></div><div class="card back"></div><div class="card back"></div>';
    }
  }
  updateTurn(data.currentPlayer);
});

socket.on('turn', ({ currentPlayer }) => updateTurn(currentPlayer));

socket.on('cardPlayed', ({ player, card }) => {
  const slot = slots[player];
  if (slot) {
    const handDiv = slot.querySelector('.hand');
    if (handDiv) {
      const backs = handDiv.querySelectorAll('.back');
      if (backs.length > 0) backs[0].remove();
    }
  }
  adicionarAoHistorico(card);
  audioCarta.play().catch(() => {});
});

socket.on('roundResult', ({ winner }) => {
  const spans = rodadasIndicador.querySelectorAll('span');
  if (spans.length >= 3 && gameActive) {
    const rodadaAtual = parseInt(rodadaAtualSpan.textContent.split(' ')[1]) || 1;
    const idx = rodadaAtual - 1;
    if (idx < 3) spans[idx].textContent = `${idx + 1}ª: ✔`;
  }
});

socket.on('handEnd', ({ winnerTeam, points, scores }) => {
  gameActive = false;
  teamAScoreEl.textContent = scores[0];
  teamBScoreEl.textContent = scores[1];
  if (points === 6) audioSeis.play().catch(() => {});
  else if (points === 9) audioNove.play().catch(() => {});
  else if (points === 12) audioDoze.play().catch(() => {});
  playerHandDiv.innerHTML = '';
  for (let i = 0; i < 4; i++) slots[i].querySelector('.hand').innerHTML = '';
  trucoBtn.style.display = 'inline-block';
  correrBtn.style.display = 'none';
});

socket.on('gameOver', ({ winnerTeam }) => {
  alert(winnerTeam === myPlayerIndex % 2 ? 'Seu time venceu o jogo!' : 'Time adversário venceu!');
  location.reload();
});

socket.on('betCalled', ({ challenger, level, responderTeam }) => {
  trucoDisplay.textContent = level.toUpperCase();
  trucoBtn.style.display = 'none';
  correrBtn.style.display = 'inline-block';
  audioTruco.play().catch(() => {});
});

socket.on('betAccepted', ({ handValue }) => {
  trucoStatusSpan.textContent = `Truco: ${handValue} pontos`;
  trucoDisplay.textContent = handValue >= 12 ? 'VALE QUATRO' : handValue >= 6 ? 'RETRUCO' : 'TRUCO';
  trucoBtn.style.display = 'inline-block';
  correrBtn.style.display = 'none';
});

socket.on('turnToRespond', () => {});

socket.on('playerLeft', () => {
  alert('Oponente saiu do jogo.');
  location.reload();
});

// Funções auxiliares

function updatePlayerSlots(players) {
  for (let i = 0; i < 4; i++) {
    const slot = slots[i];
    if (slot) {
      if (i < players.length) {
        slot.style.display = 'block';
        slot.querySelector('.name').textContent = players[i].name + (players[i].isBot ? ' (Bot)' : '');
      } else {
        slot.style.display = 'none';
      }
    }
  }
}

function updateTurn(cp) {
  for (let i = 0; i < 4; i++) {
    slots[i].classList.toggle('active', i === cp);
  }
  if (cp === myPlayerIndex && gameActive && playerHand.length > 0) {
    trucoBtn.style.display = 'inline-block';
  } else {
    trucoBtn.style.display = 'none';
  }
}

trucoBtn.onclick = () => socket.emit('callBet', 'truco');
correrBtn.onclick = () => socket.emit('respondBet', 'flee');

function renderMyHand(hand) {
  playerHandDiv.innerHTML = hand.map((c, idx) => {
    const simbolo = suitSymbol(c.suit);
    const corClasse = (c.suit === 'copas' || c.suit === 'ouros') ? 'naipe-vermelho' : 'naipe-preto';
    return `<div class="card my-card" data-index="${idx}" style="background-color: white; background-image: none;">
      <span class="card-value ${corClasse}">${c.rank}${simbolo}</span>
    </div>`;
  }).join('');
  document.querySelectorAll('.my-card').forEach(card => {
    card.onclick = () => {
      const index = parseInt(card.dataset.index);
      socket.emit('playCard', playerHand[index]);
      playerHand.splice(index, 1);
      renderMyHand(playerHand);
    };
  });
}

function adicionarAoHistorico(card) {
  const simbolo = suitSymbol(card.suit);
  const corClasse = (card.suit === 'copas' || card.suit === 'ouros') ? 'naipe-vermelho' : 'naipe-preto';
  const cardDiv = document.createElement('div');
  cardDiv.className = `card ${corClasse}`;
  cardDiv.style.width = '35px';
  cardDiv.style.height = '50px';
  cardDiv.style.fontSize = '0.7rem';
  cardDiv.style.backgroundColor = 'white';
  cardDiv.style.backgroundImage = 'none';
  cardDiv.textContent = card.rank + simbolo;
  historicoCartasDiv.appendChild(cardDiv);
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}