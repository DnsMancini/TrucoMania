const { cardStrength } = require('./utils');

const BOT_STYLES = [
  { name: 'Zé do Truco', aggression: 1.12, bluff: 0.17, courage: 1.08, patience: 0.88 },
  { name: 'Maria Ciganinha', aggression: 1.00, bluff: 0.11, courage: 1.00, patience: 1.00 },
  { name: 'João Capote', aggression: 0.92, bluff: 0.08, courage: 0.96, patience: 1.14 },
  { name: 'Tia Cotinha', aggression: 1.04, bluff: 0.14, courage: 1.03, patience: 0.96 }
];

function createBot(index) {
  const style = BOT_STYLES[index % BOT_STYLES.length];
  return { id: `bot_${index}_${Math.random().toString(36).substr(2, 5)}`, name: style.name, isBot: true, team: index % 2, style: { aggression: style.aggression, bluff: style.bluff, courage: style.courage, patience: style.patience } };
}

function getStyle(context = {}) { return context.style || { aggression: 1, bluff: 0.11, courage: 1, patience: 1 }; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function handInfo(hand, viraRank) {
  const strengths = hand.map(card => ({ card, strength: cardStrength(card, viraRank) })).sort((a, b) => b.strength - a.strength);
  const total = strengths.reduce((sum, item) => sum + item.strength, 0);
  const avg = strengths.length ? total / strengths.length : 0;
  const highCards = strengths.filter(item => item.strength >= 11).length;
  const manilhas = strengths.filter(item => item.strength >= 11);
  const top = strengths[0]?.strength || 0;
  const second = strengths[1]?.strength || 0;
  let confidence = clamp((avg - 4) / 9, 0, 1);
  if (highCards >= 2) confidence += 0.13;
  if (top >= 14) confidence += 0.12;
  if (top >= 12 && second >= 9) confidence += 0.05;
  confidence = clamp(confidence, 0, 1);
  return { strengths, avg, highCards, manilhas, top, second, confidence };
}

function publicCards(context = {}) {
  const rounds = Array.isArray(context.roundCards) ? context.roundCards : [];
  const currentRound = context.currentRound || 0;
  const current = rounds[currentRound] || [];
  const previous = [];
  for (let r = 0; r < Math.min(currentRound, rounds.length); r++) for (const card of (rounds[r] || [])) if (card) previous.push(card);
  return { current, previous, all: previous.concat(current.filter(Boolean)) };
}

function scorePressure(context = {}, team) {
  const scores = Array.isArray(context.scores) ? context.scores : [0, 0];
  const setWins = Array.isArray(context.setWins) ? context.setWins : [0, 0];
  const ownScore = scores[team] || 0;
  const oppScore = scores[1 - team] || 0;
  const ownSets = setWins[team] || 0;
  const oppSets = setWins[1 - team] || 0;
  let pressure = (oppScore - ownScore) / 12;
  if (oppScore >= 10 && ownScore <= 10) pressure += 0.16;
  if (ownScore >= 10 && oppScore <= 10) pressure -= 0.12;
  if (oppSets > ownSets) pressure += 0.10;
  if (ownSets > oppSets) pressure -= 0.08;
  return clamp(pressure, -0.35, 0.35);
}

function shouldCallBet(hand, viraRank, handValue, isMaoDe11, context = {}) {
  if (isMaoDe11 || !hand?.length) return null;
  const info = handInfo(hand, viraRank);
  const style = getStyle(context);
  const playerIndex = Number.isInteger(context.playerIndex) ? context.playerIndex : 0;
  const team = playerIndex % 2;
  const pressure = scorePressure(context, team);
  const roundWins = Array.isArray(context.roundWins) ? context.roundWins : [0, 0];
  const ownRounds = roundWins[team] || 0;
  const oppRounds = roundWins[1 - team] || 0;
  const currentRound = context.currentRound || 0;
  const publicCount = publicCards(context).all.length;
  const tacticalBonus = pressure * 0.65 + (ownRounds > oppRounds ? 0.04 : ownRounds < oppRounds ? 0.08 : 0) + (currentRound >= 1 ? 0.05 : 0) + (publicCount >= 4 ? 0.04 : 0);
  const confidence = info.confidence * style.aggression + tacticalBonus;
  if (handValue < 3) {
    if (confidence >= 0.64) return 'truco';
    const bluffChance = clamp(style.bluff * (0.55 + Math.max(0, pressure)), 0, 0.26);
    if (Math.random() < bluffChance && confidence >= 0.30) return 'truco';
    return null;
  }
  if (handValue === 3) {
    if (confidence >= 0.82 && Math.random() < 0.72) return 'retruco';
    if (confidence >= 0.70 && Math.random() < 0.25 * style.aggression) return 'retruco';
    if (confidence >= 0.42 && pressure > 0.10 && Math.random() < style.bluff * 0.22) return 'retruco';
    return null;
  }
  if (handValue === 6) {
    if (confidence >= 0.88 && Math.random() < 0.65) return 'valenove';
    if (confidence >= 0.76 && pressure > 0.08 && Math.random() < 0.20 * style.aggression) return 'valenove';
    return null;
  }
  if (handValue === 9) {
    if (confidence >= 0.93 && Math.random() < 0.55) return 'valedoze';
    if (confidence >= 0.84 && pressure > 0.12 && Math.random() < 0.12 * style.aggression) return 'valedoze';
  }
  return null;
}

function respondBet(hand, viraRank, betLevel, context = {}) {
  if (!hand?.length) return 'flee';
  const info = handInfo(hand, viraRank);
  const style = getStyle(context);
  const playerIndex = Number.isInteger(context.playerIndex) ? context.playerIndex : 0;
  const team = playerIndex % 2;
  const pressure = scorePressure(context, team);
  const roundWins = Array.isArray(context.roundWins) ? context.roundWins : [0, 0];
  const ownRounds = roundWins[team] || 0;
  const oppRounds = roundWins[1 - team] || 0;
  const currentRound = context.currentRound || 0;
  let courage = style.courage + pressure * 0.75;
  if (ownRounds > oppRounds) courage += 0.06;
  if (oppRounds > ownRounds) courage += 0.10;
  if (currentRound >= 1 && ownRounds < 1) courage += 0.05;
  const confidence = clamp(info.confidence * courage, 0, 1.15);
  if (betLevel === 'truco') {
    if (confidence >= 0.72) { if (confidence >= 0.90 && Math.random() < 0.26 * style.aggression) return 'retruco'; return 'accept'; }
    if (confidence >= 0.57) { if (Math.random() < 0.82) return 'accept'; if (Math.random() < style.bluff * 0.45) return 'retruco'; return 'flee'; }
    if (confidence >= 0.40) { if (pressure > 0.12 && Math.random() < 0.62 * style.courage) return 'accept'; if (Math.random() < style.bluff * 0.32) return 'retruco'; return Math.random() < 0.48 ? 'accept' : 'flee'; }
    if (pressure > 0.20 && Math.random() < 0.30 * style.courage) return 'accept';
    return Math.random() < 0.22 ? 'accept' : 'flee';
  }
  if (betLevel === 'retruco') {
    if (confidence >= 0.78) { if (confidence >= 0.92 && Math.random() < 0.23 * style.aggression) return 'valenove'; return 'accept'; }
    if (confidence >= 0.60) return Math.random() < 0.72 ? 'accept' : 'flee';
    if (confidence >= 0.46 && pressure > 0.14) return Math.random() < 0.48 ? 'accept' : 'flee';
    return Math.random() < 0.16 * style.courage ? 'accept' : 'flee';
  }
  if (betLevel === 'valenove') {
    if (confidence >= 0.86) { if (confidence >= 0.96 && Math.random() < 0.18 * style.aggression) return 'valedoze'; return 'accept'; }
    if (confidence >= 0.67) return Math.random() < 0.62 ? 'accept' : 'flee';
    if (confidence >= 0.52 && pressure > 0.15) return Math.random() < 0.35 ? 'accept' : 'flee';
    return 'flee';
  }
  if (betLevel === 'valedoze') { if (confidence >= 0.72) return 'accept'; if (confidence >= 0.56 && pressure > 0.18 && Math.random() < 0.32) return 'accept'; return 'flee'; }
  return 'flee';
}

function chooseCard(hand, viraRank, context = {}) {
  if (!hand?.length) return null;

  const info = handInfo(hand, viraRank);
  const playerIndex = Number.isInteger(context.playerIndex) ? context.playerIndex : 0;
  const team = playerIndex % 2;
  const { current: currentRoundCards } = publicCards(context);
  const roundWins = Array.isArray(context.roundWins) ? context.roundWins : [0, 0];
  const ownRounds = roundWins[team] || 0;
  const oppRounds = roundWins[1 - team] || 0;
  const currentRound = Number.isInteger(context.currentRound) ? context.currentRound : 0;
  const pressure = scorePressure(context, team);

  const validCards = hand.map(card => ({ card, strength: cardStrength(card, viraRank) }));
  const cardsRemainingAfterPlay = Math.max(0, hand.length - 1);
  const strongestOnTable = currentRoundCards.reduce((max, card) => card ? Math.max(max, cardStrength(card, viraRank)) : max, -Infinity);
  const teammateIndex = (playerIndex + 2) % 4;
  const teammateCard = currentRoundCards[teammateIndex] || null;
  const teammateWinning = Boolean(teammateCard && cardStrength(teammateCard, viraRank) === strongestOnTable);
  const beatingCards = validCards.filter(item => item.strength > strongestOnTable).sort((a, b) => a.strength - b.strength);
  const sortedAsc = validCards.slice().sort((a, b) => a.strength - b.strength);

  // Se o parceiro já está ganhando, não queima uma carta boa. Na última carta,
  // porém, não existe mais o que preservar: joga a menor disponível.
  if (teammateWinning && strongestOnTable > -Infinity) {
    return sortedAsc[0].card;
  }

  // Se ninguém colocou carta, a saída deve administrar a mão inteira.
  if (strongestOnTable === -Infinity) {
    if (currentRound === 0) {
      if (info.top >= 14 && info.second >= 10 && Math.random() < 0.20) {
        return validCards.find(item => item.strength === info.second)?.card || sortedAsc[0].card;
      }
      const r = Math.random();
      if (r < 0.58) return sortedAsc[0].card;
      if (r < 0.88) return sortedAsc[Math.min(1, sortedAsc.length - 1)].card;
      return validCards.slice().sort((a, b) => b.strength - a.strength)[0].card;
    }
    if (ownRounds > oppRounds) return sortedAsc[Math.min(1, sortedAsc.length - 1)].card;
    if (oppRounds > ownRounds || pressure > 0.10) return validCards.slice().sort((a, b) => b.strength - a.strength)[0].card;
    return sortedAsc[Math.min(1, sortedAsc.length - 1)].card;
  }

  // Se há como ganhar, usa a menor carta que ganha. Isso evita gastar uma
  // manilha superior quando uma inferior já resolve a rodada.
  if (beatingCards.length) {
    const cheapestWinner = beatingCards[0];
    const strongest = validCards.slice().sort((a, b) => b.strength - a.strength)[0];

    // Se ainda haverá rodada e a única forma de ganhar é gastar uma carta
    // muito valiosa, preservar pode ser melhor que ganhar uma rodada pequena.
    // Na última carta não preservamos: é a última oportunidade.
    const onlyWinner = beatingCards.length === 1;
    const isVeryStrong = cheapestWinner.strength >= 11;
    const canPreserve = cardsRemainingAfterPlay > 0 && onlyWinner && isVeryStrong;
    const trailing = oppRounds > ownRounds;

    if (canPreserve && !trailing && currentRound < 2) {
      return sortedAsc[0].card;
    }

    // Se temos mais de uma carta capaz de ganhar, sempre usamos a mais barata.
    // Se estamos na última carta, isso também é obrigatório do ponto de vista
    // estratégico: não existe rodada futura para guardar a carta.
    return cheapestWinner.card || strongest.card;
  }

  // Não dá para ganhar a rodada. Aqui está a regra de preservação:
  // com cartas futuras, descarta a menor e guarda as fortes; na última carta,
  // simplesmente joga a única carta que restou.
  if (cardsRemainingAfterPlay > 0) {
    return sortedAsc[0].card;
  }

  return sortedAsc[0].card;
}

module.exports = { createBot, shouldCallBet, respondBet, chooseCard };
