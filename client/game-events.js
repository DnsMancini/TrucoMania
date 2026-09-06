(() => {
  'use strict';

  if (window.trucoGameEventsLoaded) return;
  window.trucoGameEventsLoaded = true;

  let myPlayerIndex = null;
  const MAX_EVENTS = 5;
  let panel = null;
  let list = null;

  const ensurePanel = () => {
    if (panel && list) return;

    panel = document.createElement('section');
    panel.id = 'painelEventosPartida';
    panel.setAttribute('aria-label', 'Eventos da partida');
    panel.innerHTML = '<div class="eventos-partida-titulo">⚡ Eventos</div><div id="listaEventosPartida"></div>';
    document.body.appendChild(panel);
    list = panel.querySelector('#listaEventosPartida');
  };

  const clearEvents = () => {
    ensurePanel();
    list.innerHTML = '';
  };

  const addEvent = (text, kind = '') => {
    if (!text) return;
    ensurePanel();
    const item = document.createElement('div');
    item.className = `evento-partida ${kind}`.trim();
    item.textContent = text;
    list.prepend(item);
    while (list.children.length > MAX_EVENTS) list.lastElementChild.remove();
    panel.classList.add('tem-eventos');
  };

  const getName = playerIndex => {
    if (playerIndex === myPlayerIndex) return 'Você';
    const players = [0, 1, 2, 3];
    if (myPlayerIndex === null) return document.querySelector(`#p${playerIndex} .name`)?.textContent?.trim() || `Jogador ${playerIndex + 1}`;
    const rotated = players.map((_, i) => players[(myPlayerIndex - i + players.length) % players.length]);
    const visualIndex = rotated.indexOf(playerIndex);
    const slotOrder = ['p0', 'p3', 'p2', 'p1'];
    const slotId = slotOrder[visualIndex] || `p${playerIndex}`;
    return document.querySelector(`#${slotId} .name`)?.textContent?.trim() || `Jogador ${playerIndex + 1}`;
  };

  const cardLabel = card => {
    if (!card) return 'uma carta';
    const suits = { paus: 'Paus', copas: 'Copas', espadas: 'Espadas', ouros: 'Ouros' };
    return `${card.rank} de ${suits[card.suit] || card.suit || ''}`.replace(' de ', ' de ');
  };

  const betLabel = level => ({
    truco: 'TRUCO',
    retruco: 'RETRUCO',
    valenove: 'VALE 9',
    valedoze: 'VALE 12'
  }[level] || String(level || '').toUpperCase());

  const setup = () => {
    ensurePanel();
    const socket = window.trucoSocket;
    if (!socket || socket.__gameEventsPanelBound) return;
    socket.__gameEventsPanelBound = true;

    socket.on('handStart', data => {
      myPlayerIndex = data?.player ?? null;
      clearEvents();
      addEvent('🔄 Nova mão começou', 'system');
    });

    socket.on('gameStateRestore', data => {
      myPlayerIndex = data?.player ?? myPlayerIndex;
      clearEvents();
      addEvent('🔄 Partida restaurada', 'system');
    });

    socket.on('cardPlayed', data => {
      const name = getName(data?.player);
      addEvent(`🃏 ${name} jogou ${cardLabel(data?.card)}`);
    });

    socket.on('betCalled', data => {
      addEvent(`🔥 ${getName(data?.challenger)} pediu ${betLabel(data?.level)}!`, 'bet');
    });

    socket.on('betRaised', data => {
      addEvent(`🔥 ${getName(data?.challenger)} aumentou para ${betLabel(data?.level)}!`, 'bet');
    });

    socket.on('betAccepted', data => {
      addEvent(`✅ ${getName(myPlayerIndex)} aceitou — valendo ${data?.handValue ?? '?'}!`, 'bet');
    });

    socket.on('roundResult', data => {
      if (data?.winner === -1) addEvent('🤝 Rodada empatada');
      else addEvent(`🏆 ${getName(data.winner)} venceu a rodada`, 'result');
    });

    socket.on('handEnd', data => {
      if (data?.winnerTeam === -1) addEvent('🤝 Mão empatada — ninguém pontua', 'result');
      else addEvent(data.winnerTeam === (myPlayerIndex % 2) ? `🏆 Seu time ganhou a mão (+${data.points ?? '?'} pts)` : `🏆 Time adversário ganhou a mão (+${data.points ?? '?'} pts)`, 'result');
    });

    socket.on('setStart', data => {
      addEvent(`🔄 Novo set — ${data?.setWins?.[0] ?? 0} x ${data?.setWins?.[1] ?? 0}`, 'system');
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
