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
const gameContainer = document.getElementById('game'); // não rotacionaremos mais
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

// Mapeamento visual: slots fixos x posição relativa (0=bottom, 1=right, 2=top, 3=left)
const SLOT_ORDER = ['p0', 'p3', 'p2', 'p1'];
// Mãos correspondentes: índice relativo 1 (right) -> hand3, 2 (top) -> hand2, 3 (left) -> hand1
const HAND_SLOTS = [null, hand3, hand2, hand1];

let myPlayerIndex = null;
let playerHand = [];
let gameActive = false;
let aguardandoResposta = false;
let isMyTurn = false;
let turnTimerInterval = null;
let timeLeft = 25;
let currentGameCode = null;

// ========== UTILITÁRIOS ==========
function rotateArrayForPlayer(arr, startIndex) {
  return arr.map((_, i) => arr[(startIndex + i) % arr.length]);
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

  // 1. Rotacionar a lista para perspectiva local
  const rotatedPlayers = rotateArrayForPlayer(data.players, myPlayerIndex);

  // 2. Atualizar nomes nos slots visuais
  for (let i = 0; i < 4; i++) {
    const slotEl = nomesSlots[SLOT_ORDER[i]];
    const player = rotatedPlayers[i];
    if (slotEl) slotEl.textContent = (player?.name || '') + (player?.isBot ? ' (Bot)' : '');
  }

  // 3. Preparar mãos dos oponentes (sempre criar 3 cartas viradas)
  for (let i = 1; i <= 3; i++) {
    const handEl = HAND_SLOTS[i];
    handEl.innerHTML = '';
    const op = rotatedPlayers[i];
    // Independente de ser bot ou humano, mostrar três cartas viradas
    for (let j = 0; j < 3; j++) {
      const carta = document.createElement('div');
      carta.className = 'carta virada';
      handEl.appendChild(carta);
    }
  }

  // 4. Renderizar minha mão
  renderizarMao(playerHand);

  // 5. Scores e info
  teamAScoreEl.textContent = data.scores[0];
  teamBScoreEl.textContent = data.scores[1];
  infoRodadaEl.textContent = 'Rodada 1 de 3';
  trucoStatusEl.textContent = 'Truco: Nenhum';
  atualizarInfoLive();

  // 6. Botões apenas na minha vez
  if (data.currentPlayer === myPlayerIndex && !aguardandoResposta) {
    btnTruco.classList.remove('oculto');
    btnCorrer.classList.remove('oculto');
  } else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }
  aguardandoResposta = false;

  // 7. Vira
  viraEl.classList.remove('oculto', 'virada');
  viraEl.innerHTML = createCardHTML(data.vira);

  // 8. Mesa limpa
  mesaCartas.innerHTML = '';

  // 9. Bolinhas
  painelHistorico.querySelectorAll('.bolinha-rodada').forEach(b => {
    b.className = 'bolinha-rodada bolinha-branca';
  });

  audioDistribuir.play().catch(e => {});
  clearTurnTimer();
  if (data.currentPlayer === myPlayerIndex && !aguardandoResposta) startTurnTimer();
});

socket.on('turn', ({ currentPlayer }) => {
  isMyTurn = (currentPlayer === myPlayerIndex);
  if (!aguardandoResposta) {
    if (isMyTurn) {
      btnTruco.classList.remove('oculto');
      btnCorrer.classList.remove('oculto');
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
    // Descobrir a qual mão pertence esse jogador (baseado na rotação)
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

  // Adicionar carta na mesa (posições fixas, mesma para todos)
  const posicoes = ['c0', 'c1', 'c2', 'c3'];
  const cartaDiv = document.createElement('div');
  cartaDiv.className = `cartaMesa ${posicoes[player]}`;
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
});

socket.on('betCalled', () => {
  btnTruco.classList.add('oculto');
  btnCorrer.classList.remove('oculto');
  aguardandoResposta = true;
  audioTruco.play().catch(e => {});
});

socket.on('betAccepted', ({ handValue }) => {
  trucoStatusEl.textContent = `Truco: ${handValue} pts`;
  btnCorrer.classList.remove('oculto');
  btnTruco.classList.remove('oculto');
  aguardandoResposta = false;
  atualizarInfoLive();
});

socket.on('playerLeft', () => {
  clearTurnTimer();
  alert('Oponente saiu do jogo.');
  location.reload();
});

// ========== BOTÕES ==========
btnTruco.onclick = () => {
  if (!isMyTurn || !gameActive || aguardandoResposta) return;
  socket.emit('callBet', 'truco');
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
    carta.addEventListener('click', () => {
      if (!isMyTurn || !gameActive) return;
      socket.emit('playCard', c);
      clearTurnTimer();
    });
    maoDiv.appendChild(carta);
  });
}

function startTurnTimer() {
  clearTurnTimer();
  cronometroEl.classList.add('oculto');
  timeLeft = 25;
  turnTimerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearTurnTimer();
      autoPlayRandomCard();
      return;
    }
    if (timeLeft <= 5) {
      cronometroEl.classList.remove('oculto');
      cronometroNum.textContent = timeLeft;
    } else {
      cronometroEl.classList.add('oculto');
    }
  }, 1000);
}

function clearTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
  cronometroEl.classList.add('oculto');
}

function autoPlayRandomCard() {
  if (playerHand.length > 0 && gameActive && isMyTurn) {
    const card = playerHand[Math.floor(Math.random() * playerHand.length)];
    socket.emit('playCard', card);
  }
}

function mostrarMensagem(texto) {
  toastEl.textContent = texto;
  toastEl.style.display = 'block';
  setTimeout(() => { toastEl.style.display = 'none'; }, 3000);
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}