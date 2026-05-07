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
  btnCorrer.classList.add('oculto');
  aguardandoResposta = false;
  viraEl.classList.remove('oculto');
  viraEl.innerHTML = `<span class="center ${data.vira.suit === 'copas' || data.vira.suit === 'ouros' ? 'naipe-vermelho' : 'naipe-preto'}">${data.vira.rank}${suitSymbol(data.vira.suit)}</span>`;
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
});

socket.on('turn', ({ currentPlayer }) => {
  isMyTurn = (currentPlayer === myPlayerIndex);
  if (!aguardandoResposta) {
    if (currentPlayer === myPlayerIndex) {
      btnTruco.classList.remove('oculto');
      btnCorrer.classList.add('oculto');
    } else {
      btnTruco.classList.add('oculto');
      btnCorrer.classList.add('oculto');
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
  } else {
    const handEl = player === 1 ? hand1 : player === 2 ? hand2 : hand3;
    if (handEl.children.length > 0) handEl.removeChild(handEl.lastChild);
  }
  const posicoes = ['c0', 'c1', 'c2', 'c3'];
  const cartaDiv = document.createElement('div');
  cartaDiv.className = `cartaMesa ${posicoes[player]}`;
  const corClasse = (card.suit === 'copas' || card.suit === 'ouros') ? 'naipe-vermelho' : 'naipe-preto';
  cartaDiv.innerHTML = `<span class="center ${corClasse}">${card.rank}${suitSymbol(card.suit)}</span>`;
  mesaCartas.appendChild(cartaDiv);
  audioCarta.play().catch(e => console.warn('Áudio carta:', e));
});

socket.on('roundResult', ({ round, winner }) => {
  // Atualiza informação de rodada (simples)
  infoRodada.textContent = `Rodada ${round + 2} de 3`; // round 0 -> Rodada 2 de 3
  const bolinhas = painelHistorico.querySelectorAll('.bolinha-rodada');
  if (bolinhas[round]) {
    bolinhas[round].className = 'bolinha-rodada bolinha-ouro';
  }
  setTimeout(() => { mesaCartas.innerHTML = ''; }, 1200);
});

socket.on('handEnd', ({ winnerTeam, points, scores }) => {
  gameActive = false;
  aguardandoResposta = false;
  isMyTurn = false;
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
  btnCorrer.classList.add('oculto');
  btnTruco.classList.remove('oculto');
  aguardandoResposta = false;
});

socket.on('turnToRespond', () => {});

socket.on('playerLeft', () => {
  alert('Oponente saiu do jogo.');
  location.reload();
});

btnTruco.onclick = () => socket.emit('callBet', 'truco');
btnCorrer.onclick = () => socket.emit('respondBet', 'flee');

function renderizarMao(hand) {
  maoDiv.innerHTML = '';
  hand.forEach((c, idx) => {
    const carta = document.createElement('div');
    carta.className = 'carta playerCard';
    carta.setAttribute('data-index', idx);
    const corClasse = (c.suit === 'copas' || c.suit === 'ouros') ? 'naipe-vermelho' : 'naipe-preto';
    carta.innerHTML = `<span class="center ${corClasse}">${c.rank}${suitSymbol(c.suit)}</span>`;
    carta.style.pointerEvents = 'auto';
    carta.addEventListener('click', () => {
      if (!isMyTurn || !gameActive) return;
      socket.emit('playCard', c);
      // Não removemos a carta aqui – aguardamos confirmação do servidor
    });
    maoDiv.appendChild(carta);
  });
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