(() => {
  'use strict';

  const setup = () => {
    if (document.getElementById('gameEventsInitialized')) return;
    const socket = window.trucoSocket;
    if (!socket) return;

    const panel = document.createElement('div');
    panel.id = 'painelEventosPartida';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<div class="eventos-partida-lista"></div>';
    document.body.appendChild(panel);

    const list = panel.querySelector('.eventos-partida-lista');
    const marker = document.createElement('span');
    marker.id = 'gameEventsInitialized';
    marker.hidden = true;
    panel.appendChild(marker);

    const timers = new Map();
    const addEvent = (text, type = '') => {
      if (!text) return;
      const item = document.createElement('div');
      item.className = `evento-partida ${type}`.trim();
      item.textContent = text;
      list.appendChild(item);
      while (list.children.length > 4) list.firstElementChild.remove();
      requestAnimationFrame(() => item.classList.add('visivel'));
      const timer = setTimeout(() => {
        item.classList.remove('visivel');
        setTimeout(() => item.remove(), 250);
      }, 4200);
      timers.set(item, timer);
    };

    const playerName = index => {
      const el = document.querySelector(`#p${index} .name, #p${index} .player-name`);
      return el?.textContent?.trim() || (index === window.myPlayerIndex ? 'Você' : `Jogador ${Number(index) + 1}`);
    };

    socket.on('handStart', data => {
      const round = data?.round ?? data?.hand ?? null;
      if (round != null) addEvent(`Rodada ${round}`, 'round');
    });
    socket.on('cardPlayed', data => {
      const name = playerName(data?.playerIndex ?? data?.player ?? 0);
      addEvent(`${name} jogou uma carta.`);
    });
    socket.on('betCalled', data => {
      const name = playerName(data?.playerIndex ?? data?.player ?? 0);
      addEvent(`${name} pediu Truco!`, 'bet');
    });
    socket.on('betRaised', data => {
      const name = playerName(data?.playerIndex ?? data?.player ?? 0);
      const value = data?.value ?? data?.bet ?? '';
      addEvent(`${name} aumentou${value ? ` para ${value}` : ''}!`, 'bet');
    });
    socket.on('betAccepted', data => {
      const name = playerName(data?.playerIndex ?? data?.player ?? 0);
      addEvent(`${name} aceitou.`, 'bet');
    });
    socket.on('roundResult', data => {
      if (data?.winner != null) addEvent(`Mão para ${playerName(data.winner)}.`, 'round');
      else addEvent('Mão encerrada.', 'round');
    });
    socket.on('handEnd', () => addEvent('Rodada encerrada.', 'round'));
    socket.on('setStart', data => addEvent(`Novo set — ${data?.score ?? ''}`.trim(), 'round'));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

// Resultado da rodada: mantém as quatro cartas visíveis e destaca a vencedora.
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

  socket.on('cardPlayed', () => cleanup());

  socket.on('roundResult', ({ winner }) => {
    const mesaCartas = document.getElementById('mesaCartas');
    if (!mesaCartas) return;
    cleanup();

    const snapshot = Array.from(mesaCartas.children).map((el) => ({
      html: el.outerHTML,
      player: el.dataset.cardPlayer
    }));
    if (!snapshot.length) return;

    const winnerCard = snapshot.find((item) => String(item.player) === String(winner));
    if (winnerCard) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = winnerCard.html;
      wrapper.firstElementChild?.classList.add('cartaMesa-destaque');
      winnerCard.html = wrapper.innerHTML;
    }

    // O game.js limpa a mesa em 1200ms; restauramos antes disso.
    restoreTimer = setTimeout(() => {
      if (!mesaCartas.children.length) {
        snapshot.forEach((item) => mesaCartas.insertAdjacentHTML('beforeend', item.html));
      }
    }, 1050);

    // Deixa o resultado tempo suficiente para conferência visual.
    clearTimer = setTimeout(() => {
      mesaCartas.innerHTML = '';
      cleanup();
    }, 3800);
  });
})();
