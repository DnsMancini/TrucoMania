const socket = io(window.location.origin);

// Lobby
const lobbyDiv = document.getElementById('lobby');
const gameWrapper = document.getElementById('gameWrapper');
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
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
let myNickname = '';
let isMaoDe11Decision = false;

// Sistema de autenticação - usar nickname do auth
document.addEventListener('user-authenticated', (e) => {
  if (e.detail && e.detail.nickname) {
    myNickname = e.detail.nickname;
    // Preencher input do nome se vazio
    if (nameInput && !nameInput.value) {
      nameInput.value = myNickname;
    }
    // Atualizar avatar/display se necessário
    const p0avatar = document.querySelector('#p0 .avatar');
    if (p0avatar) {
      p0avatar.textContent = e.detail.avatar || myNickname.charAt(0).toUpperCase();
    }
  }
});

let isRespondingToBet = false;
let currentBetLevel = null;
let lastBetTeam = null;

// ========== INDICADOR DE VEZ (seta dinâmica) ==========
const turnIndicator = document.createElement('div');
turnIndicator.id = 'turnIndicator';
document.body.appendChild(turnIndicator);

function posicionarSeta(currentPlayer) {
  if (!gameActive || currentPlayer === undefined || currentPlayer === null || myPlayerIndex === null) {
    turnIndicator.classList.remove('visible');
    return;
  }

  // Mapear índice original do jogador para posição visual (após rotação)
  const rotated = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
  const visualPos = rotated.indexOf(currentPlayer);
  if (visualPos < 0) {
    turnIndicator.classList.remove('visible');
    return;
  }

  const slotId = SLOT_ORDER[visualPos];
  const slot = document.getElementById(slotId);
  if (!slot) {
    turnIndicator.classList.remove('visible');
    return;
  }

  const rect = slot.getBoundingClientRect();
  const indicatorX = rect.left + rect.width / 2;
  const indicatorY = rect.top + rect.height / 2;
  const rotations = [0, 90, 180, -90];

  turnIndicator.style.left = indicatorX + 'px';
  turnIndicator.style.top = indicatorY + 'px';
  turnIndicator.style.transform = `translate(-50%, -50%) rotate(${rotations[visualPos]}deg)`;
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
    roomsListEl.innerHTML = '<div class="lobby-empty">Nenhuma sala disponível no momento</div>';
    return;
  }
  rooms.forEach(room => {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `
      <div class="room-item-main">
        <div class="room-tier">Mesa competitiva</div>
        <strong class="room-code">Sala ${room.code}</strong>
        <div class="room-meta">${room.players}/4 jogadores <span class="room-live-dot"></span> Ao vivo</div>
      </div>
      <button class="join-room-btn">Entrar</button>
    `;
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
  lastBetTeam = null;
  isMaoDe11Decision = Boolean(data.maoDe11 && data.turnStage === 'mao11Decision' && !data.maoDe11DecisionMade && data.player % 2 === data.maoDe11Team);

  const rotatedPlayers = rotateArrayForPlayer(data.players, myPlayerIndex);
  for (let i = 0; i < 4; i++) {
    const slotEl = nomesSlots[SLOT_ORDER[i]];
    const player = rotatedPlayers[i];
    if (slotEl) slotEl.textContent = (player?.name || '') + (player?.isBot ? ' (Bot)' : '');
  }

  for (let i = 1; i <= 3; i++) {
    HAND_SLOTS[i].innerHTML = '';
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
  trucoStatusEl.textContent = data.maoDe11 ? 'Mão de 11' : 'Truco: Nenhum';
  isMyTurn = (data.currentPlayer === myPlayerIndex);
  posicionarSeta(data.currentPlayer);
  atualizarInfoLive();

  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  viraEl.classList.remove('oculto', 'virada');
  viraEl.innerHTML = createCardHTML(data.vira);
  mesaCartas.innerHTML = '';

  painelHistorico.querySelectorAll('.bolinha-rodada').forEach(b => {
    b.className = 'bolinha-rodada bolinha-branca';
  });

  audioDistribuir.play().catch(e => {});
  clearTurnTimer();

  if (isMaoDe11Decision) {
    mostrarControlesMaoDe11();
  } else if (isMyTurn) {
    btnCorrer.classList.remove('oculto');
    atualizarBotaoTruco();
    startTurnTimer();
  } else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }
});

socket.on('maoDe11Decision', ({ team }) => {
  isMaoDe11Decision = gameActive && myPlayerIndex !== null && myPlayerIndex % 2 === team;
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  clearTurnTimer();
  if (isMaoDe11Decision) mostrarControlesMaoDe11();
  else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }
  atualizarInfoLive();
});

socket.on('maoDe11Started', ({ handValue, currentPlayer }) => {
  isMaoDe11Decision = false;
  currentHandValue = handValue;
  trucoStatusEl.textContent = `Truco: ${handValue} pts`;
  posicionarSeta(currentPlayer);
  isMyTurn = currentPlayer === myPlayerIndex;
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  btnCorrer.classList.remove('oculto');
  if (isMyTurn) {
    atualizarBotaoTruco();
    startTurnTimer();
  } else {
    btnTruco.classList.add('oculto');
    clearTurnTimer();
  }
  atualizarInfoLive();
});

socket.on('turn', ({ currentPlayer }) => {
  if (isMaoDe11Decision) return;
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
      if (handEl && handEl.children.length > 0) handEl.removeChild(handEl.lastChild);
    }
  }

  const rotatedPlayers = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
  const relPos = rotatedPlayers.indexOf(player);
  const posicoes = ['c0', 'c3', 'c2', 'c1'];
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
    if (winner !== -1) corClasse = (winner % 2 === myPlayerIndex % 2) ? 'bolinha-verde' : 'bolinha-azul';
    bolinhas[round].className = 'bolinha-rodada ' + corClasse;
  }
  setTimeout(() => { mesaCartas.innerHTML = ''; }, 1200);
});

socket.on('handEnd', ({ winnerTeam, points, scores }) => {
  gameActive = false;
  isMaoDe11Decision = false;
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  lastBetTeam = null;
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
  isMaoDe11Decision = false;
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  lastBetTeam = null;
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

socket.on('betCalled', ({ level, responderTeam, challenger }) => {
  if (isMaoDe11Decision) return;
  currentBetLevel = level;
  lastBetTeam = challenger % 2;
  aguardandoResposta = true;
  isRespondingToBet = responderTeam === (myPlayerIndex % 2);

  if (isRespondingToBet) {
    btnCorrer.classList.remove('oculto');
    atualizarBotaoTruco();
  } else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }

  const audioByLevel = { truco: audioTruco, retruco: audioSeis, valenove: audioNove, valedoze: audioDoze };
  const selectedAudio = audioByLevel[level] || audioTruco;
  selectedAudio.play().catch(() => {});
});

socket.on('turnToRespond', () => {
  if (isMaoDe11Decision) return;
  isRespondingToBet = true;
  atualizarBotaoTruco();
  btnCorrer.classList.remove('oculto');
});

socket.on('betAccepted', ({ handValue }) => {
  if (isMaoDe11Decision) return;
  currentHandValue = handValue;
  trucoStatusEl.textContent = `Truco: ${handValue} pts`;
  btnCorrer.classList.remove('oculto');
  if (isMyTurn && !aguardandoResposta) atualizarBotaoTruco();
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  atualizarInfoLive();
});

// ========== BOTÕES ==========
function mostrarControlesMaoDe11() {
  btnTruco.classList.remove('oculto');
  btnTruco.textContent = 'JOGAR MÃO DE 11';
  btnCorrer.classList.remove('oculto');
  clearTurnTimer();
}

function atualizarBotaoTruco() {
  if (!gameActive || isMaoDe11Decision) {
    if (isMaoDe11Decision) mostrarControlesMaoDe11();
    else btnTruco.classList.add('oculto');
    return;
  }

  if (isRespondingToBet) {
    btnTruco.classList.remove('oculto');
    const raiseLabel = currentBetLevel === 'truco' ? 'AUMENTAR PARA 6' : currentBetLevel === 'retruco' ? 'AUMENTAR PARA 9' : currentBetLevel === 'valenove' ? 'AUMENTAR PARA 12' : '';
    btnTruco.textContent = currentBetLevel === 'valedoze' ? 'ACEITAR' : `ACEITAR / ${raiseLabel}`;
    return;
  }

  if (aguardandoResposta || !isMyTurn) {
    btnTruco.classList.add('oculto');
    return;
  }

  if (currentHandValue >= 3 && lastBetTeam === (myPlayerIndex % 2)) {
    btnTruco.classList.add('oculto');
    return;
  }

  btnTruco.classList.remove('oculto');
  if (currentHandValue >= 12) btnTruco.classList.add('oculto');
  else if (currentHandValue >= 9) btnTruco.textContent = 'VALE DOZE';
  else if (currentHandValue >= 6) btnTruco.textContent = 'VALE NOVE';
  else if (currentHandValue >= 3) btnTruco.textContent = 'RETRUCO';
  else btnTruco.textContent = 'TRUCO';
}

btnTruco.onclick = () => {
  if (!gameActive) return;

  if (isMaoDe11Decision) {
    socket.emit('respondMaoDe11', 'play');
    clearTurnTimer();
    return;
  }

  if (isRespondingToBet) {
    const canRaise = currentBetLevel === 'truco' || currentBetLevel === 'retruco' || currentBetLevel === 'valenove';
    if (!canRaise) {
      socket.emit('respondBet', 'accept');
    } else {
      const aumentar = !window.confirm('OK = Aceitar\nCancelar = Aumentar aposta');
      let raiseTo = 'retruco';
      if (currentBetLevel === 'retruco') raiseTo = 'valenove';
      else if (currentBetLevel === 'valenove') raiseTo = 'valedoze';
      socket.emit('respondBet', aumentar ? raiseTo : 'accept');
    }
    clearTurnTimer();
    return;
  }

  if (!isMyTurn || aguardandoResposta) return;
  let betType = 'truco';
  if (currentHandValue >= 9) betType = 'valedoze';
  else if (currentHandValue >= 6) betType = 'valenove';
  else if (currentHandValue >= 3) betType = 'retruco';
  socket.emit('callBet', betType);
  clearTurnTimer();
};

btnCorrer.onclick = () => {
  if (!gameActive) return;
  if (isMaoDe11Decision) {
    socket.emit('respondMaoDe11', 'flee');
  } else if (isRespondingToBet) {
    socket.emit('respondBet', 'flee');
  } else {
    if (!isMyTurn) return;
    socket.emit('fleeHand');
  }
  clearTurnTimer();
};

// ========== FUNÇÕES AUXILIARES ==========
function atualizarInfoLive() {
  if (!gameActive) return;
  const base = infoRodadaEl.textContent.replace(/<span.*<\/span>/, '').trim();
  infoRodadaEl.innerHTML = base + (isMaoDe11Decision
    ? ' <span style="color:#f1c40f;">⚠️ Decida a Mão de 11</span>'
    : isMyTurn
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
      if (!isMyTurn || !gameActive || isMaoDe11Decision) return;
      socket.emit('playCard', c);
      clearTurnTimer();
    });
    maoDiv.appendChild(carta);
  });
}

function startTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  timeLeft = 25;
  cronometroEl.classList.remove('oculto');
  cronometroNum.textContent = timeLeft;
  turnTimerInterval = setInterval(() => {
    timeLeft--;
    cronometroNum.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearTurnTimer();
      autoPlayRandomCard();
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
  if (!gameActive || !isMyTurn || isMaoDe11Decision || playerHand.length === 0) return;
  const idx = Math.floor(Math.random() * playerHand.length);
  socket.emit('playCard', playerHand[idx]);
}

function mostrarMensagem(texto) {
  if (texto && toastEl) {
    toastEl.textContent = texto;
    toastEl.style.display = 'block';
    setTimeout(() => { toastEl.style.display = 'none'; }, 3000);
  }
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}
