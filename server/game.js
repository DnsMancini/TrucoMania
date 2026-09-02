const SUITS = ['paus', 'copas', 'espadas', 'ouros'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const { cardStrength } = require('./utils');

const BET_VALUES = { truco: 3, retruco: 6, valenove: 9, valedoze: 12 };
const CARDS_PER_PLAYER = 3;
const NUM_PLAYERS = 4;
const WIN_SCORE = 12;
const MAO_DE_11_TRIGGER = 11;

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
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
    this.maoDe11Team = null;
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
  }

  startGame() {
    this.startNewHand();
  }

  startNewHand() {
    this.deck = buildDeck();
    shuffle(this.deck);

    for (let i = 0; i < NUM_PLAYERS; i++) this.hands[i] = [];
    for (let cardIndex = 0; cardIndex < CARDS_PER_PLAYER; cardIndex++) {
      for (let playerIndex = 0; playerIndex < NUM_PLAYERS; playerIndex++) {
        this.hands[playerIndex].push(this.deck.pop());
      }
    }
    this.vira = this.deck.pop();

    if (this.scores[0] === MAO_DE_11_TRIGGER && this.scores[1] === MAO_DE_11_TRIGGER) {
      this.handValue = 1;
      this.maoDe11 = false;
      this.maoDe11Team = null;
      this.maoDeFerro = true;
    } else if (this.scores[0] === MAO_DE_11_TRIGGER || this.scores[1] === MAO_DE_11_TRIGGER) {
      this.handValue = 3;
      this.maoDe11 = true;
      this.maoDe11Team = this.scores[0] === MAO_DE_11_TRIGGER ? 0 : 1;
      this.maoDeFerro = false;
    } else {
      this.handValue = 1;
      this.maoDe11 = false;
      this.maoDe11Team = null;
      this.maoDeFerro = false;
    }

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
          maoDe11Team: this.maoDe11Team,
          maoDeFerro: this.maoDeFerro,
          turnStage: this.turnStage,
          players: this.players.map(p => ({ name: p.name, isBot: p.isBot, online: p.online }))
        }, this.players[i].id);

        if (this.turnStage === 'mao11Decision' && i % 2 === this.maoDe11Team) {
          this.emit('maoDe11Decision', { team: this.maoDe11Team }, this.players[i].id);
        }
      }
    }

    this.scheduleOfflineMaoDe11();
    this.scheduleOfflineTurn();
  }

  playCard(playerIndex, card) {
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;

    const hand = this.hands[playerIndex];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1) return false;

    const played = hand.splice(cardIndex, 1)[0];

    if (this.offlineActionTimer) {
      clearTimeout(this.offlineActionTimer);
      this.offlineActionTimer = null;
    }

    if (this.playersInRound === 0) this.roundStarter = playerIndex;

    if (!this.roundCards[this.currentRound]) {
      this.roundCards[this.currentRound] = new Array(NUM_PLAYERS).fill(null);
    }
    this.roundCards[this.currentRound][playerIndex] = played;
    this.playersInRound++;

    this.emit('cardPlayed', { player: playerIndex, card: played }, 'all');

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

    for (const card of round) {
      if (card) maxStrength = Math.max(maxStrength, cardStrength(card, this.vira.rank));
    }

    const maxPlayers = [];
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const card = round[i];
      if (card && cardStrength(card, this.vira.rank) === maxStrength) maxPlayers.push(i);
    }

    const maxTeams = [...new Set(maxPlayers.map(i => i % 2))];
    const winner = maxTeams.length === 1 ? maxPlayers[0] : -1;
    const winnerTeam = winner === -1 ? -1 : winner % 2;

    this.roundWinners[this.currentRound] = winnerTeam;
    if (winnerTeam !== -1) this.roundWins[winnerTeam]++;

    this.emit('roundResult', { round: this.currentRound, winner }, 'all');

    if (this.currentRound === 1) {
      const first = this.roundWinners[0];
      const second = this.roundWinners[1];

      if (first === -1 && second !== -1) return this.endHand(second);
      if (first !== -1 && second === -1) return this.endHand(first);
      if (first !== -1 && second === first) return this.endHand(first);
    }

    if (this.roundWins[0] >= 2 || this.roundWins[1] >= 2) {
      return this.endHand(this.roundWins[0] >= 2 ? 0 : 1);
    }

    if (this.currentRound >= 2) {
      const first = this.roundWinners[0];
      const winningTeam = winnerTeam !== -1 ? winnerTeam : first;
      return this.endHand(winningTeam);
    }

    this.currentRound++;
    this.playersInRound = 0;
    this.currentPlayer = winner !== -1 ? winner : this.roundStarter;
    this.roundStarter = this.currentPlayer;
    this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
    this.scheduleOfflineTurn();
  }

  checkSetOver(winningTeam) {
    if (winningTeam === -1 || this.scores[winningTeam] < WIN_SCORE) return false;

    this.setWins[winningTeam]++;
    this.emit('setWin', {
      winnerTeam: winningTeam,
      setWins: this.setWins,
      scores: this.scores
    }, 'all');

    if (this.setWins[winningTeam] >= 2) {
      this.emit('matchOver', {
        winnerTeam: winningTeam,
        setWins: this.setWins,
        scores: this.scores
      }, 'all');
      if (this.onMatchOver) this.onMatchOver(winningTeam);
      return true;
    }

    this.scores = [0, 0];
    this.emit('setStart', { setWins: this.setWins, scores: this.scores }, 'all');
    this.advanceToNextHand();
    return true;
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
    const points = winningTeam === -1 ? 0 : this.handValue;
    if (winningTeam !== -1) this.scores[winningTeam] += points;

    this.emit('handEnd', {
      winnerTeam: winningTeam,
      points,
      scores: this.scores,
      setWins: this.setWins,
      draw: winningTeam === -1
    }, 'all');

    if (this.checkSetOver(winningTeam)) return;
    this.advanceToNextHand();
  }

  respondMaoDe11(playerIndex, action) {
    if (this.turnStage !== 'mao11Decision' || !this.maoDe11) return false;
    if (playerIndex % 2 !== this.maoDe11Team) return false;
    if (action !== 'play' && action !== 'flee') return false;

    if (this.offlineActionTimer) {
      clearTimeout(this.offlineActionTimer);
      this.offlineActionTimer = null;
    }

    if (action === 'flee') {
      const winningTeam = 1 - this.maoDe11Team;
      this.scores[winningTeam] += 1;
      this.emit('handEnd', {
        winnerTeam: winningTeam,
        points: 1,
        scores: this.scores,
        setWins: this.setWins,
        draw: false,
        maoDe11Flee: true
      }, 'all');

      if (this.checkSetOver(winningTeam)) return true;
      this.advanceToNextHand();
      return true;
    }

    this.turnStage = 'play';
    this.handValue = 3;
    this.emit('maoDe11Started', {
      team: this.maoDe11Team,
      handValue: 3,
      currentPlayer: this.currentPlayer
    }, 'all');
    this.emit('turn', { currentPlayer: this.currentPlayer }, 'all');
    this.scheduleOfflineTurn();
    return true;
  }

  fleeHand(playerIndex) {
    if (this.turnStage !== 'play') return false;
    if (this.maoDe11 || this.maoDeFerro) return false;
    if (playerIndex !== this.currentPlayer) return false;

    const fleeingTeam = playerIndex % 2;
    const winningTeam = 1 - fleeingTeam;
    this.scores[winningTeam] += this.handValue;

    this.emit('handEnd', {
      winnerTeam: winningTeam,
      points: this.handValue,
      scores: this.scores,
      setWins: this.setWins,
      draw: false
    }, 'all');

    if (this.checkSetOver(winningTeam)) return true;
    this.advanceToNextHand();
    return true;
  }

  callBet(playerIndex, betType) {
    if (this.maoDe11 || this.maoDeFerro) return false;
    if (this.turnStage !== 'play' || playerIndex !== this.currentPlayer) return false;
    if (this.betState) return false;
    if (!(betType in BET_VALUES)) return false;
    if (betType === 'truco' && this.handValue >= 3) return false;
    if (betType === 'retruco' && this.handValue >= 6) return false;
    if (betType === 'valenove' && this.handValue >= 9) return false;
    if (betType === 'valedoze' && this.handValue >= 12) return false;

    const challengerTeam = playerIndex % 2;

    if (this.handValue >= 3 && this.lastBetTeam === challengerTeam) return false;

    const responderTeam = 1 - challengerTeam;

    this.betState = {
      challenger: playerIndex,
      level: betType,
      responderTeam,
      responded: false
    };
    this.turnStage = 'respond';

    this.emit('betCalled', {
      challenger: playerIndex,
      level: betType,
      responderTeam
    }, 'all');

    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (i % 2 === responderTeam && !this.players[i].isBot) {
        this.emit('turnToRespond', { responderTeam }, this.players[i].id);
      }
    }

    this.scheduleOfflineResponse();
    return true;
  }

  respondBet(playerIndex, action) {
    if (this.turnStage !== 'respond' || !this.betState) return false;

    const responderTeam = this.betState.responderTeam;
    if (playerIndex % 2 !== responderTeam) return false;

    if (this.offlineActionTimer) {
      clearTimeout(this.offlineActionTimer);
      this.offlineActionTimer = null;
    }

    const { challenger, level } = this.betState;

    if (action === 'flee') {
      const points = this.getBetValueBefore(level);
      const challengerTeam = challenger % 2;
      this.scores[challengerTeam] += points;
      this.emit('handEnd', {
        winnerTeam: challengerTeam,
        points,
        scores: this.scores,
        setWins: this.setWins,
        draw: false
      }, 'all');

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

    if (nextLevel) {
      this.betState.level = nextLevel;
      this.betState.responderTeam = challenger % 2;
      this.betState.challenger = playerIndex;

      this.emit('betCalled', {
        challenger: playerIndex,
        level: nextLevel,
        responderTeam: challenger % 2
      }, 'all');

      for (let i = 0; i < NUM_PLAYERS; i++) {
        if (i % 2 === challenger % 2 && !this.players[i].isBot) {
          this.emit('turnToRespond', { responderTeam: challenger % 2 }, this.players[i].id);
        }
      }

      this.scheduleOfflineResponse();
      return true;
    }

    return false;
  }

  scheduleOfflineTurn() {
    if (this.turnStage !== 'play') return;

    const playerIndex = this.currentPlayer;
    const player = this.players[playerIndex];
    if (!player || player.isBot || player.online !== false) return;

    if (this.offlineActionTimer) clearTimeout(this.offlineActionTimer);

    this.offlineActionTimer = setTimeout(() => {
      this.offlineActionTimer = null;
      if (this.turnStage !== 'play' || this.currentPlayer !== playerIndex) return;

      const hand = this.hands[playerIndex];
      if (!hand || hand.length === 0) return;

      const card = chooseCard(hand, this.vira.rank);
      this.playCard(playerIndex, card);
    }, 1000 + Math.random() * 1200);
  }

  scheduleOfflineResponse() {
    if (this.turnStage !== 'respond' || !this.betState) return;

    const responderTeam = this.betState.responderTeam;
    const playerIndex = [responderTeam, responderTeam + 2]
      .find(index => this.players[index] && !this.players[index].isBot && this.players[index].online === false);

    if (playerIndex === undefined) return;

    if (this.offlineActionTimer) clearTimeout(this.offlineActionTimer);

    this.offlineActionTimer = setTimeout(() => {
      this.offlineActionTimer = null;
      if (this.turnStage !== 'respond' || !this.betState) return;

      const hand = this.hands[playerIndex];
      if (!hand) return;

      const action = respondBet(hand, this.vira.rank, this.betState.level);
      this.respondBet(playerIndex, action);
    }, 1200 + Math.random() * 1500);
  }

  getBetValueBefore(level) {
    if (level === 'truco') return 1;
    if (level === 'retruco') return 3;
    if (level === 'valenove') return 6;
    if (level === 'valedoze') return 9;
    return 1;
  }
}

module.exports = { Game4P };