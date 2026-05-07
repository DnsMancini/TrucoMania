const SUITS = ['paus', 'copas', 'espadas', 'ouros'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const RANK_STRENGTH = {
  '4': 1, '5': 2, '6': 3, '7': 4,
  'Q': 5, 'J': 6, 'K': 7, 'A': 8,
  '2': 9, '3': 10
};

const SUIT_STRENGTH = {
  'ouros': 1,
  'espadas': 2,
  'copas': 3,
  'paus': 4
};

const BET_VALUES = {
  truco: 3,
  retruco: 6,
  valequatro: 12
};

function buildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
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
  return RANKS[(idx + 1) % RANKS.length];
}

function cardStrength(card, viraRank) {
  if (!viraRank) return RANK_STRENGTH[card.rank];
  const manilhaRank = getManilhaRank(viraRank);
  if (card.rank === manilhaRank) {
    return 10 + SUIT_STRENGTH[card.suit];
  }
  return RANK_STRENGTH[card.rank];
}

class Game4P {
  constructor(roomId, players, emit) {
    this.roomId = roomId;
    this.players = players; // array de 4 objetos: { id, name, isBot }
    this.emit = emit;
    this.scores = [0, 0]; // time0, time1
    this.dealerIndex = 0; // será rotacionado a cada mão
    this.handValue = 1;
    this.maoDe11 = false;
    this.deck = [];
    this.hands = [[], [], [], []]; // 4 mãos
    this.vira = null;
    // Ordem de jogo: 0 (time0), 1 (time1), 2 (time0), 3 (time1)
    this.currentPlayer = 0;
    this.turnStage = 'play'; // 'play' | 'respond'
    this.betState = null;    // { challenger (índice), level, responderTeam (0 ou 1) }
    this.roundCards = [];    // array de 4 cartas por rodada (até 3 rodadas)
    this.roundWins = [0, 0]; // vitórias de rodada por time
    this.currentRound = 0;
    this.playersInRound = 0; // quantos já jogaram na rodada atual
  }

  startGame() {
    this.startNewHand();
  }

  startNewHand() {
    this.deck = buildDeck();
    shuffle(this.deck);
    for (let i = 0; i < 4; i++) this.hands[i] = [];
    for (let i = 0; i < 3; i++) {
      for (let p = 0; p < 4; p++) {
        this.hands[p].push(this.deck.pop());
      }
    }
    this.vira = this.deck.pop();

    // Mão de 11
    if (this.scores[0] >= 11 && this.scores[1] >= 11) {
      this.handValue = 6;
      this.maoDe11 = true;
    } else if (this.scores[0] >= 11 || this.scores[1] >= 11) {
      this.handValue = 3;
      this.maoDe11 = true;
    } else {
      this.handValue = 1;
      this.maoDe11 = false;
    }

    // Define quem começa (à direita do dealer) – dealer rotaciona
    this.currentPlayer = (this.dealerIndex + 1) % 4;
    this.turnStage = 'play';
    this.betState = null;
    this.roundWins = [0, 0];
    this.currentRound = 0;
    this.roundCards = [];
    this.playersInRound = 0;

    // Envia estado inicial para cada jogador (somente humanos e bots que precisam?)
    // Bots não precisam de handStart, eles decidem internamente, mas vamos enviar para todos para o front atualizar.
    // Vamos enviar apenas para os sockets (humanos) no socketHandler; o bot será notificado internamente.
    // Então a função de emissão deve cuidar de enviar apenas para humanos.
    for (let i = 0; i < 4; i++) {
      if (!this.players[i].isBot) {
        this.emit('handStart', {
          player: i,
          hand: this.hands[i],
          vira: this.vira,
          currentPlayer: this.currentPlayer,
          dealer: this.dealerIndex,
          handValue: this.handValue,
          scores: this.scores,
          maoDe11: this.maoDe11,
          players: this.players.map(p => ({ name: p.name, isBot: p.isBot }))
        }, this.players[i].id);
      }
    }
  }

  // Jogar carta (chamado por humano ou bot)
  playCard(playerIndex, card) {
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;
    const hand = this.hands[playerIndex];
    const cardIdx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIdx === -1) return false;
    const played = hand.splice(cardIdx, 1)[0];

    if (!this.roundCards[this.currentRound]) {
      this.roundCards[this.currentRound] = new Array(4).fill(null);
    }
    this.roundCards[this.currentRound][playerIndex] = played;
    this.playersInRound++;

    // Notifica todos (humanos) sobre a carta jogada
    this.emit('cardPlayed', { player: playerIndex, card: played }, 'all');

    if (this.playersInRound === 4) {
      this.resolveRound();
    } else {
      // Próximo jogador na ordem (0->1->2->3->0...)
      this.currentPlayer = (playerIndex + 1) % 4;
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
    }
    return true;
  }

  resolveRound() {
    const round = this.roundCards[this.currentRound];
    // Comparar as 4 cartas para determinar a carta mais forte
    let bestCard = null;
    let bestPlayer = -1;
    for (let i = 0; i < 4; i++) {
      const c = round[i];
      if (!bestCard || cardStrength(c, this.vira.rank) > cardStrength(bestCard, this.vira.rank)) {
        bestCard = c;
        bestPlayer = i;
      } else if (cardStrength(c, this.vira.rank) === cardStrength(bestCard, this.vira.rank)) {
        // empate de força -> ninguém ganha a rodada? No truco, empate total zera a rodada? 
        // Em dupla, se a carta mais alta for de ambos os times (empate), a rodada é "empatada" e não dá ponto a nenhum time.
        // Vamos considerar empate se a maior força for igual entre dois jogadores de times diferentes.
        const bestTeam = bestPlayer % 2;
        const currentTeam = i % 2;
        if (bestTeam !== currentTeam && cardStrength(c, this.vira.rank) === cardStrength(bestCard, this.vira.rank)) {
          // Dois times empataram na maior força -> rodada sem vencedor
          bestPlayer = -1;
        }
        // Se for do mesmo time, mantém o primeiro (não afeta)
      }
    }

    let winnerTeam = -1;
    if (bestPlayer !== -1) {
      winnerTeam = bestPlayer % 2;
      this.roundWins[winnerTeam]++;
    }
    this.emit('roundResult', { round: this.currentRound, winner: bestPlayer }, 'all');

    // Verifica se algum time fez 2 rodadas
    if (this.roundWins[0] >= 2 || this.roundWins[1] >= 2) {
      const winningTeam = this.roundWins[0] >= 2 ? 0 : 1;
      this.endHand(winningTeam);
      return;
    }

    // Se ninguém fez 2, prepara próxima rodada
    this.currentRound++;
    this.playersInRound = 0;
    // Quem começa a próxima rodada é quem ganhou a última (se empatou, mantém o mesmo que começou?)
    // Regra: o vencedor da rodada anterior inicia a próxima. Em empate, o mesmo que iniciou a rodada empate?
    // Vamos simplificar: em empate, mantém o currentPlayer da rodada anterior (não muda). Se houve vencedor, o vencedor começa.
    if (bestPlayer !== -1) {
      this.currentPlayer = bestPlayer;
    }
    // Se empate (-1), currentPlayer permanece o que estava antes da rodada (ou seja, o que iniciou a rodada).
    this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
  }

  endHand(winningTeam) {
    this.scores[winningTeam] += this.handValue;
    this.emit('handEnd', { winnerTeam: winningTeam, points: this.handValue, scores: this.scores }, 'all');

    if (this.scores[winningTeam] >= 12) {
      this.emit('gameOver', { winnerTeam: winningTeam, scores: this.scores }, 'all');
      return;
    }

    this.dealerIndex = (this.dealerIndex + 1) % 4;
    setTimeout(() => this.startNewHand(), 1500);
  }

  // Pedido de truco (qualquer jogador na sua vez)
  callBet(playerIndex, betType) {
    if (this.maoDe11) return false;
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;
    if (this.betState) return false; // já existe aposta em andamento
    if (betType === 'truco' && this.handValue >= 3) return false;
    if (betType === 'retruco' && this.handValue >= 6) return false;
    if (betType === 'valequatro' && this.handValue >= 12) return false;

    const challengerTeam = playerIndex % 2;
    const responderTeam = 1 - challengerTeam;
    this.betState = {
      challenger: playerIndex,
      level: betType,
      responderTeam: responderTeam,
      responded: false
    };
    this.turnStage = 'respond';
    this.emit('betCalled', { challenger: playerIndex, level: betType, responderTeam }, 'all');
    // Envia evento para os dois jogadores do time adversário avisando que podem responder
    for (let i = 0; i < 4; i++) {
      if (i % 2 === responderTeam && !this.players[i].isBot) {
        this.emit('turnToRespond', { responderTeam }, this.players[i].id);
      }
    }
    return true;
  }

  // Resposta ao truco (qualquer jogador do time adversário)
  respondBet(playerIndex, action) {
    if (this.turnStage !== 'respond' || !this.betState) return false;
    const respTeam = this.betState.responderTeam;
    if (playerIndex % 2 !== respTeam) return false;

    const { challenger, level } = this.betState;

    if (action === 'flee') {
      const points = this.getBetValueBefore(level);
      const challengerTeam = challenger % 2;
      this.scores[challengerTeam] += points;
      this.emit('handEnd', { winnerTeam: challengerTeam, points, scores: this.scores }, 'all');
      if (this.scores[challengerTeam] >= 12) {
        this.emit('gameOver', { winnerTeam: challengerTeam, scores: this.scores }, 'all');
        return false;
      }
      this.dealerIndex = (this.dealerIndex + 1) % 4;
      setTimeout(() => this.startNewHand(), 1500);
      return true;
    }

    if (action === 'accept') {
      this.handValue = BET_VALUES[level];
      this.betState = null;
      this.turnStage = 'play';
      this.emit('betAccepted', { handValue: this.handValue }, 'all');
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
      return true;
    }

    // Retruco / Vale Quatro
    let nextLevel = null;
    if (action === 'retruco' && level === 'truco') nextLevel = 'retruco';
    if (action === 'valequatro' && level === 'retruco') nextLevel = 'valequatro';
    if (nextLevel) {
      this.betState.level = nextLevel;
      this.betState.responderTeam = challenger % 2;
      this.betState.challenger = playerIndex;
      this.emit('betCalled', { challenger: playerIndex, level: nextLevel, responderTeam: challenger % 2 }, 'all');
      // Notifica o time adversário (agora o time do challenger original)
      for (let i = 0; i < 4; i++) {
        if (i % 2 === challenger % 2 && !this.players[i].isBot) {
          this.emit('turnToRespond', { responderTeam: challenger % 2 }, this.players[i].id);
        }
      }
      return true;
    }

    return false;
  }

  getBetValueBefore(level) {
    if (level === 'truco') return this.handValue;
    if (level === 'retruco') return 3;
    if (level === 'valequatro') return 6;
    return 1;
  }

  // Retorna true se o jogo continua
  removePlayer(socketId) {
    // Se um humano sair, podemos substituir por bot? Por enquanto só desliga o jogo.
    return false;
  }
}

module.exports = { Game4P };