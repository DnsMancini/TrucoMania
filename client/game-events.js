(() => {
  'use strict';

  const setup = () => {
    if (document.getElementById('gameEventsInitialized')) return;
    const socket = window.trucoSocket;
    if (!socket) return;

    const panel = document.createElement('div');
    panel.id = 'painelEventosPartida';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<div class="eventos-partida-lista"></div><span id="gameEventsInitialized" hidden></span>';
    document.body.appendChild(panel);
    const list = panel.querySelector('.eventos-partida-lista');

    const addEvent = (text, type = '') => {
      if (!text) return;
      const item = document.createElement('div');
      item.className = `evento-partida ${type}`.trim();
      item.textContent = text;
      list.appendChild(item);
      while (list.children.length > 4) list.firstElementChild.remove();
      requestAnimationFrame(() => item.classList.add('visivel'));
      setTimeout(() => { item.classList.remove('visivel'); setTimeout(() => item.remove(), 250); }, 4200);
    };

    const playerName = index => {
      const el = document.querySelector(`#p${index} .name, #p${index} .player-name`);
      return el?.textContent?.trim() || (index === window.myPlayerIndex ? 'Você' : `Jogador ${Number(index) + 1}`);
    };

    socket.on('handStart', data => {
      const round = data?.round ?? data?.hand ?? null;
      if (round != null) addEvent(`Rodada ${round}`, 'round');
      window.limparAnuncioTruco?.();
    });
    socket.on('cardPlayed', data => {
      addEvent(`${playerName(data?.playerIndex ?? data?.player ?? 0)} jogou uma carta.`);
    });
    socket.on('betCalled', data => {
      addEvent(`${playerName(data?.playerIndex ?? data?.player ?? 0)} pediu Truco!`, 'bet');
      window.mostrarAnuncioTruco?.(data?.level || 'truco');
    });
    socket.on('betRaised', data => {
      const value = data?.value ?? data?.bet ?? '';
      addEvent(`${playerName(data?.playerIndex ?? data?.player ?? 0)} aumentou${value ? ` para ${value}` : ''}!`, 'bet');
      window.mostrarAnuncioTruco?.(data?.level || data?.bet || data?.value);
    });
    socket.on('betAccepted', data => {
      addEvent(`${playerName(data?.playerIndex ?? data?.player ?? 0)} aceitou.`, 'bet');
      window.limparAnuncioTruco?.();
    });
    socket.on('betFled', data => {
      addEvent(`${playerName(data?.playerIndex ?? data?.player ?? 0)} correu.`, 'bet');
      window.limparAnuncioTruco?.();
    });
    socket.on('betRejected', () => window.limparAnuncioTruco?.());
    socket.on('roundResult', data => {
      if (data?.winner != null) addEvent(`Mão para ${playerName(data.winner)}.`, 'round');
      else addEvent('Mão encerrada.', 'round');
      window.limparAnuncioTruco?.();
    });
    socket.on('handEnd', () => {
      addEvent('Rodada encerrada.', 'round');
      window.limparAnuncioTruco?.();
    });
    socket.on('setStart', data => addEvent(`Novo set — ${data?.score ?? ''}`.trim(), 'round'));
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();

(() => {
  'use strict';
  const labels = { truco: 'TRUCO!', retruco: 'TRUCO 6!', valenove: 'TRUCO 9!', valedoze: 'TRUCO 12!', '6': 'TRUCO 6!', '9': 'TRUCO 9!', '12': 'TRUCO 12!' };
  window.mostrarAnuncioTruco = level => {
    const text = labels[level] || labels.truco;
    let el = document.getElementById('anuncioTruco');
    if (!el) { el = document.createElement('div'); el.id = 'anuncioTruco'; document.body.appendChild(el); }
    el.innerHTML = '';
    [...text].forEach((char, index) => {
      const span = document.createElement('span');
      span.textContent = char === ' ' ? '\u00a0' : char;
      span.style.setProperty('--i', index);
      span.style.setProperty('--n', text.length);
      el.appendChild(span);
    });
    el.classList.add('visivel');
  };
  window.limparAnuncioTruco = () => document.getElementById('anuncioTruco')?.classList.remove('visivel');
})();

(() => {
  'use strict';
  const voltarAoLobby = novaPartida => {
    const socket = window.trucoSocket;
    const lobby = document.getElementById('lobby');
    const gameWrapper = document.getElementById('gameWrapper');
    const telaFinal = document.getElementById('telaFinal');
    const contagem = document.getElementById('contagemRegressiva');
    const mesa = document.getElementById('mesaCartas');
    const mao = document.getElementById('mao');
    const vira = document.getElementById('vira');
    const btnTruco = document.getElementById('btnTruco');
    const btnCorrer = document.getElementById('btnCorrer');
    const mostrarLobby = () => {
      gameWrapper?.classList.add('game-hidden');
      lobby?.classList.remove('game-hidden');
      contagem?.classList.add('oculto');
      telaFinal?.classList.remove('show');
      if (mesa) mesa.innerHTML = '';
      if (mao) mao.innerHTML = '';
      if (vira) { vira.innerHTML = ''; vira.classList.add('oculto'); }
      btnTruco?.classList.add('oculto');
      btnCorrer?.classList.add('oculto');
      window.limparAnuncioTruco?.();
      window.getRooms?.();
    };
    if (!socket?.connected) { mostrarLobby(); if (novaPartida) setTimeout(() => document.getElementById('randomMatchBtn')?.click(), 0); return; }
    socket.emit('leaveRoom', () => { mostrarLobby(); if (novaPartida) setTimeout(() => document.getElementById('randomMatchBtn')?.click(), 0); });
  };
  const instalar = () => {
    const voltar = document.getElementById('btnVoltarLobby');
    const nova = document.getElementById('btnBuscarNova');
    if (!voltar || !nova || voltar.dataset.authSafeNavigation === '1') return;
    voltar.dataset.authSafeNavigation = '1';
    nova.dataset.authSafeNavigation = '1';
    const interceptar = (event, novaPartida) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      voltarAoLobby(novaPartida);
    };
    voltar.addEventListener('click', event => interceptar(event, false), true);
    nova.addEventListener('click', event => interceptar(event, true), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar, { once: true });
  else instalar();
})();
