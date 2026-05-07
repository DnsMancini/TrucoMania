// Função para criar um bot com nome aleatório
function createBot(index) {
  const names = ['Zé do Truco', 'Maria Ciganinha', 'João Capote', 'Tia Cotinha'];
  return {
    id: `bot_${index}_${Math.random().toString(36).substr(2, 5)}`,
    name: names[index % names.length],
    isBot: true
  };
}

// Decide se o bot pede truco com base na força da mão
function shouldCallBet(hand, viraRank, handValue, isMaoDe11) {
  if (isMaoDe11) return null;
  // Calcula força média das cartas (considerando manilhas)
  const strengths = hand.map(c => cardStrength(c, viraRank)).sort((a,b) => b-a);
  const avg = strengths.reduce((a,b)=>a+b,0)/3;
  const max = strengths[0];
  // Se tiver duas manilhas ou carta muito forte, tende a pedir truco
  const manilhaStrength = 10 + Math.max(...Object.values({ouros:1,espadas:2,copas:3,paus:4}));
  const highCards = strengths.filter(s => s >= manilhaStrength).length;
  if (highCards >= 2) return 'truco';
  if (max >= manilhaStrength && avg > 8) return 'truco';
  if (handValue < 3 && avg > 9) return 'truco';
  if (handValue === 3 && avg > 10 && Math.random() < 0.4) return 'retruco';
  return null;
}

// Resposta do bot a um pedido de truco
function respondBet(hand, viraRank, betLevel) {
  const strengths = hand.map(c => cardStrength(c, viraRank)).sort((a,b) => b-a);
  const avg = strengths.reduce((a,b)=>a+b,0)/3;
  const manilhaStrength = 10 + 4; // máxima da manilha (paus)
  const highCards = strengths.filter(s => s >= manilhaStrength).length;
  const hasZap = strengths[0] >= 14; // zap (4 de paus?) Na verdade manilha de paus = 10+4=14

  // Fugir se mão muito fraca
  if (avg < 5) return 'flee';
  // Se mão excelente, aceitar ou retrucar
  if (betLevel === 'truco') {
    if (highCards >= 2 || hasZap) return 'accept'; // até poderia retrucar, mas vamos simplificar
    if (avg > 8) return Math.random() < 0.3 ? 'retruco' : 'accept';
    if (avg > 6) return Math.random() < 0.2 ? 'retruco' : 'accept';
    return Math.random() < 0.5 ? 'accept' : 'flee';
  }
  if (betLevel === 'retruco') {
    if (highCards >= 2 || hasZap) return 'accept';
    if (avg > 8) return Math.random() < 0.3 ? 'valequatro' : 'accept';
    return Math.random() < 0.4 ? 'accept' : 'flee';
  }
  if (betLevel === 'valequatro') {
    return avg > 8 ? 'accept' : 'flee';
  }
  return 'flee';
}

// Escolhe a melhor carta para jogar (simples: maior força primeiro)
function chooseCard(hand, viraRank, roundCards, currentRound, playerIndex) {
  const cardsWithStrength = hand.map(c => ({
    card: c,
    strength: cardStrength(c, viraRank)
  }));
  cardsWithStrength.sort((a, b) => b.strength - a.strength);
  // Joga a mais forte se for a primeira rodada, caso contrário pode usar lógica mais complexa
  // Para simplificar, sempre joga a mais forte
  return cardsWithStrength[0].card;
}

// Função auxiliar (importada do game para evitar duplicação, mas vamos copiar)
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const SUIT_STRENGTH = { ouros:1, espadas:2, copas:3, paus:4 };
function getManilhaRank(viraRank) {
  const idx = RANKS.indexOf(viraRank);
  return RANKS[(idx + 1) % RANKS.length];
}
function cardStrength(card, viraRank) {
  if (!viraRank) return { '4':1,'5':2,'6':3,'7':4,'Q':5,'J':6,'K':7,'A':8,'2':9,'3':10 }[card.rank];
  const manilhaRank = getManilhaRank(viraRank);
  if (card.rank === manilhaRank) {
    return 10 + SUIT_STRENGTH[card.suit];
  }
  return { '4':1,'5':2,'6':3,'7':4,'Q':5,'J':6,'K':7,'A':8,'2':9,'3':10 }[card.rank];
}

module.exports = { createBot, shouldCallBet, respondBet, chooseCard };