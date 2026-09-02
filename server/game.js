const crypto = require('crypto');
const SUITS = ['paus', 'copas', 'espadas', 'ouros'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const { cardStrength } = require('./utils');
const { chooseCard, respondBet: chooseBotBet } = require('./bot');

const BET_VALUES = { truco: 3, retruco: 6, valenove: 9, valedoze: 12 };
const CARDS_PER_PLAYER = 3;
const NUM_PLAYERS = 4;
const WIN_SCORE = 12;
const MAO_DE_11_TRIGGER = 11;
const DECISION_TIMEOUT = 25000;

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

function isValidPlayerIndex(playerIndex) { return Number.isInteger(playerIndex) && playerIndex >= 0 && playerIndex < NUM_PLAYERS; }
function isValidCard(card) { return Boolean(card && typeof card === 'object' && !Array.isArray(card) && typeof card.suit === 'string' && SUITS.includes(card.suit) && typeof card.rank === 'string' && RANKS.includes(card.rank)); }
function isValidBetType(betType) { return typeof betType === 'string' && Object.prototype.hasOwnProperty.call(BET_VALUES, betType); }
function isValidBetAction(action) { return typeof action === 'string' && ['flee', 'accept', 'retruco', 'valenove', 'valedoze'].includes(action); }
function isValidMaoDe11Action(action) { return action === 'play' || action === 'flee'; }

class Game4P {
  constructor(roomId, players, emit, onMatchOver = null, onBeforeNewHand = null) {
    this.roomId = roomId; this.players = players; this.emit = emit; this.onMatchOver = onMatchOver; this.onBeforeNewHand = onBeforeNewHand;
    this.setWins = [0, 0]; this.scores = [0, 0]; this.dealerIndex = 0;
    this.handValue = 1; this.maoDe11 = false; this.maoDe11Team = null; this.maoDe11DecisionMade = false; this.maoDeFerro = false;
    this.deck = []; this.hands = [[], [], [], []]; this.vira = null; this.currentPlayer = 0; this.turnStage = 'play'; this.betState = null; this.lastBetTeam = null;
    this.roundCards = []; this.roundWins = [0, 0]; this.roundWinners = []; this.currentRound = 0; this.playersInRound = 0; this.roundStarter = 0;
    this.checkBotTurn = null; this.offlineActionTimer = null;
  }
