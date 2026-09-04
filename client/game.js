const socket = io(window.location.origin);

// Lobby
const lobbyDiv = document.getElementById('lobby');
const gameWrapper = document.getElementById('gameWrapper');
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const roomsListEl = document.getElementById('roomsList');
const contagemEl = document.getElementById('contagemRegressiva');
const contagemNumero = document.getElementById('contagemNumero');
const roomVisibilityEl = document.getElementById('roomVisibility');
const roomFillBotsEl = document.getElementById('roomFillBots');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinCodeBtn = document.getElementById('joinCodeBtn');
const randomMatchBtn = document.getElementById('randomMatchBtn');

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
let currentHandValue = 1;
let myNickname = '';
let isMaoDe11Decision = false;
let isMaoDeFerro = false;
let currentBetLevel = null;
let lastBetTeam = null;
let isRespondingToBet = false;
let renderedRound = -1;
let renderGeneration = 0;

// Sistema de autenticação - usar nickname do auth
document.addEventListener('user-authenticated', (e) => {
  if (e.detail && e.detail.nickname) {
    myNickname = e.detail.nickname;
    if (nameInput && !nameInput.value) nameInput.value = myNickname;
    const p0avatar = document.querySelector('#p0 .avatar');
    if (p0avatar) p0avatar.textContent = e.detail.avatar || myNickname.charAt(0).toUpperCase();
  }
});

// ========== INDICADOR DE VEZ ==========
const turnIndicator = document.createElement('div');
turnIndicator.id = 'turnIndicator';
document.body.appendChild(turnIndicator);

function posicionarSeta(currentPlayer) {
  if (!gameActive || currentPlayer === undefined || currentPlayer === null || myPlayerIndex === null) {
    turnIndicator.classList.remove('visible');
    return;
  }
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
  const rotations = [0, 90, 180, -90];
  turnIndicator.style.left = rect.left + rect.width / 2 + 'px';
  turnIndicator.style.top = rect.top + rect.height / 2 + 'px';
  turnIndicator.style.transform = `translate(-50%, -50%) rotate(${rotations[visualPos]}deg)`;
  turnIndicator.classList.add('visible');
}

function esconderSeta() {
  turnIndicator.classList.remove('visible');
}

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
  const options = {
    visibility: roomVisibilityEl?.value || 'public',
    fillWithBots: roomFillBotsEl ? roomFillBotsEl.checked : true
  };
  socket.emit('createRoom', { playerName: name, options }, (res) => {
    if (res?.error) return alert(res.error);
    currentGameCode = res.roomCode;
    enterWaitingRoom(res);
  });
};

function joinRoomFromList(code) {
  const name = nameInput.value.trim() || 'Jogador';
  socket.emit('joinRoom', { roomCode: code, playerName: name }, (res) => {
    if (res?.error) return alert(res.error);
    currentGameCode = res.roomCode;
    enterWaitingRoom(res);
  });
}

if (joinCodeBtn) {
  joinCodeBtn.onclick = () => {
    const code = roomCodeInput?.value.trim().toUpperCase();
    if (!code) return alert('Informe o código da sala.');
    joinRoomFromList(code);
  };
}

if (randomMatchBtn) {
  randomMatchBtn.onclick = () => {
    const name = nameInput.value.trim() || 'Jogador';
    socket.emit('randomMatch', { playerName: name }, (res) => {
      if (res?.error) return alert(res.error);
      if (res?.createNew) {
        const options = { visibility: 'public', fillWithBots: true };
        socket.emit('createRoom', { playerName: name, options }, (createRes) => {
          if (createRes?.error) return alert(createRes.error);
          currentGameCode = createRes.roomCode;
          enterWaitingRoom(createRes);
        });
        return;
      }
      currentGameCode = res.roomCode;
      enterWaitingRoom(res);
    });
  };
}

function enterWaitingRoom(res) {
  lobbyDiv.classList.add('game-hidden');
  gameWrapper.classList.remove('game-hidden');
  contagemEl.classList.remove('oculto');
  contagemNumero.textContent = '15';
  maoDiv.innerHTML = '';
  mesaCartas.innerHTML = '';
  viraEl.classList.add('oculto');
  btnTruco.classList.add('oculto');
  btnCorrer.classList.add('oculto');
  telaFinal.classList.remove('show');
  esconderSeta();
}

socket.on('connect', () => socket.emit('getRooms'));

socket.on('roomsUpdate', (rooms) => {
  if (!roomsListEl) return;
  roomsListEl.innerHTML = '';
  if (!rooms.length) {
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
  if (!contagemNumero || gameActive) return;
  contagemNumero.textContent = String(Math.max(0, count));
  if (count <= 0) contagemEl.classList.add('oculto');
});

function resetOpponentHands(handsRemaining = [3, 3, 3, 3]) {
  for (let visual = 1; visual <= 3; visual++) {
    const el = HAND_SLOTS[visual];
    if (!el) continue;
    el.innerHTML = '';
    const realPlayer = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex)[visual];
    const remaining = Math.max(0, Math.min(3, handsRemaining?.[realPlayer] ?? 3));
    for (let i = 0; i < remaining; i++) {
      const carta = document.createElement('div');
      carta.className = 'carta virada';
      el.appendChild(carta);
    }
  }
}

function updatePlayerNames(players) {
  if (!Array.isArray(players) || myPlayerIndex === null) return;
  const rotatedPlayers = rotateArrayForPlayer(players, myPlayerIndex);
  for (let i = 0; i < 4; i++) {
    const slotEl = nomesSlots[SLOT_ORDER[i]];
    const player = rotatedPlayers[i];
    if (slotEl) slotEl.textContent = (player?.name || '') + (player?.isBot ? ' (Bot)' : '');
  }
}

function addTableCard(player, card, round, hidden = false) {
  if (!card || player === undefined || player === null) return;
  const existing = mesaCartas.querySelector(`[data-card-player="${player}"][data-card-round="${round}"]`);
  if (existing) return;

  const rotatedPlayers = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
  const relPos = rotatedPlayers.indexOf(player);
  const posicoes = ['c0', 'c3', 'c2', 'c1'];
  const cartaDiv = document.createElement('div');
  cartaDiv.className = `cartaMesa ${posicoes[relPos >= 0 ? relPos : player]}`;
  cartaDiv.dataset.cardPlayer = String(player);
  cartaDiv.dataset.cardRound = String(round);
  cartaDiv.innerHTML = hidden ? '<div class="carta virada"></div>' : createCardHTML(card);
  mesaCartas.appendChild(cartaDiv);
}

function renderCurrentRound(roundCards, round) {
  mesaCartas.innerHTML = '';
  renderedRound = round;
  const current = roundCards?.[round] || [];
  for (let player = 0; player < 4; player++) {
    const card = current[player];
    if (card) addTableCard(player, card, round, isMaoDeFerro);
  }
}

// ========== GAME EVENTS ==========
socket.on('handStart', (data) => {
  renderGeneration++;
  renderedRound = 0;
  gameActive = true;
  playerHand = Array.isArray(data.hand) ? data.hand.slice() : [];
  myPlayerIndex = data.player;
  currentHandValue = data.handValue;
  isMaoDeFerro = Boolean(data.maoDeFerro);
  lastBetTeam = null;
  currentBetLevel = null;
  aguardandoResposta = false;
  isRespondingToBet = false;
  isMaoDe11Decision = Boolean(data.maoDe11 && data.turnStage === 'mao11Decision' && !data.maoDe11DecisionMade && data.player % 2 === data.maoDe11Team);

  updatePlayerNames(data.players);
  resetOpponentHands([3, 3, 3, 3]);
  renderizarMao(playerHand, !isMaoDeFerro);

  teamAScoreEl.textContent = data.scores[0];
  teamBScoreEl.textContent = data.scores[1];
  infoRodadaEl.textContent = 'Rodada 1 de 3';
  trucoStatusEl.textContent = data.maoDeFerro ? 'Mão de Ferro' : data.maoDe11 ? 'Mão de 11' : 'Truco: Nenhum';
  isMyTurn = data.currentPlayer === myPlayerIndex;
  posicionarSeta(data.currentPlayer);

  viraEl.classList.remove('oculto', 'virada');
  viraEl.innerHTML = createCardHTML(data.vira);
  mesaCartas.innerHTML = '';
  painelHistorico.querySelectorAll('.bolinha-rodada').forEach(b => b.className = 'bolinha-rodada bolinha-branca');
  audioDistribuir?.play().catch(() => {});
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
  atualizarInfoLive();
});

socket.on('gameStateRestore', (data) => {
  if (!data || myPlayerIndex === null || data.player !== myPlayerIndex) myPlayerIndex = data?.player ?? myPlayerIndex;
  if (myPlayerIndex === null || !Array.isArray(data?.players)) return;

  renderGeneration++;
  gameActive = true;
  currentGameCode = data.roomCode || currentGameCode;
  playerHand = Array.isArray(data.hand) ? data.hand.slice() : [];
  currentHandValue = data.handValue ?? 1;
  isMaoDeFerro = Boolean(data.maoDeFerro);
  isMaoDe11Decision = Boolean(data.maoDe11 && data.turnStage === 'mao11Decision' && !data.maoDe11DecisionMade && myPlayerIndex % 2 === data.maoDe11Team);
  aguardandoResposta = data.turnStage === 'respond';
  isRespondingToBet = Boolean(data.betState && myPlayerIndex % 2 === data.betState.responderTeam);
  currentBetLevel = data.betState?.level || null;
  lastBetTeam = data.betState ? data.betState.challenger % 2 : null;

  lobbyDiv.classList.add('game-hidden');
  gameWrapper.classList.remove('game-hidden');
  contagemEl.classList.add('oculto');
  telaFinal.classList.remove('show');
  updatePlayerNames(data.players);
  resetOpponentHands(data.handsRemaining || [3, 3, 3, 3]);
  renderizarMao(playerHand, !isMaoDeFerro);

  teamAScoreEl.textContent = data.scores?.[0] ?? 0;
  teamBScoreEl.textContent = data.scores?.[1] ?? 0;
  infoRodadaEl.textContent = `Rodada ${(data.currentRound ?? 0) + 1} de 3`;
  trucoStatusEl.textContent = data.maoDeFerro ? 'Mão de Ferro' : data.maoDe11 ? 'Mão de 11' : `Truco: ${currentHandValue} pts`;
  viraEl.classList.remove('oculto', 'virada');
  viraEl.innerHTML = createCardHTML(data.vira);
  renderCurrentRound(data.roundCards || [], data.currentRound ?? 0);

  isMyTurn = data.currentPlayer === myPlayerIndex && data.turnStage === 'play';
  posicionarSeta(data.currentPlayer);
  clearTurnTimer();

  if (isMaoDe11Decision) mostrarControlesMaoDe11();
  else if (isRespondingToBet) {
    btnCorrer.classList.remove('oculto');
    atualizarBotaoTruco();
  } else if (isMyTurn) {
    btnCorrer.classList.remove('oculto');
    atualizarBotaoTruco();
    startTurnTimer();
  } else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }
  atualizarInfoLive();
});

socket.on('playerStatus', (players) => updatePlayerNames(players));

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
  clearTurnTimer();
  if (isMyTurn) {
    btnCorrer.classList.remove('oculto');
    atualizarBotaoTruco();
    startTurnTimer();
  } else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }
  atualizarInfoLive();
});

socket.on('turn', ({ currentPlayer }) => {
  if (isMaoDe11Decision) return;
  isMyTurn = currentPlayer === myPlayerIndex;
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

socket.on('cardPlayed', ({ player, card, round }) => {
  if (player === myPlayerIndex) {
    const idx = playerHand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx !== -1) {
      playerHand.splice(idx, 1);
      renderizarMao(playerHand, !isMaoDeFerro);
    }
    clearTurnTimer();
  } else {
    const rotatedPlayers = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
    const relIndex = rotatedPlayers.indexOf(player);
    if (relIndex > 0) {
      const handEl = HAND_SLOTS[relIndex];
      if (handEl?.lastElementChild) handEl.removeChild(handEl.lastElementChild);
    }
  }

  const effectiveRound = Number.isInteger(round) ? round : Math.max(0, renderedRound);
  if (renderedRound !== effectiveRound && renderedRound !== -1) {
    mesaCartas.innerHTML = '';
    renderedRound = effectiveRound;
  }
  addTableCard(player, card, effectiveRound, isMaoDeFerro);
  audioCarta?.play().catch(() => {});
});

socket.on('roundResult', ({ round, winner }) => {
  infoRodadaEl.textContent = round >= 2 ? 'Mão encerrada' : `Rodada ${round + 2} de 3`;
  const bolinhas = painelHistorico.querySelectorAll('.bolinha-rodada');
  if (bolinhas[round]) {
    let corClasse = 'bolinha-ouro';
    if (winner !== -1) corClasse = winner % 2 === myPlayerIndex % 2 ? 'bolinha-verde' : 'bolinha-azul';
    bolinhas[round].className = 'bolinha-rodada ' + corClasse;
  }

  const generationAtSchedule = renderGeneration;
  setTimeout(() => {
    if (generationAtSchedule !== renderGeneration || renderedRound !== round) return;
    mesaCartas.innerHTML = '';
  }, 1200);
});

socket.on('handEnd', ({ winnerTeam, points, scores }) => {
  gameActive = false;
  isMaoDe11Decision = false;
  isMaoDeFerro = false;
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  lastBetTeam = null;
  isMyTurn = false;
  clearTurnTimer();
  teamAScoreEl.textContent = scores[0];
  teamBScoreEl.textContent = scores[1];
  if (points === 6) audioSeis?.play().catch(() => {});
  else if (points === 9) audioNove?.play().catch(() => {});
  else if (points === 12) audioDoze?.play().catch(() => {});
  btnTruco.classList.add('oculto');
  btnCorrer.classList.add('oculto');
  maoDiv.innerHTML = '';
  hand1.innerHTML = '';
  hand2.innerHTML = '';
  hand3.innerHTML = '';
  mesaCartas.innerHTML = '';
  viraEl.classList.add('oculto');
  if (winnerTeam !== -1) {
    mostrarMensagem(winnerTeam === myPlayerIndex % 2 ? 'Seu time ganhou a mão!' : 'Time adversário ganhou a mão.');
  } else {
    mostrarMensagem('Mão empatada — ninguém pontua.');
  }
  esconderSeta();
  atualizarInfoLive();
});

socket.on('setStart', ({ scores, setWins }) => {
  teamAScoreEl.textContent = scores?.[0] ?? 0;
  teamBScoreEl.textContent = scores?.[1] ?? 0;
  mostrarMensagem(`Novo set — ${setWins?.[0] ?? 0} x ${setWins?.[1] ?? 0}`);
});

socket.on('matchOver', ({ winnerTeam, reason }) => {
  gameActive = false;
  isMaoDe11Decision = false;
  isMaoDeFerro = false;
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  lastBetTeam = null;
  isMyTurn = false;
  clearTurnTimer();
  contagemEl.classList.add('oculto');
  telaFinal.classList.add('show');
  if (reason === 'all_offline') {
    textoFinal.textContent = 'PARTIDA ENCERRADA';
    resumoFinal.textContent = 'Todos os jogadores ficaram offline.';
  } else {
    textoFinal.textContent = winnerTeam === myPlayerIndex % 2 ? 'VOCÊ VENCEU A PARTIDA!' : 'VOCÊ PERDEU A PARTIDA!';
    resumoFinal.textContent = 'Clique em Voltar ao Lobby para jogar novamente.';
  }
  document.getElementById('btnVoltarLobby').onclick = () => location.reload();
  document.getElementById('btnBuscarNova').onclick = () => location.reload();
  esconderSeta();
});

function handleBetChallenge({ level, responderTeam, challenger }) {
  if (isMaoDe11Decision) return;
  currentBetLevel = level;
  lastBetTeam = challenger % 2;
  aguardandoResposta = true;
  isRespondingToBet = responderTeam === myPlayerIndex % 2;
  if (isRespondingToBet) {
    btnCorrer.classList.remove('oculto');
    atualizarBotaoTruco();
  } else {
    btnTruco.classList.add('oculto');
    btnCorrer.classList.add('oculto');
  }
}

socket.on('betCalled', (data) => {
  handleBetChallenge(data);
  const audioByLevel = { truco: audioTruco, retruco: audioSeis, valenove: audioNove, valedoze: audioDoze };
  (audioByLevel[data.level] || audioTruco)?.play().catch(() => {});
});

socket.on('betRaised', handleBetChallenge);

socket.on('turnToRespond', ({ responderTeam }) => {
  if (isMaoDe11Decision) return;
  isRespondingToBet = responderTeam === myPlayerIndex % 2;
  aguardandoResposta = true;
  atualizarBotaoTruco();
  if (isRespondingToBet) btnCorrer.classList.remove('oculto');
});

socket.on('betAccepted', ({ handValue }) => {
  if (isMaoDe11Decision) return;
  currentHandValue = handValue;
  trucoStatusEl.textContent = `Truco: ${handValue} pts`;
  btnCorrer.classList.remove('oculto');
  aguardandoResposta = false;
  isRespondingToBet = false;
  currentBetLevel = null;
  if (isMyTurn) {
    atualizarBotaoTruco();
    startTurnTimer();
  }
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
  if (!gameActive || isMaoDe11Decision || isMaoDeFerro) {
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

  if (currentHandValue >= 3 && lastBetTeam === myPlayerIndex % 2) {
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
    if (!canRaise) socket.emit('respondBet', 'accept');
    else {
      const aumentar = !window.confirm('OK = Aceitar\nCancelar = Aumentar aposta');
      let raiseTo = 'retruco';
      if (currentBetLevel === 'retruco') raiseTo = 'valenove';
      else if (currentBetLevel === 'valenove') raiseTo = 'valedoze';
      socket.emit('respondBet', aumentar ? raiseTo : 'accept');
    }
    aguardandoResposta = false;
    isRespondingToBet = false;
    clearTurnTimer();
    return;
  }
  if (!isMyTurn || aguardandoResposta || isMaoDeFerro) return;
  let betType = 'truco';
  if (currentHandValue >= 9) betType = 'valedoze';
  else if (currentHandValue >= 6) betType = 'valenove';
  else if (currentHandValue >= 3) betType = 'retruco';
  socket.emit('callBet', betType);
  clearTurnTimer();
};

btnCorrer.onclick = () => {
  if (!gameActive) return;
  if (isMaoDe11Decision) socket.emit('respondMaoDe11', 'flee');
  else if (isRespondingToBet) socket.emit('respondBet', 'flee');
  else {
    if (!isMyTurn || isMaoDeFerro) return;
    socket.emit('fleeHand');
  }
  clearTurnTimer();
};

function atualizarInfoLive() {
  if (!gameActive) return;
  const base = infoRodadaEl.textContent.replace(/<span.*<\/span>/, '').trim();
  infoRodadaEl.innerHTML = base + (isMaoDe11Decision
    ? ' <span style="color:#f1c40f;">⚠️ Decida a Mão de 11</span>'
    : isMyTurn
      ? ' <span style="color:#5cb85c;">🎯 Sua vez!</span>'
      : ' <span style="color:#f1c40f;">⏳ Aguardando oponente</span>');
}

function renderizarMao(hand, faceUp = true) {
  maoDiv.innerHTML = '';
  hand.forEach((c) => {
    const carta = document.createElement('div');
    carta.className = faceUp ? 'carta playerCard' : 'carta playerCard virada';
    if (faceUp) carta.innerHTML = createCardHTML(c);
    carta.style.pointerEvents = 'auto';
    carta.dataset.cardKey = `${c.suit}:${c.rank}`;
    carta.addEventListener('click', () => {
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
  if (!texto || !toastEl) return;
  toastEl.textContent = texto;
  toastEl.style.display = 'block';
  setTimeout(() => { toastEl.style.display = 'none'; }, 3000);
}

function suitSymbol(suit) {
  const map = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
  return map[suit] || suit;
}
