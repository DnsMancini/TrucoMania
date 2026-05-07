const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const SUIT_STRENGTH = { ouros: 1, espadas: 2, copas: 3, paus: 4 };

function getManilhaRank(viraRank) {
  const idx = RANKS.indexOf(viraRank);
  return RANKS[(idx + 1) % RANKS.length];
}

function cardStrength(card, viraRank) {
  if (!viraRank) return { '4':1,'5':2,'6':3,'7':4,'Q':5,'J':6,'K':7,'A':8,'2':9,'3':10 }[card.rank];
  const manilhaRank = getManilhaRank(viraRank);
  if (card.rank === manilhaRank) return 10 + SUIT_STRENGTH[card.suit];
  return { '4':1,'5':2,'6':3,'7':4,'Q':5,'J':6,'K':7,'A':8,'2':9,'3':10 }[card.rank];
}

module.exports = { RANKS, SUIT_STRENGTH, getManilhaRank, cardStrength };