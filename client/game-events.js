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
    socket.on('cardPlayed', data => addEvent(`${playerName(data?.playerIndex ?? data?.player ?? 0)} jogou uma carta.`));
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

(() => {
  'use strict';
  const neutralizarAnimacaoRestaurada = () => {
    const mesa = document.getElementById('mesaCartas');
    if (!mesa) return;
    mesa.querySelectorAll('.cartaMesa').forEach(carta => {
      carta.style.animation = 'none';
      carta.style.opacity = '1';
      carta.style.translate = '0 0';
    });
  };
  const instalar = () => {
    const socket = window.trucoSocket;
    const mesa = document.getElementById('mesaCartas');
    if (!socket || !mesa || mesa.dataset.restoreAnimationFix === '1') return;
    mesa.dataset.restoreAnimationFix = '1';
    let restaurando = false;
    let timer = null;
    const observer = new MutationObserver(() => { if (restaurando) neutralizarAnimacaoRestaurada(); });
    observer.observe(mesa, { childList: true, subtree: true });
    socket.on('gameStateRestore', () => {
      restaurando = true;
      neutralizarAnimacaoRestaurada();
      clearTimeout(timer);
      timer = setTimeout(() => { restaurando = false; }, 250);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar, { once: true });
  else instalar();
})();

(() => {
  'use strict';
  const socket = window.trucoSocket;
  if (!socket || typeof socket.onevent !== 'function') return;
  const originalOnevent = socket.onevent.bind(socket);
  socket.onevent = function (packet) {
    const eventName = packet?.data?.[0];
    if (eventName !== 'handEnd') return originalOnevent(packet);
    const audios = ['audioSeis', 'audioNove', 'audioDoze'].map(id => document.getElementById(id)).filter(Boolean);
    const originalPlay = new Map();
    audios.forEach(audio => { originalPlay.set(audio, audio.play); audio.play = () => Promise.resolve(); });
    try { return originalOnevent(packet); }
    finally { audios.forEach(audio => { const play = originalPlay.get(audio); if (play) play.call(audio); }); }
  };
})();

(() => {
  'use strict';
  const socket = window.trucoSocket;
  if (!socket) return;
  let roomCode = null;
  let shareButton = null;
  let codeHint = null;
  const normalizarCodigo = value => { const code = String(value ?? '').trim().toUpperCase(); return code || null; };
  const atualizarHint = () => { if (codeHint) codeHint.textContent = roomCode ? `Código da sala: ${roomCode}` : 'Código da sala indisponível'; };
  const criarUI = () => {
    if (shareButton) return;
    const gameWrapper = document.getElementById('gameWrapper');
    if (!gameWrapper) return;
    const container = document.createElement('div');
    container.id = 'compartilharSala';
    container.innerHTML = '<button id="btnCompartilharSala" type="button" aria-label="Compartilhar sala" title="Compartilhar sala">↗</button><div id="codigoSalaHint" role="status"></div>';
    gameWrapper.appendChild(container);
    shareButton = container.querySelector('#btnCompartilharSala');
    codeHint = container.querySelector('#codigoSalaHint');
    atualizarHint();
    const mostrarCodigo = () => { container.classList.add('mostrar-codigo'); atualizarHint(); };
    const esconderCodigo = () => container.classList.remove('mostrar-codigo');
    shareButton.addEventListener('mouseenter', mostrarCodigo);
    shareButton.addEventListener('mouseleave', esconderCodigo);
    shareButton.addEventListener('focus', mostrarCodigo);
    shareButton.addEventListener('blur', esconderCodigo);
    shareButton.addEventListener('touchstart', mostrarCodigo, { passive: true });
    shareButton.addEventListener('touchend', () => setTimeout(esconderCodigo, 1800), { passive: true });
    shareButton.addEventListener('click', async () => {
      if (!roomCode) return;
      const shareUrl = `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`;
      const shareData = { title: 'TrucoMania', text: `Entre na minha sala do TrucoMania. Código: ${roomCode}`, url: shareUrl };
      try {
        if (navigator.share) await navigator.share(shareData);
        else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(`${shareData.text}\n${shareUrl}`);
          const old = codeHint.textContent;
          codeHint.textContent = 'Link copiado!';
          container.classList.add('mostrar-codigo');
          setTimeout(() => { codeHint.textContent = old; }, 1500);
        }
      } catch (_) {}
    });
  };
  const setRoomCode = code => { const normalized = normalizarCodigo(code); if (!normalized) return; roomCode = normalized; criarUI(); atualizarHint(); };
  const originalEmit = socket.emit.bind(socket);
  socket.emit = function (eventName, ...args) {
    const last = args[args.length - 1];
    if (typeof last === 'function' && ['createRoom', 'joinRoom', 'randomMatch'].includes(eventName)) {
      args[args.length - 1] = function (res, ...rest) { if (res?.roomCode) setRoomCode(res.roomCode); return last.call(this, res, ...rest); };
    }
    return originalEmit(eventName, ...args);
  };
  socket.on('gameStateRestore', data => setRoomCode(data?.roomCode));
  socket.on('handStart', data => setRoomCode(data?.roomCode));
  socket.on('setStart', data => setRoomCode(data?.roomCode));
})();

(() => {
  'use strict';
  const HOLD_MS = 500;
  const mao = document.getElementById('mao');
  if (!mao || mao.dataset.safeCardInteraction === '1') return;
  mao.dataset.safeCardInteraction = '1';
  let gesture = null;
  const cards = () => [...mao.querySelectorAll('.playerCard')];
  const cardFrom = target => target?.closest?.('#mao .playerCard');
  const clearSelection = except => cards().forEach(card => { if (card !== except) card.classList.remove('carta-selecionada'); });
  const playerCanPlay = () => {
    const info = document.getElementById('infoRodada')?.textContent || '';
    return info.includes('Sua vez!') && !info.includes('Decida a Mão de 11');
  };
  const emitCard = card => {
    if (!playerCanPlay()) return;
    const key = card.dataset.cardKey || '';
    if (key.startsWith('blind:')) {
      const blindIndex = Number(key.slice(6));
      if (Number.isInteger(blindIndex)) window.trucoSocket?.emit('playCard', { blindIndex });
      return;
    }
    const parts = key.split(':');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const payload = { suit: parts[0], rank: parts[1] };
      if (card.classList.contains('virada') || card.dataset.encoberta === '1') payload.hidden = true;
      window.trucoSocket?.emit('playCard', payload);
    }
  };
  const toggleCover = card => {
    if (!card) return;
    if (!card.dataset.faceHtml && !card.classList.contains('virada')) card.dataset.faceHtml = card.innerHTML;
    const hidden = card.classList.toggle('virada');
    card.classList.remove('carta-selecionada');
    card.dataset.encoberta = hidden ? '1' : '0';
    card.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    if (hidden) card.innerHTML = '';
    else card.innerHTML = card.dataset.faceHtml || '';
  };
  mao.addEventListener('pointerdown', event => {
    const card = cardFrom(event.target);
    if (!card) return;
    if (gesture?.timer) clearTimeout(gesture.timer);
    gesture = {
      card,
      startX: event.clientX,
      startY: event.clientY,
      wasSelected: card.classList.contains('carta-selecionada'),
      long: false,
      moved: false,
      timer: setTimeout(() => {
        if (!gesture || gesture.card !== card || gesture.moved) return;
        gesture.long = true;
        toggleCover(card);
      }, HOLD_MS)
    };
  }, true);
  mao.addEventListener('pointermove', event => {
    if (!gesture) return;
    if (Math.abs(event.clientX - gesture.startX) > 12 || Math.abs(event.clientY - gesture.startY) > 12) {
      gesture.moved = true;
      clearTimeout(gesture.timer);
    }
  }, true);
  mao.addEventListener('pointerup', event => {
    const current = gesture;
    if (!current || current.card !== cardFrom(event.target)) return;
    clearTimeout(current.timer);
    gesture = null;
    if (current.moved || current.long) return;
    const card = current.card;
    if (current.wasSelected) {
      emitCard(card);
      // Mantém a carta levantada enquanto o servidor processa a jogada.
      // O render da mão a remove quando a jogada for confirmada, evitando o efeito de "cair e depois ir para a mesa".
    } else {
      clearSelection(card);
      card.classList.add('carta-selecionada');
    }
  }, true);
  mao.addEventListener('pointercancel', () => {
    if (gesture?.timer) clearTimeout(gesture.timer);
    gesture = null;
  }, true);
  // The game.js card click is intentionally suppressed: pointerup above is now the single source of truth.
  mao.addEventListener('click', event => {
    if (!cardFrom(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
