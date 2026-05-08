const socket = io(window.location.origin);

// Lobby
const lobbyDiv = document.getElementById('lobby');
const gameWrapper = document.getElementById('gameWrapper');
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const roomsListEl = document.getElementById('roomsList');
const contagemEl = document.getElementById('contagemRegressiva');
const contagemNumero = document.getElementById('contagemNumero');

// Elementos do jogo
const gameContainer = document.getElementById('game');
const mesaCartas = document.getElementById('mesaCartas');
const viraEl = document.getElementById('vira');
const hand1 = document.getElementById('hand1');
const hand2 = document.getElementById('hand2');
const hand3 = document.getElementById('hand3');
const maoDiv = document.getElementById('mao');
const infoRodadaEl = document.getElementById('infoRodada');
const trucoStatusEl = document.getElementById('trucoStatus');
const btnTruco = document.getElementById('btnTruco');
const btnCorrer = document.getElementById('btnCorrer');
const teamAScoreEl = document.getElementById('teamAScore');
const teamBScoreEl = document.getElementById('teamBScore');
const painelHistorico = document.getElementById('historicoRodadas');
const toastEl = document.getElementById('toast');
const telaFinal = document.getElementById('telaFinal');
const textoFinal = document.getElementById('textoFinal');
const resumoFinal = document.getElementById('resumoFinal');
const cronometroEl = document.getElementById('cronometro');
const cronometroNum = document.getElementById('cronometroNum');

// Áudios
const audioTruco = document.getElementById('audioTruco');
const audioCarta = document.getElementById('audioCarta');
const audioDistribuir = document.getElementById('audioDistribuir');
const audioNove = document.getElementById('audioNove');
const audioSeis = document.getElementById('audioSeis');
const audioDoze = document.getElementById('audioDoze');

const nomesSlots = {
  p0: document.querySelector('#p0 .name'),
  p1: document.querySelector('#p1 .name'),
  p2: document.querySelector('#p2 .name'),
  p3: document.querySelector('#p3 .name')
};

const SLOT_ORDER = ['p0', 'p3', 'p2', 'p1'];
const HAND_SLOTS = [null, hand3, hand2, hand1];

let myPlayerIndex = null;
let playerHand = [];
let gameActive = false;
let aguardandoResposta = false;
let isMyTurn = false;
let turnTimerInterval = null;
let timeLeft = 25;
let currentGameCode = null;
let currentHandValue = 1; // valor da mão atual

// ========== INDICADOR DE VEZ (seta dinâmica) ==========
const turnIndicator = document.createElement('div');
turnIndicator.id = 'turnIndicator';
document.body.appendChild(turnIndicator);

function posicionarSeta(currentPlayer) {
  if (!gameActive || currentPlayer === undefined || currentPlayer === null) {
    turnIndicator.classList.remove('visible');
    return;
  }
  // Mapear índice original do jogador para posição visual (após rotação)
  const rotated = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
  const visualPos = rotated.indexOf(currentPlayer);
  const slotId = SLOT_ORDER[visualPos];
  const slotEl = document.getElementById(slotId);
  if (!slotEl) {
    turnIndicator.classList.remove('visible');
    return;
  }
  const rect = slotEl.getBoundingClientRect();

  // Ângulos de rotação para a seta apontar no sentido anti‑horário
  // A seta padrão (0°) aponta para BAIXO (▾)
  // Sentido anti‑horário: p0(bottom) → p3(right) → p2(top) → p1(left) → p0
  const rotationMap = {
    'p0': 90,   // bottom → aponta direita  (para p3)
    'p3': 180,  // right  → aponta cima     (para p2)
    'p2': 270,  // top    → aponta esquerda (para p1)
    'p1': 0     // left   → aponta baixo    (para p0)
  };
  const rotation = rotationMap[slotId] || 0;

  // Centralizar acima do avatar
  turnIndicator.style.left = (rect.left + rect.width / 2) + 'px';
  turnIndicator.style.top = (rect.top - 20) + 'px'; // um pouco acima
  turnIndicator.style.transform = `translate(-50%, 0) rotate(${rotation}deg)`;
  turnIndicator.classList.add('visible');
}

function esconderSeta() {
  turnIndicator.classList.remove('visible');
}

// ========== UTILITÁRIOS ==========
function rotateArrayForPlayer(arr, startIndex) {
  return arr.map((_, i) => arr[(startIndex - i + arr.length) % arr.length]);
}

function createCardHTML(card) {
  const suitSym = suitSymbol(card.suit);
  const corClasse = (card.suit === 'copas' || card.suit === 'ouros') ? 'naipe-vermelho' : 'naipe-preto';
  return `
    <div class="carta-corner top-left ${corClasse}">${card.rank}${suitSym}</div>
    <div class="carta-center ${corClasse}">${card.rank}${suitSym}</div>
    <div class="carta-corner bottom-right ${corClasse}">${card.rank}${suitSym}</div>
  `;
}

// ========== LOBBY ==========
createBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Jogador';
  socket.emit('createRoom', name, (res) => {
    if (res.error) return alert(res.error);
    currentGameCode = res.roomCode;
    enterWaitingRoom(res);
  });
};

joinBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Jogador';
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return;
  socket.emit('joinRoom', { roomCode: code, playerName: name }, (res) => {
    if (res.error) return alert(res.error);
    currentGameCode = res.roomCode;
    enterWaitingRoom(res);
  });
};

function joinRoomFromList(code) {
  const name = nameInput.value.trim() || 'Jogador';
  socket.emit('joinRoom', { roomCode: code, playerName: name }, (res) => {
    if (res.error) return alert(res.error);
    currentGameCode = res.roomCode;
    enterWaitingRoom(res);
  });
}

function enterWaitingRoom(res) {
  lobbyDiv.classList.add('game-hidden');
  gameWrapper.classList.remove('game-hidden');
  contagemEl.classList.remove('oculto');
  contagemNumero.textContent = '10';
  maoDiv.innerHTML = '';
  mesaCartas.innerHTML = '';
  viraEl.classList.add('oculto');
  btnTruco.classList.add('oculto');
  btnCorrer.classList.add('oculto');
  telaFinal.classList.remove('show');
  esconderSeta();
}

socket.on('connect', () => {
  socket.emit('getRooms');
});

socket.on('roomsUpdate', (rooms) => {
  if (!roomsListEl) return;
  roomsListEl.innerHTML = '';
  if (rooms.length === 0) {
    roomsListEl.innerHTML = '<div style="color:#aaa; text-align:center;">Nenhuma sala disponível</div>';
    return;
  }
  rooms.forEach(room => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `<span>Sala ${room.code} (${room.players}/4 jogadores)</span><button class="join-room-btn">Entrar</button>`;
    div.querySelector('.join-room-btn').addEventListener('click', () => joinRoomFromList(room.code));
    roomsListEl.appendChild(div);
  });
});

socket.on('lobbyCountdown', ({ count }) => {
  contagemNumero.textContent = count;
  if (count <= 0) contagemEl.classList.add('oculto');
});

// ========== GAME EVENTS ==========
socket.on('handStart', (data) => {
  contagemEl.classList.add('oculto');
  gameActive = true;
  playerHand = data.hand;
  myPlayerIndex = data.player;
  currentHandValue = data.handValue;

  const rotatedPlayers = rotateArrayForPlayer(data.players, myPlayerIndex);
  for (let i = 0; i < 4; i++) {
    const slotEl = nomesSlots[SLOT_ORDER[i]];
    const player = rotatedPlayers[i];
    if (slotEl) slotEl.textContent = (player?.name || '') + (player?.isBot ? ' (Bot)' : '');
  }

  for (let i = 1; i <= 3; i++) {
    HAND_SLOTS[i].innerHTML = '';
    const op = rotatedPlayers[i];
    for (let j = 0; j < 3; j++) {
      const carta = document.createElement('div');
      carta.className = 'carta virada';
      HAND_SLOTS[i].appendChild(carta);
    }
  }

  renderizarMao(playerHand);
  teamAScoreEl.textContent = data.scores[0];
  teamBScoreEl.textContent = data.scores[1];
  infoRodadaEl.textContent = 'Rodada 1 de 3';
  trucoStatusEl.textContent = 'Truco: Nenhum';
  isMyTurn = (data.currentPlayer === myPlayerIndex);
  posicionarSeta(data.currentPlayer);
  atualizarInfoLive();

  if (isMyTurn && !aguardandoResposta) {
    btnCorrer.classList.remove('oculto');
    atualizarBotaoTruco();
  } else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }
  aguardandoResposta = false;
  viraEl.classList.remove('oculto', 'virada');
  viraEl.innerHTML = createCardHTML(data.vira);
  mesaCartas.innerHTML = '';

  painelHistorico.querySelectorAll('.bolinha-rodada').forEach(b => {
    b.className = 'bolinha-rodada bolinha-branca';
  });

  audioDistribuir.play().catch(e => {});
  clearTurnTimer();
  if (isMyTurn && !aguardandoResposta) startTurnTimer();
});

socket.on('turn', ({ currentPlayer }) => {
  isMyTurn = (currentPlayer === myPlayerIndex);
  posicionarSeta(currentPlayer);
  if (!aguardandoResposta) {
    if (isMyTurn) {
      btnCorrer.classList.remove('oculto');
      atualizarBotaoTruco();
      startTurnTimer();
    } else {
      btnTruco.classList.add('oculto');
      btnCorrer.classList.add('oculto');
      clearTurnTimer();
    }
  }
  atualizarInfoLive();
});

socket.on('cardPlayed', ({ player, card }) => {
  if (player === myPlayerIndex) {
    const idx = playerHand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx !== -1) {
      playerHand.splice(idx, 1);
      renderizarMao(playerHand);
    }
    clearTurnTimer();
  } else {
    const rotatedPlayers = rotateArrayForPlayer(
      Array.from({ length: 4 }, (_, i) => ({ id: i })),
      myPlayerIndex
    );
    const relIndex = rotatedPlayers.findIndex(p => p.id === player);
    if (relIndex > 0) {
      const handEl = HAND_SLOTS[relIndex];
      if (handEl && handEl.children.length > 0) {
        handEl.removeChild(handEl.lastChild);
      }
    }
  }

  const rotatedPlayers = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
  const relPos = rotatedPlayers.indexOf(player);
  const posicoes = ['c0', 'c1', 'c2', 'c3'];
  const cartaDiv = document.createElement('div');
  cartaDiv.className = `cartaMesa ${posicoes[relPos >= 0 ? relPos : player]}`;
  cartaDiv.innerHTML = createCardHTML(card);
  mesaCartas.appendChild(cartaDiv);
  audioCarta.play().catch(e => {});
});

socket.on('roundResult', ({ round, winner }) => {
  infoRodadaEl.textContent = `Rodada ${round + 2} de 3`;
  const bolinhas = painelHistorico.querySelectorAll('.bolinha-rodada');
  if (bolinhas[round]) {
    let corClasse = 'bolinha-ouro';
    if (winner !== -1) {
      corClasse = (winner % 2 === myPlayerIndex % 2) ? 'bolinha-verde' : 'bolinha-azul';
    }
    bolinhas[round].className = 'bolinha-rodada ' + corClasse;
  }
  setTimeout(() => { mesaCartas.innerHTML = ''; }, 1200);
});

socket.on('handEnd', ({ winnerTeam, points, scores }) => {
  gameActive = false;
  aguardandoResposta = false;
  isMyTurn = false;
  clearTurnTimer();
  teamAScoreEl.textContent = scores[0];
  teamBScoreEl.textContent = scores[1];
  if (points === 6) audioSeis.play().catch(e => {});
  else if (points === 9) audioNove.play().catch(e => {});
  else if (points === 12) audioDoze.play().catch(e => {});
  btnTruco.classList.add('oculto');
  btnCorrer.classList.add('oculto');
  maoDiv.innerHTML = '';
  hand1.innerHTML = '';
  hand2.innerHTML = '';
  hand3.innerHTML = '';
  viraEl.classList.add('oculto');
  mostrarMensagem(winnerTeam === myPlayerIndex % 2 ? 'Seu time ganhou a mão!' : 'Time adversário ganhou a mão.');
  esconderSeta();
  atualizarInfoLive();
});

socket.on('matchOver', ({ winnerTeam }) => {
  aguardandoResposta = false;
  isMyTurn = false;
  clearTurnTimer();
  contagemEl.classList.add('oculto');
  telaFinal.classList.add('show');
  textoFinal.textContent = winnerTeam === myPlayerIndex % 2 ? 'VOCÊ VENCEU A PARTIDA!' : 'VOCÊ PERDEU A PARTIDA!';
  resumoFinal.textContent = 'Clique em Voltar ao Lobby para jogar novamente.';
  document.getElementById('btnVoltarLobby').onclick = () => location.reload();
  document.getElementById('btnBuscarNova').onclick = () => location.reload();
  esconderSeta();
});

socket.on('betCalled', ({ level }) => {
  btnTruco.classList.add('oculto');
  btnCorrer.classList.remove('oculto');
  aguardandoResposta = true;
  audioTruco.play().catch(e => {});
});

socket.on('betAccepted', ({ handValue }) => {
  currentHandValue = handValue;
  trucoStatusEl.textContent = `Truco: ${handValue} pts`;
  btnCorrer.classList.remove('oculto');
  if (isMyTurn && !aguardandoResposta) {
    atualizarBotaoTruco();
  }
  aguardandoResposta = false;
  atualizarInfoLive();
});

// ========== BOTÕES ==========
function atualizarBotaoTruco() {
  if (!gameActive || aguardandoResposta || !isMyTurn) {
    btnTruco.classList.add('oculto');
    return;
  }
  btnTruco.classList.remove('oculto');
  if (currentHandValue >= 12) {
    btnTruco.classList.add('oculto');
  } else if (currentHandValue >= 6) {
    btnTruco.textContent = 'VALE QUATRO';
  } else if (currentHandValue >= 3) {
    btnTruco.textContent = 'RETRUCO';
  } else {
    btnTruco.textContent = 'TRUCO';
  }
}

btnTruco.onclick = () => {
  if (!isMyTurn || !gameActive || aguardandoResposta) return;
  let betType = 'truco';
  if (currentHandValue >= 6) betType = 'valequatro';
  else if (currentHandValue >= 3) betType = 'retruco';
  socket.emit('callBet', betType);
  clearTurnTimer();
};

btnCorrer.onclick = () => {
  if (!isMyTurn || !gameActive) return;
  if (aguardandoResposta) {
    socket.emit('respondBet', 'flee');
  } else {
    socket.emit('fleeHand');
  }
  clearTurnTimer();
};

// ========== FUNÇÕES AUXILIARES ==========
function atualizarInfoLive() {
  if (!gameActive) return;
  const base = infoRodadaEl.textContent.replace(/<span.*<\/span>/, '').trim();
  infoRodadaEl.innerHTML = base + (isMyTurn
    ? ' <span style="color:#5cb85c;">🎯 Sua vez!</span>'
    : ' <span style="color:#f1c40f;">⏳ Aguardando oponente</span>');
}

function renderizarMao(hand) {
  maoDiv.innerHTML = '';
  hand.forEach((c) => {
    const carta = document.createElement('div');
    carta.className = 'carta playerCard';
    carta.innerHTML = createCardHTML(c);
    carta.style.pointerEvents = 'auto';
    carta.addEventListener('click', () => {
      console.log('Carta clicada! gameActive:', gameActive, 'isMyTurn:', isMyTurn);
      if (!isMyTurn || !gameActive) return;
      socket.emit('playCard', c);
      clearTurnTimer();
    });
    maoDiv.appendChild(carta);
  });
}

function startTurnTimer() { /* ... igual ... */ }
function clearTurnTimer() { /* ... igual ... */ }
function autoPlayRandomCard() { /* ... igual ... */ }
function mostrarMensagem(texto) { /* ... igual ... */ }

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}