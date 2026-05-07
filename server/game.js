const SUITS = ['paus', 'copas', 'espadas', 'ouros'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const { cardStrength } = require('./utils');

const RANK_STRENGTH = {
  '4': 1, '5': 2, '6': 3, '7': 4,
  'Q': 5, 'J': 6, 'K': 7, 'A': 8,
  '2': 9, '3': 10
};

const SUIT_STRENGTH = {
  'ouros': 1, 'espadas': 2, 'copas': 3, 'paus': 4
};

const BET_VALUES = { truco: 3, retruco: 6, valequatro: 12 };

function buildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS) deck.push({ suit, rank });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

class Game4P {
  constructor(roomId, players, emit) {
    this.roomId = roomId;
    this.players = players;
    this.emit = emit;
    this.scores = [0, 0];
    this.dealerIndex = 0;
    this.handValue = 1;
    this.maoDe11 = false;
    this.deck = [];
    this.hands = [[], [], [], []];
    this.vira = null;
    this.currentPlayer = 0;
    this.turnStage = 'play';
    this.betState = null;
    this.roundCards = [];
    this.roundWins = [0, 0];
    this.currentRound = 0;
    this.playersInRound = 0;
    this.checkBotTurn = null; // callback
  }

  startGame() { this.startNewHand(); }

  startNewHand() {
    this.deck = buildDeck();
    shuffle(this.deck);
    for (let i = 0; i < 4; i++) this.hands[i] = [];
    for (let i = 0; i < 3; i++)
      for (let p = 0; p < 4; p++)
        this.hands[p].push(this.deck.pop());
    this.vira = this.deck.pop();

    if (this.scores[0] >= 11 && this.scores[1] >= 11) { this.handValue = 6; this.maoDe11 = true; }
    else if (this.scores[0] >= 11 || this.scores[1] >= 11) { this.handValue = 3; this.maoDe11 = true; }
    else { this.handValue = 1; this.maoDe11 = false; }

    // Sentido anti‑horário: próximo jogador é o anterior (dealerIndex - 1, ou +3 mod 4)
    this.currentPlayer = (this.dealerIndex + 3) % 4;
    this.turnStage = 'play';
    this.betState = null;
    this.roundWins = [0, 0];
    this.currentRound = 0;
    this.roundCards = [];
    this.playersInRound = 0;

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

  playCard(playerIndex, card) {
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;
    const hand = this.hands[playerIndex];
    const cardIdx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIdx === -1) return false;
    const played = hand.splice(cardIdx, 1)[0];

    if (!this.roundCards[this.currentRound]) this.roundCards[this.currentRound] = new Array(4).fill(null);
    this.roundCards[this.currentRound][playerIndex] = played;
    this.playersInRound++;

    this.emit('cardPlayed', { player: playerIndex, card: played }, 'all');

    if (this.playersInRound === 4) this.resolveRound();
    else {
      // Sentido anti‑horário: próximo jogador = (playerIndex + 3) % 4
      this.currentPlayer = (playerIndex + 3) % 4;
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
    }
    return true;
  }

  resolveRound() {
    const round = this.roundCards[this.currentRound];
    let bestCard = null, bestPlayer = -1;
    for (let i = 0; i < 4; i++) {
      const c = round[i];
      if (!bestCard || cardStrength(c, this.vira.rank) > cardStrength(bestCard, this.vira.rank)) {
        bestCard = c; bestPlayer = i;
      } else if (cardStrength(c, this.vira.rank) === cardStrength(bestCard, this.vira.rank)) {
        const bestTeam = bestPlayer % 2, currentTeam = i % 2;
        if (bestTeam !== currentTeam) bestPlayer = -1;
      }
    }

    let winnerTeam = -1;
    if (bestPlayer !== -1) { winnerTeam = bestPlayer % 2; this.roundWins[winnerTeam]++; }
    this.emit('roundResult', { round: this.currentRound, winner: bestPlayer }, 'all');

    if (this.roundWins[0] >= 2 || this.roundWins[1] >= 2) {
      const winningTeam = this.roundWins[0] >= 2 ? 0 : 1;
      this.endHand(winningTeam);
      return;
    }

    if (this.currentRound >= 2) {
      if (this.roundWins[0] > this.roundWins[1]) this.endHand(0);
      else if (this.roundWins[1] > this.roundWins[0]) this.endHand(1);
      else this.endHand(0); // empate total, time 0 ganha
      return;
    }

    this.currentRound++;
    this.playersInRound = 0;
    if (bestPlayer !== -1) this.currentPlayer = bestPlayer;
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
    const checkBot = this.checkBotTurn;
    setTimeout(() => {
      this.startNewHand();
      if (checkBot) checkBot();
    }, 1500);
  }

  callBet(playerIndex, betType) {
    if (this.maoDe11) return false;
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;
    if (this.betState) return false;
    if (betType === 'truco' && this.handValue >= 3) return false;
    if (betType === 'retruco' && this.handValue >= 6) return false;
    if (betType === 'valequatro' && this.handValue >= 12) return false;

    const challengerTeam = playerIndex % 2;
    const responderTeam = 1 - challengerTeam;
    this.betState = { challenger: playerIndex, level: betType, responderTeam, responded: false };
    this.turnStage = 'respond';
    this.emit('betCalled', { challenger: playerIndex, level: betType, responderTeam }, 'all');
    for (let i = 0; i < 4; i++)
      if (i % 2 === responderTeam && !this.players[i].isBot)
        this.emit('turnToRespond', { responderTeam }, this.players[i].id);
    return true;
  }

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
      setTimeout(() => {
        this.startNewHand();
        if (this.checkBotTurn) this.checkBotTurn();
      }, 1500);
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

    let nextLevel = null;
    if (action === 'retruco' && level === 'truco') nextLevel = 'retruco';
    if (action === 'valequatro' && level === 'retruco') nextLevel = 'valequatro';
    if (nextLevel) {
      this.betState.level = nextLevel;
      this.betState.responderTeam = challenger % 2;
      this.betState.challenger = playerIndex;
      this.emit('betCalled', { challenger: playerIndex, level: nextLevel, responderTeam: challenger % 2 }, 'all');
      for (let i = 0; i < 4; i++)
        if (i % 2 === challenger % 2 && !this.players[i].isBot)
          this.emit('turnToRespond', { responderTeam: challenger % 2 }, this.players[i].id);
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

  removePlayer(socketId) { return false; }
}

module.exports = { Game4P };