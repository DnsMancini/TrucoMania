const crypto = require('crypto');
const SUITS = ['paus', 'copas', 'espadas', 'ouros'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const { cardStrength } = require('./utils');
const { chooseCard, respondBet: chooseBotBet } = require('./bot');

const BET_VALUES = { truco: 3, retruco: 6, valenove: 9, valedoze: 12 };
const NEXT_BET = { 1: 'truco', 3: 'retruco', 6: 'valenove', 9: 'valedoze' };
const CARDS_PER_PLAYER = 3;
const NUM_PLAYERS = 4;
const WIN_SCORE = 12;
const MAO_DE_11_TRIGGER = 11;
const DECISION_TIMEOUT = 25000;
const ROUND_DISPLAY_MS = 2500;

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function isValidPlayerIndex(playerIndex) {
  return Number.isInteger(playerIndex) && playerIndex >= 0 && playerIndex < NUM_PLAYERS;
}

function isValidCard(card) {
  return Boolean(
    card &&
      typeof card === 'object' &&
      !Array.isArray(card) &&
      typeof card.suit === 'string' &&
      SUITS.includes(card.suit) &&
      typeof card.rank === 'string' &&
      RANKS.includes(card.rank)
  );
}

function isValidBlindIndex(card) {
  return Boolean(
    card &&
      typeof card === 'object' &&
      !Array.isArray(card) &&
      Number.isInteger(card.blindIndex) &&
      card.blindIndex >= 0 &&
      card.blindIndex < CARDS_PER_PLAYER
  );
}

function isValidBetType(betType) {
  return typeof betType === 'string' && Object.prototype.hasOwnProperty.call(BET_VALUES, betType);
}

function isValidBetAction(action) {
  return typeof action === 'string' && ['flee', 'accept', 'retruco', 'valenove', 'valedoze'].includes(action);
}

function isValidMaoDe11Action(action) {
  return action === 'play' || action === 'flee';
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
    this.maoDe11Team = null;
    this.maoDe11DecisionMade = false;
    this.maoDeFerro = false;
    this.deck = [];
    this.hands = [[], [], [], []];
    this.vira = null;
    this.currentPlayer = 0;
    this.turnStage = 'play';
    this.betState = null;
    this.lastBetTeam = null;
    this.roundCards = [];
    this.roundWins = [0, 0];
    this.roundWinners = [];
    this.currentRound = 0;
    this.playersInRound = 0;
    this.roundStarter = 0;
    this.checkBotTurn = null;
    this.offlineActionTimer = null;
    this.roundTransitionTimer = null;
    this.handTransitionTimer = null;
    this.botTurnTimer = null;
    this.botResponseTimer = null;
    this.botDecisionTimer = null;
  }

  startGame() {
    this.startNewHand();
  }

  startNewHand() {
    if (this.offlineActionTimer) { clearTimeout(this.offlineActionTimer); this.offlineActionTimer = null; }
    if (this.roundTransitionTimer) { clearTimeout(this.roundTransitionTimer); this.roundTransitionTimer = null; }
    if (this.handTransitionTimer) { clearTimeout(this.handTransitionTimer); this.handTransitionTimer = null; }
    this.deck = buildDeck();
    shuffle(this.deck);
    this.hands = [[], [], [], []];
    for (let cardIndex = 0; cardIndex < CARDS_PER_PLAYER; cardIndex++) {
      for (let playerIndex = 0; playerIndex < NUM_PLAYERS; playerIndex++) this.hands[playerIndex].push(this.deck.pop());
    }
    this.vira = this.deck.pop();
    if (this.scores[0] === MAO_DE_11_TRIGGER && this.scores[1] === MAO_DE_11_TRIGGER) {
      this.handValue = 1; this.maoDe11 = false; this.maoDe11Team = null; this.maoDeFerro = true;
    } else if (this.scores[0] === MAO_DE_11_TRIGGER || this.scores[1] === MAO_DE_11_TRIGGER) {
      this.handValue = 3; this.maoDe11 = true; this.maoDe11Team = this.scores[0] === MAO_DE_11_TRIGGER ? 0 : 1; this.maoDeFerro = false;
    } else {
      this.handValue = 1; this.maoDe11 = false; this.maoDe11Team = null; this.maoDeFerro = false;
    }
    this.maoDe11DecisionMade = false;
    this.currentPlayer = (this.dealerIndex + 3) % NUM_PLAYERS;
    this.turnStage = this.maoDe11 ? 'mao11Decision' : 'play';
    this.betState = null;
    this.lastBetTeam = null;
    this.roundWins = [0, 0];
    this.roundWinners = [];
    this.currentRound = 0;
    this.roundCards = [];
    this.playersInRound = 0;
    this.roundStarter = this.currentPlayer;
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (this.players[i]?.isBot) continue;
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
        maoDe11Team: this.maoDe11Team,
        maoDe11DecisionMade: this.maoDe11DecisionMade,
        maoDeFerro: this.maoDeFerro,
        turnStage: this.turnStage,
        players: this.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online }))
      }, this.players[i].id);
      if (this.turnStage === 'mao11Decision' && i % 2 === this.maoDe11Team) this.emit('maoDe11Decision', { team: this.maoDe11Team }, this.players[i].id);
    }
    if (this.turnStage === 'mao11Decision') this.scheduleMaoDe11Decision();
    else this.scheduleOfflineTurn();
  }

  playCard(playerIndex, card) {
    if (!isValidPlayerIndex(playerIndex) || this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;
    const hand = this.hands[playerIndex];
    let cardIndex = -1;
    if (isValidCard(card)) {
      cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    } else if (this.maoDeFerro && isValidBlindIndex(card)) {
      cardIndex = card.blindIndex;
    } else {
      return false;
    }
    if (cardIndex < 0 || cardIndex >= hand.length) return false;
    if (!this.roundCards[this.currentRound]) this.roundCards[this.currentRound] = new Array(NUM_PLAYERS).fill(null);
    if (this.roundCards[this.currentRound][playerIndex]) return false;
    const played = hand.splice(cardIndex, 1)[0];
    if (this.offlineActionTimer) { clearTimeout(this.offlineActionTimer); this.offlineActionTimer = null; }
    if (this.playersInRound === 0) this.roundStarter = playerIndex;
    this.roundCards[this.currentRound][playerIndex] = played;
    this.playersInRound++;
    this.emit('cardPlayed', { player: playerIndex, card: played, round: this.currentRound }, 'all');
    if (this.playersInRound === NUM_PLAYERS) {
      this.resolveRound();
    } else {
      this.currentPlayer = (playerIndex + 3) % NUM_PLAYERS;
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
      this.scheduleOfflineTurn();
    }
    return true;
  }

  resolveRound() {
    const round = this.roundCards[this.currentRound] || [];
    let maxStrength = -Infinity;
    for (const card of round) if (card) maxStrength = Math.max(maxStrength, cardStrength(card, this.vira.rank));
    const strongestPlayers = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const card = round[i];
      if (card && cardStrength(card, this.vira.rank) === maxStrength) strongestPlayers.push(i);
    }
    const strongestTeams = [...new Set(strongestPlayers.map(i => i % 2))];
    const winnerPlayer = strongestTeams.length === 1 ? strongestPlayers[0] : -1;
    const winnerTeam = winnerPlayer === -1 ? -1 : winnerPlayer % 2;
    this.roundWinners[this.currentRound] = winnerTeam;
    if (winnerTeam !== -1) this.roundWins[winnerTeam]++;
    this.emit('roundResult', { round: this.currentRound, winner: winnerPlayer }, 'all');
    if (this.currentRound === 1) {
      const first = this.roundWinners[0]; const second = this.roundWinners[1];
      if (first === -1 && second !== -1) return this.endHand(second);
      if (first !== -1 && second === -1) return this.endHand(first);
      if (first !== -1 && first === second) return this.endHand(first);
    }
    if (this.roundWins[0] >= 2 || this.roundWins[1] >= 2) return this.endHand(this.roundWins[0] >= 2 ? 0 : 1);
    if (this.currentRound >= 2) {
      const previousWinner = [...this.roundWinners].reverse().find(team => team !== -1);
      return this.endHand(winnerTeam !== -1 ? winnerTeam : (previousWinner ?? -1));
    }
    this.currentRound++;
    this.playersInRound = 0;
    const nextRoundStarter = winnerPlayer !== -1 ? winnerPlayer : this.roundStarter;
    this.roundStarter = nextRoundStarter;
    this.currentPlayer = nextRoundStarter;
    if (this.offlineActionTimer) { clearTimeout(this.offlineActionTimer); this.offlineActionTimer = null; }
    if (this.roundTransitionTimer) clearTimeout(this.roundTransitionTimer);
    this.turnStage = 'roundTransition';
    this.roundTransitionTimer = setTimeout(() => {
      this.roundTransitionTimer = null;
      if (this.currentRound < 1 || this.turnStage !== 'roundTransition') return;
      this.turnStage = 'play';
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
      this.scheduleOfflineTurn();
    }, ROUND_DISPLAY_MS);
  }

  checkSetOver(winningTeam) {
    if (winningTeam === -1 || this.scores[winningTeam] < WIN_SCORE) return false;
    this.setWins[winningTeam]++;
    this.emit('setWin', { winnerTeam: winningTeam, setWins: this.setWins, scores: this.scores }, 'all');
    if (this.setWins[winningTeam] >= 2) {
      this.emit('matchOver', { winnerTeam: winningTeam, setWins: this.setWins, scores: this.scores }, 'all');
      if (this.onMatchOver) this.onMatchOver(winningTeam);
      return true;
    }
    this.scores = [0, 0];
    this.emit('setStart', { setWins: this.setWins, scores: this.scores }, 'all');
    this.advanceToNextHand();
    return true;
  }

  advanceToNextHand() {
    this.turnStage = 'handTransition';
    if (this.offlineActionTimer) { clearTimeout(this.offlineActionTimer); this.offlineActionTimer = null; }
    if (this.roundTransitionTimer) { clearTimeout(this.roundTransitionTimer); this.roundTransitionTimer = null; }
    if (this.handTransitionTimer) { clearTimeout(this.handTransitionTimer); this.handTransitionTimer = null; }
    this.dealerIndex = (this.dealerIndex + 1) % NUM_PLAYERS;
    if (this.onBeforeNewHand) this.onBeforeNewHand();
    const checkBot = this.checkBotTurn;
    const transitionTimer = setTimeout(() => {
      if (this.handTransitionTimer !== transitionTimer) return;
      this.handTransitionTimer = null;
      this.startNewHand();
      if (checkBot) checkBot();
    }, 1500);
    this.handTransitionTimer = transitionTimer;
  }

  cancelTimers() {
    if (this.offlineActionTimer) { clearTimeout(this.offlineActionTimer); this.offlineActionTimer = null; }
    if (this.roundTransitionTimer) { clearTimeout(this.roundTransitionTimer); this.roundTransitionTimer = null; }
    if (this.handTransitionTimer) { clearTimeout(this.handTransitionTimer); this.handTransitionTimer = null; }
    if (this.botTurnTimer) { clearTimeout(this.botTurnTimer); this.botTurnTimer = null; }
    if (this.botResponseTimer) { clearTimeout(this.botResponseTimer); this.botResponseTimer = null; }
    if (this.botDecisionTimer) { clearTimeout(this.botDecisionTimer); this.botDecisionTimer = null; }
  }

  endHand(winningTeam) {
    const points = winningTeam === -1 ? 0 : this.handValue;
    if (winningTeam !== -1) this.scores[winningTeam] += points;
    this.emit('handEnd', { winnerTeam: winningTeam, points, scores: this.scores, setWins: this.setWins, draw: winningTeam === -1 }, 'all');
    if (this.checkSetOver(winningTeam)) return;
    this.advanceToNextHand();
  }

  respondMaoDe11(playerIndex, action) {
    if (!isValidPlayerIndex(playerIndex) || !isValidMaoDe11Action(action) || this.turnStage !== 'mao11Decision' || !this.maoDe11 || this.maoDe11DecisionMade || playerIndex % 2 !== this.maoDe11Team) return false;
    this.maoDe11DecisionMade = true;
    if (this.offlineActionTimer) { clearTimeout(this.offlineActionTimer); this.offlineActionTimer = null; }
    if (action === 'flee') {
      const winningTeam = 1 - this.maoDe11Team;
      this.scores[winningTeam] += 1;
      this.emit('handEnd', { winnerTeam: winningTeam, points: 1, scores: this.scores, setWins: this.setWins, draw: false, maoDe11Flee: true }, 'all');
      if (this.checkSetOver(winningTeam)) return true;
      this.advanceToNextHand();
      return true;
    }
    this.turnStage = 'play';
    this.handValue = 3;
    this.emit('maoDe11Started', { team: this.maoDe11Team, handValue: 3, currentPlayer: this.currentPlayer }, 'all');
    this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
    this.scheduleOfflineTurn();
    return true;
  }

  scheduleMaoDe11Decision() {
    if (this.turnStage !== 'mao11Decision' || !this.maoDe11 || this.maoDe11DecisionMade) return;
    const team = this.maoDe11Team;
    const teamPlayers = [team, team + 2];
    if (teamPlayers.every(index => this.players[index]?.isBot)) { this.respondMaoDe11(teamPlayers[0], 'play'); return; }
    if (this.offlineActionTimer) clearTimeout(this.offlineActionTimer);
    const playerIndex = teamPlayers.find(index => this.players[index] && !this.players[index].isBot && this.players[index].online === false);
    const fallbackPlayer = teamPlayers.find(index => this.players[index] && !this.players[index].isBot);
    const decisionPlayer = playerIndex === undefined ? fallbackPlayer : playerIndex;
    if (decisionPlayer === undefined) return;
    this.offlineActionTimer = setTimeout(() => {
      this.offlineActionTimer = null;
      if (this.turnStage !== 'mao11Decision' || !this.maoDe11 || this.maoDe11DecisionMade || this.players[decisionPlayer]?.online !== false) return;
      this.respondMaoDe11(decisionPlayer, 'play');
    }, DECISION_TIMEOUT);
  }

  fleeHand(playerIndex) {
    if (!isValidPlayerIndex(playerIndex) || this.turnStage !== 'play' || this.maoDe11 || this.maoDeFerro || playerIndex !== this.currentPlayer) return false;
    const fleeingTeam = playerIndex % 2;
    const winningTeam = 1 - fleeingTeam;
    this.scores[winningTeam] += this.handValue;
    this.emit('handEnd', { winnerTeam: winningTeam, points: this.handValue, scores: this.scores, setWins: this.setWins, draw: false }, 'all');
    if (this.checkSetOver(winningTeam)) return true;
    this.advanceToNextHand();
    return true;
  }

  callBet(playerIndex, betType) {
    if (!isValidPlayerIndex(playerIndex) || !isValidBetType(betType) || this.maoDe11 || this.maoDeFerro || this.turnStage !== 'play' || playerIndex !== this.currentPlayer || this.betState) return false;
    const expectedBet = NEXT_BET[this.handValue];
    if (expectedBet !== betType) return false;
    const challengerTeam = playerIndex % 2;
    if (this.handValue >= 3 && this.lastBetTeam === challengerTeam) return false;
    const responderTeam = 1 - challengerTeam;
    this.betState = { challenger: playerIndex, level: betType, responderTeam, responded: false };
    this.turnStage = 'respond';
    this.emit('betCalled', { challenger: playerIndex, level: betType, responderTeam }, 'all');
    for (let i = 0; i < NUM_PLAYERS; i++) if (i % 2 === responderTeam && !this.players[i].isBot) this.emit('turnToRespond', { responderTeam }, this.players[i].id);
    this.scheduleOfflineResponse();
    return true;
  }

  respondBet(playerIndex, action) {
    if (!isValidPlayerIndex(playerIndex) || !isValidBetAction(action) || this.turnStage !== 'respond' || !this.betState) return false;
    const responderTeam = this.betState.responderTeam;
    if (playerIndex % 2 !== responderTeam) return false;
    const { challenger, level } = this.betState;
    if (this.offlineActionTimer) { clearTimeout(this.offlineActionTimer); this.offlineActionTimer = null; }
    if (action === 'flee') {
      const points = this.getBetValueBefore(level);
      const challengerTeam = challenger % 2;
      this.scores[challengerTeam] += points;
      this.emit('handEnd', { winnerTeam: challengerTeam, points, scores: this.scores, setWins: this.setWins, draw: false }, 'all');
      if (this.checkSetOver(challengerTeam)) return true;
      this.advanceToNextHand();
      return true;
    }
    if (action === 'accept') {
      this.handValue = BET_VALUES[level];
      this.lastBetTeam = challenger % 2;
      this.betState = null;
      this.turnStage = 'play';
      this.emit('betAccepted', { handValue: this.handValue }, 'all');
      this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
      this.scheduleOfflineTurn();
      return true;
    }
    let nextLevel = null;
    if (action === 'retruco' && level === 'truco') nextLevel = 'retruco';
    if (action === 'valenove' && level === 'retruco') nextLevel = 'valenove';
    if (action === 'valedoze' && level === 'valenove') nextLevel = 'valedoze';
    if (!nextLevel) return false;
    this.betState = { challenger: playerIndex, level: nextLevel, responderTeam: 1 - responderTeam, responded: false };
    this.lastBetTeam = playerIndex % 2;
    this.turnStage = 'respond';
    this.emit('betRaised', { challenger: playerIndex, level: nextLevel, responderTeam: 1 - responderTeam }, 'all');
    for (let i = 0; i < NUM_PLAYERS; i++) if (i % 2 === this.betState.responderTeam && !this.players[i].isBot) this.emit('turnToRespond', { responderTeam: this.betState.responderTeam }, this.players[i].id);
    this.scheduleOfflineResponse();
    return true;
  }

  getBetValueBefore(level) {
    if (level === 'truco') return 1;
    if (level === 'retruco') return 3;
    if (level === 'valenove') return 6;
    if (level === 'valedoze') return 9;
    return 1;
  }

  scheduleOfflineResponse() {
    if (this.turnStage !== 'respond' || !this.betState) return;
    if (this.offlineActionTimer) clearTimeout(this.offlineActionTimer);
    const team = this.betState.responderTeam;
    const teamPlayers = [team, team + 2];
    const humanPlayers = teamPlayers.filter(index => this.players[index] && !this.players[index].isBot);
    if (humanPlayers.length === 0) {
      const botIndex = teamPlayers.find(index => this.players[index] && this.players[index].isBot);
      if (botIndex !== undefined) {
        this.offlineActionTimer = setTimeout(() => {
          this.offlineActionTimer = null;
          if (this.turnStage !== 'respond' || !this.betState || !this.players[botIndex]?.isBot) return;
          const context = { hand: this.hands[botIndex], vira: this.vira, handValue: this.handValue, maoDe11: this.maoDe11, betState: this.betState };
          const action = chooseBotBet(this.hands[botIndex], this.vira.rank, this.betState.level, context);
          this.respondBet(botIndex, action);
        }, 700);
      }
      return;
    }
    const offlinePlayer = humanPlayers.find(index => this.players[index].online === false);
    const responsePlayer = offlinePlayer === undefined ? humanPlayers[0] : offlinePlayer;
    this.offlineActionTimer = setTimeout(() => {
      this.offlineActionTimer = null;
      if (this.turnStage !== 'respond' || !this.betState) return;
      const p = this.players[responsePlayer];
      if (!p || p.isBot || p.online === true) return;
      const context = { hand: this.hands[responsePlayer], vira: this.vira, handValue: this.handValue, maoDe11: this.maoDe11, betState: this.betState };
      const action = chooseBotBet(this.hands[responsePlayer], this.vira.rank, this.betState.level, context);
      this.respondBet(responsePlayer, action);
    }, DECISION_TIMEOUT);
  }

  scheduleOfflineTurn() {
    if (this.turnStage !== 'play' || !isValidPlayerIndex(this.currentPlayer)) return;
    if (this.offlineActionTimer) clearTimeout(this.offlineActionTimer);
    const player = this.players[this.currentPlayer];
    if (!player) return;
    if (player.isBot) {
      const playerIndex = this.currentPlayer;
      this.offlineActionTimer = setTimeout(() => {
        this.offlineActionTimer = null;
        if (this.turnStage !== 'play' || this.currentPlayer !== playerIndex || !this.players[playerIndex]?.isBot) return;
        const context = { hand: this.hands[playerIndex], vira: this.vira, handValue: this.handValue, maoDe11: this.maoDe11, betState: this.betState, players: this.players, playerIndex };
        const action = chooseCard(context.hand, context.vira.rank, context);
        if (action) this.playCard(playerIndex, action);
      }, 700);
      return;
    }
    if (player.online === false) {
      const playerIndex = this.currentPlayer;
      this.offlineActionTimer = setTimeout(() => {
        this.offlineActionTimer = null;
        if (this.turnStage !== 'play' || this.currentPlayer !== playerIndex || this.players[playerIndex]?.online !== false) return;
        const context = { hand: this.hands[playerIndex], vira: this.vira, handValue: this.handValue, maoDe11: this.maoDe11, betState: this.betState, players: this.players, playerIndex };
        const action = chooseCard(context.hand, context.vira.rank, context);
        if (action) this.playCard(playerIndex, action);
      }, DECISION_TIMEOUT);
    }
  }
}

module.exports = { Game4P };