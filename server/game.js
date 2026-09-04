const { Game4P: BaseGame4P } = require('./game-engine');

class Game4P extends BaseGame4P {
  playCard(playerIndex, card) {
    if (this.maoDeFerro && card && Number.isInteger(card.blindIndex)) {
      const hand = this.hands[playerIndex] || [];
      const index = card.blindIndex;
      if (index < 0 || index >= hand.length) return false;
      return super.playCard(playerIndex, hand[index]);
    }
    return super.playCard(playerIndex, card);
  }
}

module.exports = { Game4P };
