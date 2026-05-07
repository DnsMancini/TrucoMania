const SUITS = ['paus', 'copas', 'espadas', 'ouros'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

// Força base das cartas (sem manilha)
const RANK_STRENGTH = {
  '4': 1, '5': 2, '6': 3, '7': 4,
  'Q': 5, 'J': 6, 'K': 7, 'A': 8,
  '2': 9, '3': 10
};

// Ordem dos naipes para manilha
const SUIT_STRENGTH = {
  'ouros': 1,
  'espadas': 2,
  'copas': 3,
  'paus': 4
};

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function getManilhaRank(viraRank) {
  const idx = RANKS.indexOf(viraRank);
  const nextIdx = (idx + 1) % RANKS.length;
  return RANKS[nextIdx];
}

function cardStrength(card, viraRank) {
  if (!viraRank) return RANK_STRENGTH[card.rank];
  const manilhaRank = getManilhaRank(viraRank);
  if (card.rank === manilhaRank) {
    // Manilha: força base 10 + força do naipe (1-4)
    return 10 + SUIT_STRENGTH[card.suit];
  }
  return RANK_STRENGTH[card.rank];
}

function compareCards(card1, card2, viraRank) {
  const s1 = cardStrength(card1, viraRank);
  const s2 = cardStrength(card2, viraRank);
  if (s1 > s2) return 1;
  if (s1 < s2) return -1;
  return 0;
}

// Valores de aposta
const BET_VALUES = {
  truco: 3,
  retruco: 6,
  valequatro: 12
};

class Game2P {
  constructor(roomId, players, emit) {
    this.roomId = roomId;
    this.players = players; // [{ id: socketId, name }]
    this.emit = emit;       // função (event, data, to) onde to='all' ou socketId
    this.scores = [0, 0];
    this.dealerIndex = Math.floor(Math.random() * 2);
    this.handValue = 1;
    this.maoDe11 = false;
    this.deck = [];
    this.hands = [[], []];
    this.vira = null;
    this.currentPlayer = (this.dealerIndex + 1) % 2;
    this.turnStage = 'play'; // 'play' | 'respond'
    this.betState = null;    // { challenger, level, responder }
    this.roundCards = [[], []];
    this.roundWins = [0, 0];
    this.currentRound = 0;
    this.handStarted = false;
  }

  startGame() {
    this.startNewHand();
  }

  startNewHand() {
    this.deck = buildDeck();
    shuffle(this.deck);
    this.hands = [[], []];
    for (let i = 0; i < 3; i++) {
      this.hands[0].push(this.deck.pop());
      this.hands[1].push(this.deck.pop());
    }
    this.vira = this.deck.pop();

    // Mão de 11
    if (this.scores[0] >= 11 && this.scores[1] >= 11) {
      // Ambos com 11: mão especial (vale 6, sem aposta)
      this.handValue = 6;
      this.maoDe11 = true;
    } else if (this.scores[0] >= 11 || this.scores[1] >= 11) {
      this.handValue = 3;
      this.maoDe11 = true;
    } else {
      this.handValue = 1;
      this.maoDe11 = false;
    }

    this.currentPlayer = (this.dealerIndex + 1) % 2;
    this.turnStage = 'play';
    this.betState = null;
    this.roundWins = [0, 0];
    this.currentRound = 0;
    this.roundCards = [];

    // Envia mão para cada jogador
    // Envia mão para cada jogador
    for (let i = 0; i < 2; i++) {
      this.emit('handStart', {
      player: i,
    hand: this.hands[i],
    vira: this.vira,
    currentPlayer: this.currentPlayer,
    dealer: this.dealerIndex,
    handValue: this.handValue,
    scores: this.scores,
    maoDe11: this.maoDe11,
    // ADICIONE:
    players: this.players.map(p => p.name)  // array com nomes
  }, this.players[i].id);
}
  playCard(playerIndex, card) {
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return;
    const hand = this.hands[playerIndex];
    const cardIdx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIdx === -1) return;
    const played = hand.splice(cardIdx, 1)[0];

    // Adiciona à rodada atual
    if (!this.roundCards[this.currentRound]) {
      this.roundCards[this.currentRound] = [null, null];
    }
    this.roundCards[this.currentRound][playerIndex] = played;
    this.emit('cardPlayed', { player: playerIndex, card: played }, 'all');

    // Se ambos jogaram
    if (this.roundCards[this.currentRound][0] && this.roundCards[this.currentRound][1]) {
      this.resolveRound();
    } else {
      this.currentPlayer = (playerIndex + 1) % 2;
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
    }
  }

  resolveRound() {
    const round = this.roundCards[this.currentRound];
    const card0 = round[0];
    const card1 = round[1];
    const cmp = compareCards(card0, card1, this.vira.rank);

    let winner = null;
    if (cmp > 0) winner = 0;
    else if (cmp < 0) winner = 1;

    this.roundWins[winner]++;
    this.emit('roundResult', { round: this.currentRound, winner }, 'all');

    // Verifica se alguém ganhou a mão
    const winsRequired = 2;
    if (this.roundWins[0] >= winsRequired || this.roundWins[1] >= winsRequired) {
      this.endHand(winner);
      return;
    }

    // Se houve empate na rodada e ainda não acabou, próxima rodada começa com o próximo jogador (alternar)
    if (winner === null) {
      // Em caso de empate, o primeiro jogador da rodada atual começa a próxima
      // (quem iniciou essa rodada)
    } else {
      // Vencedor da rodada começa a próxima
      this.currentPlayer = winner;
    }

    this.currentRound++;
    this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
  }

  endHand(winner) {
    const points = this.handValue;
    this.scores[winner] += points;
    this.emit('handEnd', { winner, points, scores: this.scores }, 'all');

    // Verifica se o jogo acabou
    if (this.scores[winner] >= 12) {
      this.emit('gameOver', { winner, scores: this.scores }, 'all');
      return;
    }

    this.dealerIndex = (this.dealerIndex + 1) % 2;
    setTimeout(() => this.startNewHand(), 1500);
  }

  callBet(playerIndex, betType) {
    if (this.maoDe11) return;
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return;
    if (this.betState) {
      // Já existe aposta em andamento, não pode chamar nova
      return;
    }
    if (betType === 'truco' && this.handValue >= 3) return; // já vale 3
    if (betType === 'retruco' && this.handValue >= 6) return;
    if (betType === 'valequatro' && this.handValue >= 12) return;

    const challenger = playerIndex;
    const responder = (challenger + 1) % 2;
    this.betState = { challenger, level: betType, responder };
    this.turnStage = 'respond';
    this.emit('betCalled', { challenger, level: betType }, 'all');
    this.emit('turnToRespond', { responder }, this.players[responder].id);
  }

  respondBet(playerIndex, action) {
    if (this.turnStage !== 'respond') return;
    if (!this.betState) return;
    if (playerIndex !== this.betState.responder) return;

    const { challenger, level } = this.betState;

    if (action === 'flee') {
      // Quem chamou ganha o valor atual (antes de aceitar)
      const points = this.getBetValueBefore(level);
      this.scores[challenger] += points;
      this.emit('handEnd', { winner: challenger, points, scores: this.scores }, 'all');
      if (this.scores[challenger] >= 12) {
        this.emit('gameOver', { winner: challenger, scores: this.scores }, 'all');
        return;
      }
      this.dealerIndex = (this.dealerIndex + 1) % 2;
      setTimeout(() => this.startNewHand(), 1500);
      return;
    }

    if (action === 'accept') {
      this.handValue = BET_VALUES[level];
      this.betState = null;
      this.turnStage = 'play';
      this.emit('betAccepted', { handValue: this.handValue }, 'all');
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
      return;
    }

    if (action === 'retruco' && level === 'truco') {
      this.betState.level = 'retruco';
      this.betState.responder = challenger;
      this.betState.challenger = playerIndex; // inverte
      this.emit('betCalled', { challenger: playerIndex, level: 'retruco' }, 'all');
      this.emit('turnToRespond', { responder: challenger }, this.players[challenger].id);
      return;
    }

    if (action === 'valequatro' && level === 'retruco') {
      this.betState.level = 'valequatro';
      this.betState.responder = challenger;
      this.betState.challenger = playerIndex;
      this.emit('betCalled', { challenger: playerIndex, level: 'valequatro' }, 'all');
      this.emit('turnToRespond', { responder: challenger }, this.players[challenger].id);
      return;
    }
  }

  getBetValueBefore(level) {
    if (level === 'truco') return this.handValue; // valor base
    if (level === 'retruco') return 3;
    if (level === 'valequatro') return 6;
    return 1;
  }

  removePlayer(socketId) {
    // retorna true se o jogo ainda pode continuar
    return false;
  }
}

module.exports = { Game2P };
