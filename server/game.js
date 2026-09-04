const { Game4P: BaseGame4P } = require('./game-engine');
const { cardStrength } = require('./utils');
const { shouldCallBet } = require('./bot');

const NUM_PLAYERS = 4;
const ROUND_DISPLAY_MS = 2500;

class Game4P extends BaseGame4P {
  playCard(playerIndex, card) {
    if (this.maoDeFerro && this.players[playerIndex]?.isBot) {
      const hand = this.hands[playerIndex] || [];
      if (!hand.length) return false;
      const randomIndex = Math.floor(Math.random() * hand.length);
      return super.playCard(playerIndex, hand[randomIndex]);
    }

    if (this.maoDeFerro && card && Number.isInteger(card.blindIndex)) {
      const hand = this.hands[playerIndex] || [];
      const index = card.blindIndex;
      if (index < 0 || index >= hand.length) return false;
      return super.playCard(playerIndex, hand[index]);
    }

    if (
      this.players[playerIndex]?.isBot &&
      this.turnStage === 'play' &&
      !this.betState &&
      !this.maoDe11 &&
      !this.maoDeFerro
    ) {
      const context = {
        hand: this.hands[playerIndex] || [],
        vira: this.vira,
        handValue: this.handValue,
        maoDe11: this.maoDe11,
        playerIndex,
        scores: this.scores,
        setWins: this.setWins,
        roundWins: this.roundWins,
        currentRound: this.currentRound,
        roundCards: this.roundCards,
        turnStage: this.turnStage,
        betState: this.betState,
        style: this.players[playerIndex]?.style
      };
      const betType = shouldCallBet(
        context.hand,
        this.vira?.rank,
        this.handValue,
        false,
        context
      );

      if (betType && this.callBet(playerIndex, betType)) return true;
    }

    return super.playCard(playerIndex, card);
  }

  advanceToNextHand() {
    this.turnStage = 'handTransition';
    return super.advanceToNextHand();
  }

  resolveRound() {
    const round = this.roundCards[this.currentRound] || [];
    let maxStrength = -Infinity;

    for (const card of round) {
      if (card) maxStrength = Math.max(maxStrength, cardStrength(card, this.vira.rank));
    }

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
      const first = this.roundWinners[0];
      const second = this.roundWinners[1];

      if (first === -1 && second !== -1) return this.endHand(second);
      if (first !== -1 && second === -1) return this.endHand(first);
      if (first !== -1 && first === second) return this.endHand(first);
    }

    if (this.roundWins[0] >= 2 || this.roundWins[1] >= 2) {
      return this.endHand(this.roundWins[0] >= 2 ? 0 : 1);
    }

    if (this.currentRound >= 2) {
      // No Truco Paulista, empate na 3ª rodada leva a mão ao vencedor da 1ª.
      // Se a 1ª também empatou, vale o vencedor da 2ª. Se todas empataram, ninguém pontua.
      const winningTeam = winnerTeam !== -1
        ? winnerTeam
        : (this.roundWinners[0] !== -1 ? this.roundWinners[0] : this.roundWinners[1]);
      return this.endHand(winningTeam ?? -1);
    }

    this.currentRound++;
    this.playersInRound = 0;

    const nextRoundStarter = winnerPlayer !== -1 ? winnerPlayer : this.roundStarter;
    this.roundStarter = nextRoundStarter;
    this.currentPlayer = nextRoundStarter;

    if (this.offlineActionTimer) {
      clearTimeout(this.offlineActionTimer);
      this.offlineActionTimer = null;
    }
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
}

module.exports = { Game4P };
