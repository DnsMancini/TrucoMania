(() => {
  'use strict';

  const socket = window.trucoSocket;
  if (!socket) return;

  let restoreTimer = null;
  let clearTimer = null;

  const cleanup = () => {
    if (restoreTimer) clearTimeout(restoreTimer);
    if (clearTimer) clearTimeout(clearTimer);
    restoreTimer = null;
    clearTimer = null;
  };

  socket.on('cardPlayed', () => {
    cleanup();
  });

  socket.on('roundResult', ({ round, winner }) => {
    const mesaCartas = document.getElementById('mesaCartas');
    if (!mesaCartas) return;

    cleanup();

    // Guarda as quatro cartas antes do timer antigo do jogo limpar a mesa.
    const snapshot = Array.from(mesaCartas.children).map((el) => ({
      html: el.outerHTML,
      player: el.dataset.cardPlayer
    }));

    if (!snapshot.length) return;

    // Destaca somente a carta do jogador vencedor; as outras continuam visíveis.
    const winnerCard = snapshot.find((item) => String(item.player) === String(winner));
    if (winnerCard) {
      const parser = document.createElement('div');
      parser.innerHTML = winnerCard.html;
      parser.firstElementChild?.classList.add('cartaMesa-destaque');
      winnerCard.html = parser.innerHTML;
    }

    // O game.js limpa a mesa em 1200ms. Restauramos pouco antes disso,
    // mantendo o resultado visível sem alterar a lógica da rodada seguinte.
    restoreTimer = setTimeout(() => {
      if (!mesaCartas.children.length) {
        snapshot.forEach((item) => mesaCartas.insertAdjacentHTML('beforeend', item.html));
      }
    }, 1050);

    // Tempo suficiente para conferir a carta vencedora antes de limpar.
    clearTimer = setTimeout(() => {
      mesaCartas.innerHTML = '';
      cleanup();
    }, 3800);
  });
})();
