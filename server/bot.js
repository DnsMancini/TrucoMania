const { cardStrength } = require('./utils');

function createBot(index) {
  const names = ['Zé do Truco', 'Maria Ciganinha', 'João Capote', 'Tia Cotinha'];
  return {
    id: `bot_${index}_${Math.random().toString(36).substr(2, 5)}`,
    name: names[index % names.length],
    isBot: true
  };
}

function shouldCallBet(hand, viraRank, handValue, isMaoDe11) {
  if (isMaoDe11) return null;
  const strengths = hand.map(c => cardStrength(c, viraRank)).sort((a,b) => b-a);
  const avg = strengths.reduce((a,b)=>a+b,0)/3;
  const max = strengths[0];
  const manilhaStrength = 10 + 4;
  const highCards = strengths.filter(s => s >= manilhaStrength).length;
  if (highCards >= 2) return 'truco';
  if (max >= manilhaStrength && avg > 8) return 'truco';
  if (handValue < 3 && avg > 9) return 'truco';
  if (handValue === 3 && avg > 10 && Math.random() < 0.4) return 'retruco';
  return null;
}

function respondBet(hand, viraRank, betLevel) {
  const strengths = hand.map(c => cardStrength(c, viraRank)).sort((a,b) => b-a);
  const avg = strengths.reduce((a,b)=>a+b,0)/3;
  const manilhaStrength = 10 + 4;
  const highCards = strengths.filter(s => s >= manilhaStrength).length;
  const hasZap = strengths[0] >= 14;

  if (avg < 5) return 'flee';
  if (betLevel === 'truco') {
    if (highCards >= 2 || hasZap) return 'accept';
    if (avg > 8) return Math.random() < 0.3 ? 'retruco' : 'accept';
    if (avg > 6) return Math.random() < 0.2 ? 'retruco' : 'accept';
    return Math.random() < 0.5 ? 'accept' : 'flee';
  }
  if (betLevel === 'retruco') {
    if (highCards >= 2 || hasZap) return 'accept';
    if (avg > 8) return Math.random() < 0.3 ? 'valequatro' : 'accept';
    return Math.random() < 0.4 ? 'accept' : 'flee';
  }
  if (betLevel === 'valequatro') return avg > 8 ? 'accept' : 'flee';
  return 'flee';
}

function chooseCard(hand, viraRank) {
  const cardsWithStrength = hand.map(c => ({ card: c, strength: cardStrength(c, viraRank) }));
  cardsWithStrength.sort((a, b) => b.strength - a.strength);
  return cardsWithStrength[0].card;
}

module.exports = { createBot, shouldCallBet, respondBet, chooseCard };