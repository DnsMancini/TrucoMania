const socket = io(window.location.origin);

// Lobby
const lobbyDiv = document.getElementById('lobby');
const gameWrapper = document.getElementById('gameWrapper');
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');

// Elementos do jogo
const teamAScoreEl = document.getElementById('teamAScore');
const teamBScoreEl = document.getElementById('teamBScore');
const trucoDisplay = document.getElementById('trucoDisplay');
const trucoStatus = document.getElementById('trucoStatus');
const infoRodada = document.getElementById('infoRodada');
const btnTruco = document.getElementById('btnTruco');
const btnCorrer = document.getElementById('btnCorrer');
const viraEl = document.getElementById('vira');
const mesaCartas = document.getElementById('mesaCartas');
const hand1 = document.getElementById('hand1');
const hand2 = document.getElementById('hand2');
const hand3 = document.getElementById('hand3');
const maoDiv = document.getElementById('mao');
const painelHistorico = document.getElementById('historicoRodadas');
const mensagemEl = document.getElementById('mensagem');
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

let myPlayerIndex = null;
let playerHand = [];
let gameActive = false;
let aguardandoResposta = false;
let isMyTurn = false;

// Timer
let turnTimerInterval = null;
let timeLeft = 25;

createBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Jogador';
  socket.emit('createRoom', name, (res) => {
    if (res.error) return alert(res.error);
    enterRoom(res);
  });
};

joinBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Jogador';
  const code = roomInput.value.trim().toUpperCase();
  if (!code) return;
  socket.emit('joinRoom', { roomCode: code, playerName: name }, (res) => {
    if (res.error) return alert(res.error);
    enterRoom(res);
  });
};

function enterRoom(res) {
  lobbyDiv.classList.add('game-hidden');
  gameWrapper.classList.remove('game-hidden');
  const players = res.players;
  const me = players.find(p => p.name === nameInput.value.trim() || 'Jogador');
  myPlayerIndex = players.indexOf(me);
  atualizarNomes(players);
}

function atualizarNomes(players) {
  for (let i = 0; i < 4; i++) {
    const el = nomesSlots['p' + i];
    if (el) el.textContent = (players[i]?.name || '') + (players[i]?.isBot ? ' (Bot)' : '');
  }
}

socket.on('handStart', (data) => {
  gameActive = true;
  playerHand = data.hand;
  myPlayerIndex = data.player;
  isMyTurn = (data.currentPlayer === myPlayerIndex);
  renderizarMao(playerHand);
  teamAScoreEl.textContent = data.scores[0];
  teamBScoreEl.textContent = data.scores[1];
  infoRodada.textContent = 'Rodada 1 de 3';
  trucoStatus.textContent = 'Truco: Nenhum';
  trucoDisplay.textContent = 'TRUCO';
  btnTruco.classList.remove('oculto');
  btnCorrer.classList.remove('oculto');
  aguardandoResposta = false;
  viraEl.classList.remove('oculto');
  viraEl.classList.remove('virada');
  viraEl.innerHTML = createCardHTML(data.vira);
  mesaCartas.innerHTML = '';
  atualizarNomes(data.players);

  hand1.innerHTML = '';
  hand2.innerHTML = '';
  hand3.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    if (i === myPlayerIndex) continue;
    const handEl = i === 1 ? hand1 : i === 2 ? hand2 : hand3;
    for (let j = 0; j < 3; j++) {
      const carta = document.createElement('div');
      carta.className = 'carta virada';
      handEl.appendChild(carta);
    }
  }

  painelHistorico.querySelectorAll('.bolinha-rodada').forEach(b => {
    b.className = 'bolinha-rodada bolinha-branca';
  });

  audioDistribuir.play().catch(e => console.warn('Áudio distribuir:', e));
  esconderMensagem();
  clearTurnTimer();
  if (isMyTurn && !aguardandoResposta) startTurnTimer();
});

socket.on('turn', ({ currentPlayer }) => {
  isMyTurn = (currentPlayer === myPlayerIndex);
  if (!aguardandoResposta) {
    btnTruco.classList.remove('oculto');
    btnCorrer.classList.remove('oculto');
    if (currentPlayer === myPlayerIndex) {
      startTurnTimer();
    } else {
      clearTurnTimer();
    }
  }
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
    const handEl = player === 1 ? hand1 : player === 2 ? hand2 : hand3;
    if (handEl.children.length > 0) handEl.removeChild(handEl.lastChild);
  }
  const posicoes = ['c0', 'c1', 'c2', 'c3'];
  const cartaDiv = document.createElement('div');
  cartaDiv.className = `cartaMesa ${posicoes[player]}`;
  cartaDiv.innerHTML = createCardHTML(card);
  mesaCartas.appendChild(cartaDiv);
  audioCarta.play().catch(e => console.warn('Áudio carta:', e));
});

socket.on('roundResult', ({ round, winner }) => {
  infoRodada.textContent = `Rodada ${round + 2} de 3`;
  const bolinhas = painelHistorico.querySelectorAll('.bolinha-rodada');
  if (bolinhas[round]) {
    let corClasse = 'bolinha-ouro';
    if (winner !== -1) {
      if (winner % 2 === myPlayerIndex % 2) corClasse = 'bolinha-verde';
      else corClasse = 'bolinha-azul';
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
  if (points === 6) audioSeis.play().catch(e => console.warn('Áudio seis:', e));
  else if (points === 9) audioNove.play().catch(e => console.warn('Áudio nove:', e));
  else if (points === 12) audioDoze.play().catch(e => console.warn('Áudio doze:', e));
  btnTruco.classList.add('oculto');
  btnCorrer.classList.add('oculto');
  maoDiv.innerHTML = '';
  hand1.innerHTML = '';
  hand2.innerHTML = '';
  hand3.innerHTML = '';
  viraEl.classList.add('oculto');
  mostrarMensagem(winnerTeam === myPlayerIndex % 2 ? 'Seu time ganhou a mão!' : 'Time adversário ganhou a mão.');
});

socket.on('gameOver', ({ winnerTeam }) => {
  aguardandoResposta = false;
  isMyTurn = false;
  clearTurnTimer();
  telaFinal.classList.add('show');
  textoFinal.textContent = winnerTeam === myPlayerIndex % 2 ? 'VOCÊ VENCEU!' : 'VOCÊ PERDEU!';
  resumoFinal.textContent = 'Clique em Voltar ao Lobby para jogar novamente.';
  document.getElementById('btnVoltarLobby').onclick = () => location.reload();
  document.getElementById('btnBuscarNova').onclick = () => location.reload();
});

socket.on('betCalled', ({ challenger, level }) => {
  trucoDisplay.textContent = level.toUpperCase();
  btnTruco.classList.add('oculto');
  btnCorrer.classList.remove('oculto');
  aguardandoResposta = true;
  audioTruco.play().catch(e => console.warn('Áudio truco:', e));
});

socket.on('betAccepted', ({ handValue }) => {
  trucoStatus.textContent = `Truco: ${handValue} pts`;
  btnCorrer.classList.remove('oculto');
  btnTruco.classList.remove('oculto');
  aguardandoResposta = false;
});

socket.on('turnToRespond', () => {});

socket.on('playerLeft', () => {
  clearTurnTimer();
  alert('Oponente saiu do jogo.');
  location.reload();
});

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

// Cria HTML de carta com valor central grande + cantos
function createCardHTML(card) {
  const suitSym = suitSymbol(card.suit);
  const corClasse = (card.suit === 'copas' || card.suit === 'ouros') ? 'naipe-vermelho' : 'naipe-preto';
  return `
    <div class="carta-corner top-left ${corClasse}">${card.rank}${suitSym}</div>
    <div class="carta-center ${corClasse}">${card.rank}${suitSym}</div>
    <div class="carta-corner bottom-right ${corClasse}">${card.rank}${suitSym}</div>
  `;
}

function renderizarMao(hand) {
  maoDiv.innerHTML = '';
  hand.forEach((c, idx) => {
    const carta = document.createElement('div');
    carta.className = 'carta playerCard';
    carta.setAttribute('data-index', idx);
    carta.innerHTML = createCardHTML(c);
    carta.style.pointerEvents = 'auto';
    carta.addEventListener('click', () => {
      if (!isMyTurn || !gameActive) return;
      socket.emit('playCard', c);
      clearTurnTimer();
    });
    maoDiv.appendChild(carta);
  });
}

// --- Cronômetro ---
function startTurnTimer() {
  clearTurnTimer();
  cronometroEl.classList.add('oculto');
  timeLeft = 25;
  cronometroNum.textContent = '';
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
  mensagemEl.textContent = texto;
  mensagemEl.style.display = 'block';
  setTimeout(() => { mensagemEl.style.display = 'none'; }, 3000);
}

function esconderMensagem() {
  mensagemEl.style.display = 'none';
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}