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
const teamAScoreEl = document.getElementById('teamAScore');
const teamBScoreEl = document.getElementById('teamBScore');
const setAScoreEl = document.getElementById('setAScore');
const setBScoreEl = document.getElementById('setBScore');
const trucoStatusEl = document.getElementById('trucoStatus');
const infoRodadaEl = document.getElementById('infoRodada');
const btnTruco = document.getElementById('btnTruco');
const btnCorrer = document.getElementById('btnCorrer');
const viraEl = document.getElementById('vira');
const mesaCartas = document.getElementById('mesaCartas');
const hand1 = document.getElementById('hand1');
const hand2 = document.getElementById('hand2');
const hand3 = document.getElementById('hand3');
const maoDiv = document.getElementById('mao');
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

let myPlayerIndex = null;
let playerHand = [];
let gameActive = false;
let aguardandoResposta = false;
let isMyTurn = false;
let turnTimerInterval = null;
let timeLeft = 25;
let currentGameCode = null;

// ========== LOBBY FUNCTIONS ==========
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
    div.innerHTML = `
      <span>Sala ${room.code} (${room.players}/4 jogadores) ${room.status === 'playing' ? '(em jogo)' : ''}</span>
      <button class="join-room-btn">Entrar</button>
    `;
    div.querySelector('.join-room-btn').addEventListener('click', () => joinRoomFromList(room.code));
    roomsListEl.appendChild(div);
  });
});

socket.on('lobbyCountdown', ({ count }) => {
  contagemNumero.textContent = count;
  if (count <= 0) {
    contagemEl.classList.add('oculto');
  }
});

// ========== GAME EVENTS ==========
socket.on('handStart', (data) => {
  contagemEl.classList.add('oculto');
  gameActive = true;
  playerHand = data.hand;
  myPlayerIndex = data.player;
  isMyTurn = (data.currentPlayer === myPlayerIndex);
  renderizarMao(playerHand);
  teamAScoreEl.textContent = data.scores[0];
  teamBScoreEl.textContent = data.scores[1];
  setAScoreEl.textContent = data.setWins[0];
  setBScoreEl.textContent = data.setWins[1];
  infoRodadaEl.textContent = 'Rodada 1 de 3';
  trucoStatusEl.textContent = 'Truco: Nenhum';
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
  infoRodadaEl.textContent = `Rodada ${round + 2} de 3`;
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

socket.on('handEnd', ({ winnerTeam, points, scores, setWins }) => {
  gameActive = false;
  aguardandoResposta = false;
  isMyTurn = false;
  clearTurnTimer();
  teamAScoreEl.textContent = scores[0];
  teamBScoreEl.textContent = scores[1];
  setAScoreEl.textContent = setWins[0];
  setBScoreEl.textContent = setWins[1];
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

socket.on('setWin', ({ winnerTeam, setWins }) => {
  setAScoreEl.textContent = setWins[0];
  setBScoreEl.textContent = setWins[1];
  mostrarMensagem(winnerTeam === myPlayerIndex % 2 ? 'Set vencido!' : 'Set perdido!');
});

socket.on('matchOver', ({ winnerTeam, setWins }) => {
  aguardandoResposta = false;
  isMyTurn = false;
  clearTurnTimer();
  contagemEl.classList.add('oculto');
  telaFinal.classList.add('show');
  textoFinal.textContent = winnerTeam === myPlayerIndex % 2 ? 'VOCÊ VENCEU A PARTIDA!' : 'VOCÊ PERDEU A PARTIDA!';
  resumoFinal.textContent = `Placar final: ${setWins[0]} x ${setWins[1]}`;
  document.getElementById('btnVoltarLobby').onclick = () => location.reload();
  document.getElementById('btnBuscarNova').onclick = () => location.reload();
});

socket.on('betCalled', ({ challenger, level }) => {
  btnTruco.classList.add('oculto');
  btnCorrer.classList.remove('oculto');
  aguardandoResposta = true;
  audioTruco.play().catch(e => console.warn('Áudio truco:', e));
});

socket.on('betAccepted', ({ handValue }) => {
  trucoStatusEl.textContent = `Truco: ${handValue} pts`;
  btnCorrer.classList.remove('oculto');
  btnTruco.classList.remove('oculto');
  aguardandoResposta = false;
});

socket.on('turnToRespond', () => {});

socket.on('playerStatusUpdate', (players) => {
  if (!window.lastOnlineStatus) window.lastOnlineStatus = {};
  players.forEach((p, i) => {
    const slotKey = 'p' + i;
    const el = nomesSlots[slotKey];
    if (!el) return;
    el.textContent = (p.name || '') + (p.isBot ? ' (Bot)' : '') + (p.online ? '' : ' (Off)');
    el.className = p.online ? 'name' : 'name offline';
    
    const prevOnline = window.lastOnlineStatus[slotKey];
    if (prevOnline !== undefined && prevOnline !== p.online) {
      const msg = p.online ? `${p.name} está online` : `${p.name} está offline`;
      mostrarMensagem(msg);
    }
    window.lastOnlineStatus[slotKey] = p.online;
  });
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
  toastEl.textContent = texto;
  toastEl.style.display = 'block';
  setTimeout(() => {
    toastEl.style.display = 'none';
  }, 3000);
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}

function atualizarNomes(players) {
  for (let i = 0; i < 4; i++) {
    const el = nomesSlots['p' + i];
    if (el) {
      const p = players[i];
      el.textContent = (p?.name || '') + (p?.isBot ? ' (Bot)' : '') + (p?.online ? '' : ' (Off)');
      el.className = p?.online ? 'name' : 'name offline';
    }
  }
}