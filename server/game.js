const SUITS = ['paus', 'copas', 'espadas', 'ouros'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const { cardStrength } = require('./utils');
const { createBot: createPlayerBot } = require('./bot');

const BET_VALUES = { truco: 3, retruco: 6, valenove: 9, valedoze: 12 };
const CARDS_PER_PLAYER = 3;
const NUM_PLAYERS = 4;
const WIN_SCORE = 12;
const MAO_DE_11_TRIGGER = 11;

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
  constructor(roomId, players, emit, onMatchOver = null, onBeforeNewHand = null) {
    this.roomId = roomId;
    this.players = players;
    this.emit = emit;
    this.onMatchOver = onMatchOver;
    this.onBeforeNewHand = onBeforeNewHand;
    this.setWins = [0, 0];
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
    this.roundStarter = 0;
    this.checkBotTurn = null;
  }

  startGame() { this.startNewHand(); }

  startNewHand() {
    this.deck = buildDeck();
    shuffle(this.deck);
    for (let i = 0; i < NUM_PLAYERS; i++) this.hands[i] = [];
    for (let i = 0; i < CARDS_PER_PLAYER; i++)
      for (let p = 0; p < NUM_PLAYERS; p++)
        this.hands[p].push(this.deck.pop());
    this.vira = this.deck.pop();

    if (this.scores[0] >= MAO_DE_11_TRIGGER && this.scores[1] >= MAO_DE_11_TRIGGER) { this.handValue = 6; this.maoDe11 = true; }
    else if (this.scores[0] >= MAO_DE_11_TRIGGER || this.scores[1] >= MAO_DE_11_TRIGGER) { this.handValue = 3; this.maoDe11 = true; }
    else { this.handValue = 1; this.maoDe11 = false; }

    this.currentPlayer = (this.dealerIndex + 3) % NUM_PLAYERS; // anti‑horário
    this.turnStage = 'play';
    this.betState = null;
    this.roundWins = [0, 0];
    this.currentRound = 0;
    this.roundCards = [];
    this.playersInRound = 0;
    this.roundStarter = this.currentPlayer;

    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (!this.players[i].isBot) {
        this.emit('handStart', {
          player: i,
          hand: this.hands[i],
          vira: this.vira,
          currentPlayer: this.currentPlayer,
          dealer: this.dealerIndex,
          handValue: this.handValue,
          scores: this.scores,
          setWins: this.setWins,
          maoDe11: this.maoDe11,
          players: this.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online }))
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

    if (this.playersInRound === 0) this.roundStarter = playerIndex;

    if (!this.roundCards[this.currentRound]) this.roundCards[this.currentRound] = new Array(NUM_PLAYERS).fill(null);
    this.roundCards[this.currentRound][playerIndex] = played;
    this.playersInRound++;

    this.emit('cardPlayed', { player: playerIndex, card: played }, 'all');

    if (this.playersInRound === NUM_PLAYERS) this.resolveRound();
    else {
      this.currentPlayer = (playerIndex + 3) % NUM_PLAYERS;
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
    }
    return true;
  }

  resolveRound() {
    const round = this.roundCards[this.currentRound];
    let bestCard = null, bestPlayer = -1;
    for (let i = 0; i < NUM_PLAYERS; i++) {
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
      // Última rodada - desempate baseado em quem tem mais vitórias
      if (this.roundWins[0] > this.roundWins[1]) this.endHand(0);
      else if (this.roundWins[1] > this.roundWins[0]) this.endHand(1);
      else this.endHand(bestPlayer !== -1 ? bestPlayer % 2 : 0); // empate: ganha quem fez a última rodada
      return;
    }

    this.currentRound++;
    this.playersInRound = 0;
    this.currentPlayer = bestPlayer !== -1 ? bestPlayer : this.roundStarter;
    this.roundStarter = this.currentPlayer;
    this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
  }

  checkMatchOver(winningTeam) {
    if (this.scores[winningTeam] >= WIN_SCORE) {
      this.setWins[winningTeam]++;
      this.emit('setWin', { winnerTeam: winningTeam, setWins: this.setWins }, 'all');
      this.emit('matchOver', { winnerTeam: winningTeam, setWins: this.setWins }, 'all');
      if (this.onMatchOver) this.onMatchOver(winningTeam);
      return true;
    }
    return false;
  }

  advanceToNextHand() {
    this.dealerIndex = (this.dealerIndex + 1) % NUM_PLAYERS;
    if (this.onBeforeNewHand) this.onBeforeNewHand();
    const checkBot = this.checkBotTurn;
    setTimeout(() => {
      this.startNewHand();
      if (checkBot) checkBot();
    }, 1500);
  }

  endHand(winningTeam) {
    this.scores[winningTeam] += this.handValue;
    this.emit('handEnd', { winnerTeam: winningTeam, points: this.handValue, scores: this.scores, setWins: this.setWins }, 'all');

    if (this.checkMatchOver(winningTeam)) return;
    this.advanceToNextHand();
  }

  fleeHand(playerIndex) {
    if (this.turnStage !== 'play') return false;
    const fleeingTeam = playerIndex % 2;
    const winningTeam = 1 - fleeingTeam;
    this.scores[winningTeam] += this.handValue;
    this.emit('handEnd', { winnerTeam: winningTeam, points: this.handValue, scores: this.scores, setWins: this.setWins }, 'all');

    if (this.checkMatchOver(winningTeam)) return true;
    this.advanceToNextHand();
    return true;
  }

  callBet(playerIndex, betType) {
    if (this.maoDe11) return false;
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;
    if (this.betState) return false;
    if (betType === 'truco' && this.handValue >= 3) return false;
    if (betType === 'retruco' && this.handValue >= 6) return false;
    if (betType === 'valenove' && this.handValue >= 9) return false;
    if (betType === 'valedoze' && this.handValue >= 12) return false;

    const challengerTeam = playerIndex % 2;
    const responderTeam = 1 - challengerTeam;
    this.betState = { challenger: playerIndex, level: betType, responderTeam, responded: false };
    this.turnStage = 'respond';
    this.emit('betCalled', { challenger: playerIndex, level: betType, responderTeam }, 'all');
    for (let i = 0; i < NUM_PLAYERS; i++)
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
      this.emit('handEnd', { winnerTeam: challengerTeam, points, scores: this.scores, setWins: this.setWins }, 'all');
      if (this.checkMatchOver(challengerTeam)) return true;
      this.advanceToNextHand();
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
    if (action === 'valenove' && level === 'retruco') nextLevel = 'valenove';
    if (action === 'valedoze' && level === 'valenove') nextLevel = 'valedoze';
    if (nextLevel) {
      this.betState.level = nextLevel;
      this.betState.responderTeam = challenger % 2;
      this.betState.challenger = playerIndex;
      this.emit('betCalled', { challenger: playerIndex, level: nextLevel, responderTeam: challenger % 2 }, 'all');
      for (let i = 0; i < NUM_PLAYERS; i++)
        if (i % 2 === challenger % 2 && !this.players[i].isBot)
          this.emit('turnToRespond', { responderTeam: challenger % 2 }, this.players[i].id);
      return true;
    }
    return false;
  }

  getBetValueBefore(level) {
    if (level === 'truco') return this.handValue;
    if (level === 'retruco') return 3;
    if (level === 'valenove') return 6;
    if (level === 'valedoze') return 9;
    return 1;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.id === socketId);
    if (idx === -1) return false;
    // Substituir jogador por bot
    const bot = createPlayerBot(idx);
    bot.online = true;
    this.players[idx] = bot;
    this.hands[idx] = [];
    return true;
  }
}

module.exports = { Game4P };