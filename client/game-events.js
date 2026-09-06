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
