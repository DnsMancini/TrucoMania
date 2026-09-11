(function () {
  function addTableCard(player, card, round, hidden = false, animate = true) {
    const mesaCartas = document.getElementById('mesaCartas');
    if (!mesaCartas || player === undefined || player === null) return;

    const existing = mesaCartas.querySelector(`[data-card-player="${player}"][data-card-round="${round}"]`);
    if (existing) return;

    const rotatedPlayers = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
    const relPos = rotatedPlayers.indexOf(player);
    const posicoes = ['c0', 'c3', 'c2', 'c1'];
    const cartaDiv = document.createElement('div');

    cartaDiv.className = `cartaMesa ${posicoes[relPos >= 0 ? relPos : player]}`;
    cartaDiv.dataset.cardPlayer = String(player);
    cartaDiv.dataset.cardRound = String(round);
    cartaDiv.innerHTML = hidden ? '<div class="carta virada"></div>' : createCardHTML(card);

    if (!animate) {
      cartaDiv.style.opacity = '1';
      cartaDiv.style.animation = 'none';
      cartaDiv.style.translate = '0 0';
    }

    mesaCartas.appendChild(cartaDiv);

    if (animate) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (cartaDiv.isConnected) cartaDiv.style.translate = '0 0';
      }));
    }
  }

  window.gameTable = { addTableCard };
})();
