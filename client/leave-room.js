(() => {
  const setup = () => {
    const gameWrapper = document.getElementById('gameWrapper');
    const createBtn = document.getElementById('createBtn');
    const entryPanel = document.querySelector('.entry-panel');
    const nameInput = document.getElementById('nameInput');
    if (!gameWrapper || !createBtn || !entryPanel || !nameInput || typeof socket === 'undefined') return;

    let button = document.getElementById('btnSairSala');
    if (!button) {
      button = document.createElement('button');
      button.id = 'btnSairSala';
      button.type = 'button';
      button.textContent = '↩️ Sair da sala';
      button.style.cssText = 'position:fixed;top:12px;left:12px;z-index:10000;padding:9px 14px;border:1px solid rgba(255,255,255,.25);border-radius:10px;background:rgba(0,0,0,.45);color:#fff;font-weight:700;cursor:pointer;backdrop-filter:blur(6px);display:none;';
      document.body.appendChild(button);
      button.addEventListener('click', () => {
        if (!window.confirm('Sair da sala e voltar ao Hub?')) return;
        button.disabled = true;
        button.textContent = 'Saindo...';
        socket.emit('leaveRoom', (result) => {
          if (result?.error) {
            button.disabled = false;
            button.textContent = '↩️ Sair da sala';
            return alert(result.error);
          }
          location.reload();
        });
      });
    }

    const updateExitVisibility = () => {
      button.style.display = gameWrapper.classList.contains('game-hidden') ? 'none' : 'block';
    };
    new MutationObserver(updateExitVisibility).observe(gameWrapper, { attributes: true, attributeFilter: ['class'] });
    updateExitVisibility();

    if (!document.getElementById('roomVisibility')) {
      const controls = document.createElement('div');
      controls.id = 'roomControls';
      controls.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:10px;align-items:center;';
      controls.innerHTML = '<label style="display:flex;align-items:center;gap:8px;font-size:13px;"><span>Tipo</span><select id="roomVisibility" class="lobby-input" style="flex:1;min-width:0;"><option value="public">🌐 Pública</option><option value="private">🔒 Privada</option></select></label><label style="display:flex;align-items:center;gap:8px;font-size:13px;"><input id="roomFillBots" type="checkbox" checked /><span>Completar com bots</span></label>';
      entryPanel.appendChild(controls);
    }

    if (!document.getElementById('roomCodeInput')) {
      const codeRow = document.createElement('div');
      codeRow.id = 'roomCodeEntry';
      codeRow.style.cssText = 'display:flex;gap:10px;margin-top:10px;';
      codeRow.innerHTML = '<input id="roomCodeInput" class="lobby-input" placeholder="Código da sala" maxlength="4" autocomplete="off" style="text-transform:uppercase;flex:1;" /><button id="joinCodeBtn" class="lobby-button" type="button">Entrar por código</button>';
      entryPanel.appendChild(codeRow);
    }

    if (!document.getElementById('randomMatchBtn')) {
      const randomBtn = document.createElement('button');
      randomBtn.id = 'randomMatchBtn';
      randomBtn.className = 'lobby-button lobby-button-primary';
      randomBtn.type = 'button';
      randomBtn.textContent = '🎲 Partida Aleatória';
      randomBtn.style.cssText = 'width:100%;margin-top:10px;';
      entryPanel.appendChild(randomBtn);
    }

    createBtn.onclick = () => {
      const name = nameInput.value.trim() || 'Jogador';
      const visibility = document.getElementById('roomVisibility')?.value || 'public';
      const fillWithBots = document.getElementById('roomFillBots')?.checked !== false;
      socket.emit('createRoom', name, { visibility, fillWithBots }, (result) => {
        if (result?.error) return alert(result.error);
        if (typeof currentGameCode !== 'undefined') currentGameCode = result.roomCode;
        if (typeof enterWaitingRoom === 'function') enterWaitingRoom(result);
      });
    };

    const joinByCode = () => {
      const input = document.getElementById('roomCodeInput');
      const roomCode = input?.value.trim().toUpperCase();
      const name = nameInput.value.trim() || 'Jogador';
      if (!roomCode) return alert('Digite o código da sala.');
      socket.emit('joinRoom', { roomCode, playerName: name }, (result) => {
        if (result?.error) return alert(result.error);
        if (typeof currentGameCode !== 'undefined') currentGameCode = result.roomCode;
        if (typeof enterWaitingRoom === 'function') enterWaitingRoom(result);
      });
    };
    const joinBtn = document.getElementById('joinCodeBtn');
    if (joinBtn && !joinBtn.dataset.bound) {
      joinBtn.dataset.bound = '1';
      joinBtn.onclick = joinByCode;
      document.getElementById('roomCodeInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') joinByCode(); });
      document.getElementById('roomCodeInput')?.addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4); });
    }

    const randomBtn = document.getElementById('randomMatchBtn');
    if (randomBtn && !randomBtn.dataset.bound) {
      randomBtn.dataset.bound = '1';
      randomBtn.onclick = () => {
        const name = nameInput.value.trim() || 'Jogador';
        randomBtn.disabled = true;
        randomBtn.textContent = '🎲 Procurando partida...';
        socket.emit('randomMatch', name, (result) => {
          if (result?.error) {
            randomBtn.disabled = false;
            randomBtn.textContent = '🎲 Partida Aleatória';
            return alert(result.error);
          }
          if (result?.createNew) {
            socket.emit('createRoom', name, { visibility: 'public', fillWithBots: true }, (createResult) => {
              if (createResult?.error) {
                randomBtn.disabled = false;
                randomBtn.textContent = '🎲 Partida Aleatória';
                return alert(createResult.error);
              }
              if (typeof currentGameCode !== 'undefined') currentGameCode = createResult.roomCode;
              if (typeof enterWaitingRoom === 'function') enterWaitingRoom(createResult);
            });
            return;
          }
          if (typeof currentGameCode !== 'undefined') currentGameCode = result.roomCode;
          if (typeof enterWaitingRoom === 'function') enterWaitingRoom(result);
        });
      };
    }

    const updateRoomShareUI = () => {
      const code = typeof currentGameCode !== 'undefined' ? String(currentGameCode || '').trim().toUpperCase() : '';
      let panel = document.getElementById('roomSharePanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'roomSharePanel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10000;display:none;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(0,0,0,.5);color:#fff;backdrop-filter:blur(8px);box-shadow:0 8px 25px rgba(0,0,0,.2);font-size:13px;';
        panel.innerHTML = '<span style="font-weight:700;white-space:nowrap;">SALA: <b id="roomShareCode">----</b></span><button id="roomCopyBtn" type="button" style="padding:7px 9px;border:0;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;font-weight:700;">📋</button><button id="roomShareBtn" type="button" style="padding:7px 9px;border:0;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;font-weight:700;">📤</button>';
        document.body.appendChild(panel);

        document.getElementById('roomCopyBtn').addEventListener('click', async () => {
          const currentCode = typeof currentGameCode !== 'undefined' ? String(currentGameCode || '').trim().toUpperCase() : '';
          if (!currentCode) return;
          try {
            await navigator.clipboard.writeText(currentCode);
            const btn = document.getElementById('roomCopyBtn');
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = '📋'; }, 1200);
          } catch {
            alert(`Código da sala: ${currentCode}`);
          }
        });

        document.getElementById('roomShareBtn').addEventListener('click', async () => {
          const currentCode = typeof currentGameCode !== 'undefined' ? String(currentGameCode || '').trim().toUpperCase() : '';
          if (!currentCode) return;
          const url = `${window.location.origin}/?room=${encodeURIComponent(currentCode)}`;
          const text = `🃏 Vem jogar Truco comigo!\nCódigo da sala: ${currentCode}`;
          try {
            if (navigator.share) {
              await navigator.share({ title: 'TrucoMania', text, url });
            } else {
              await navigator.clipboard.writeText(`${text}\n${url}`);
              alert('Convite copiado! Agora é só enviar para seu amigo.');
            }
          } catch (e) {
            if (e?.name === 'AbortError') return;
            try {
              await navigator.clipboard.writeText(`${text}\n${url}`);
              alert('Convite copiado! Agora é só enviar para seu amigo.');
            } catch {
              alert(`${text}\n${url}`);
            }
          }
        });
      }
      panel.style.display = code && !gameWrapper.classList.contains('game-hidden') ? 'flex' : 'none';
      const codeEl = document.getElementById('roomShareCode');
      if (codeEl) codeEl.textContent = code || '----';
    };

    const roomObserver = new MutationObserver(updateRoomShareUI);
    roomObserver.observe(gameWrapper, { attributes: true, attributeFilter: ['class'] });
    setInterval(updateRoomShareUI, 500);
    updateRoomShareUI();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

// ========== RESTAURAÇÃO APÓS DESCONEXÃO ==========
(() => {
  const restaurarPartida = (data) => {
    if (!data || typeof socket === 'undefined') return;

    const lobbyDiv = document.getElementById('lobby');
    const gameWrapper = document.getElementById('gameWrapper');
    const contagemEl = document.getElementById('contagemRegressiva');
    const maoDiv = document.getElementById('mao');
    const mesaCartas = document.getElementById('mesaCartas');
    const viraEl = document.getElementById('vira');
    const teamAScoreEl = document.getElementById('teamAScore');
    const teamBScoreEl = document.getElementById('teamBScore');
    const infoRodadaEl = document.getElementById('infoRodada');
    const trucoStatusEl = document.getElementById('trucoStatus');
    const painelHistorico = document.getElementById('historicoRodadas');
    const btnTruco = document.getElementById('btnTruco');
    const btnCorrer = document.getElementById('btnCorrer');
    const telaFinal = document.getElementById('telaFinal');

    if (!gameWrapper || !maoDiv || !mesaCartas || !viraEl) return;

    currentGameCode = data.roomCode || currentGameCode;
    myPlayerIndex = data.player;
    playerHand = Array.isArray(data.hand) ? data.hand : [];
    currentHandValue = data.handValue || 1;
    gameActive = true;
    aguardandoResposta = false;
    isRespondingToBet = false;
    currentBetLevel = null;
    lastBetTeam = null;
    isMaoDe11Decision = Boolean(data.maoDe11 && data.turnStage === 'mao11Decision' && !data.maoDe11DecisionMade && myPlayerIndex % 2 === data.maoDe11Team);

    lobbyDiv?.classList.add('game-hidden');
    gameWrapper.classList.remove('game-hidden');
    contagemEl?.classList.add('oculto');
    telaFinal?.classList.remove('show');

    const players = Array.isArray(data.players) ? data.players : [];
    const rotatedPlayers = rotateArrayForPlayer(players, myPlayerIndex);
    for (let i = 0; i < 4; i++) {
      const slotEl = nomesSlots[SLOT_ORDER[i]];
      const player = rotatedPlayers[i];
      if (slotEl) slotEl.textContent = (player?.name || '') + (player?.isBot ? ' (Bot)' : '');
    }

    for (let i = 1; i <= 3; i++) {
      HAND_SLOTS[i].innerHTML = '';
      const remaining = Number(data.handsRemaining?.[rotatedPlayers[i] ?? -1] ?? 3);
      for (let j = 0; j < remaining; j++) {
        const carta = document.createElement('div');
        carta.className = 'carta virada';
        HAND_SLOTS[i].appendChild(carta);
      }
    }

    renderizarMao(playerHand);

    if (data.scores) {
      teamAScoreEl.textContent = data.scores[0] ?? 0;
      teamBScoreEl.textContent = data.scores[1] ?? 0;
    }
    infoRodadaEl.textContent = `Rodada ${(data.currentRound ?? 0) + 1} de 3`;
    trucoStatusEl.textContent = data.maoDe11 ? 'Mão de 11' : (currentHandValue > 1 ? `Truco: ${currentHandValue} pts` : 'Truco: Nenhum');

    if (data.vira) {
      viraEl.classList.remove('oculto', 'virada');
      viraEl.innerHTML = createCardHTML(data.vira);
    }

    mesaCartas.innerHTML = '';
    const currentRoundCards = Array.isArray(data.roundCards?.[data.currentRound]) ? data.roundCards[data.currentRound] : [];
    const rotatedIds = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
    const posicoes = ['c0', 'c3', 'c2', 'c1'];
    currentRoundCards.forEach((card, player) => {
      if (!card) return;
      const relPos = rotatedIds.indexOf(player);
      const cartaDiv = document.createElement('div');
      cartaDiv.className = `cartaMesa ${posicoes[relPos >= 0 ? relPos : player]}`;
      cartaDiv.innerHTML = createCardHTML(card);
      mesaCartas.appendChild(cartaDiv);
    });

    painelHistorico?.querySelectorAll('.bolinha-rodada').forEach((b, index) => {
      const winner = data.roundWinners?.[index];
      b.className = 'bolinha-rodada ' + (winner === undefined || winner === null ? 'bolinha-branca' : winner === -1 ? 'bolinha-ouro' : (winner === myPlayerIndex % 2 ? 'bolinha-verde' : 'bolinha-azul'));
    });

    clearTurnTimer();
    isMyTurn = data.currentPlayer === myPlayerIndex;
    posicionarSeta(data.currentPlayer);

    if (isMaoDe11Decision) {
      mostrarControlesMaoDe11();
    } else if (data.turnStage === 'respond' && data.betState) {
      currentBetLevel = data.betState.level;
      lastBetTeam = data.betState.responderTeam;
      isRespondingToBet = myPlayerIndex % 2 === data.betState.responderTeam;
      aguardandoResposta = isRespondingToBet;
      btnTruco.classList.add('oculto');
      if (isRespondingToBet) btnCorrer.classList.remove('oculto');
      else btnCorrer.classList.add('oculto');
    } else if (isMyTurn) {
      btnCorrer.classList.remove('oculto');
      atualizarBotaoTruco();
      startTurnTimer();
    } else {
      btnTruco.classList.add('oculto');
      btnCorrer.classList.add('oculto');
    }

    atualizarInfoLive();
  };

  if (typeof socket !== 'undefined') socket.on('gameStateRestore', restaurarPartida);
})();

// ========== RITMO VISUAL E SINCRONIZAÇÃO DAS MÃOS ==========
(() => {
  if (typeof socket === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = `
    .cartaMesa {
      animation: trucoCartaEntrando .45s cubic-bezier(.22,.8,.28,1) both;
      will-change: transform, opacity;
    }
    @keyframes trucoCartaEntrando {
      from { opacity: 0; transform: translate(-50%, -50%) scale(.78) translateY(12px); }
      to { opacity: 1; }
    }
    #mao .playerCard { transition: transform .28s cubic-bezier(.22,.8,.28,1), opacity .28s ease; }
    .botHand .carta { transition: opacity .28s ease, transform .28s cubic-bezier(.22,.8,.28,1); }
  `;
  document.head.appendChild(style);

  const handsRemaining = [3, 3, 3, 3];

  const renderOpponentHands = () => {
    if (typeof myPlayerIndex !== 'number' || typeof HAND_SLOTS === 'undefined' || typeof rotateArrayForPlayer !== 'function') return;
    const rotated = rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
    for (let rel = 1; rel <= 3; rel++) {
      const handEl = HAND_SLOTS[rel];
      const absolutePlayer = rotated[rel];
      if (!handEl || absolutePlayer === undefined) continue;
      const count = Math.max(0, Math.min(3, handsRemaining[absolutePlayer]));
      if (handEl.children.length === count) continue;
      handEl.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const carta = document.createElement('div');
        carta.className = 'carta virada';
        handEl.appendChild(carta);
      }
    }
  };

  socket.on('handStart', (data) => {
    for (let i = 0; i < 4; i++) handsRemaining[i] = 3;
    if (Array.isArray(data?.handsRemaining)) data.handsRemaining.forEach((n, i) => { handsRemaining[i] = Number(n); });
    setTimeout(renderOpponentHands, 0);
  });

  socket.on('gameStateRestore', (data) => {
    for (let i = 0; i < 4; i++) handsRemaining[i] = 3;
    if (Array.isArray(data?.handsRemaining)) data.handsRemaining.forEach((n, i) => { handsRemaining[i] = Number(n); });
    setTimeout(renderOpponentHands, 0);
  });

  socket.on('cardPlayed', ({ player }) => {
    if (Number.isInteger(player) && player >= 0 && player < 4) {
      handsRemaining[player] = Math.max(0, handsRemaining[player] - 1);
      setTimeout(renderOpponentHands, 20);
    }
  });

  let lastCardEvent = 0;
  socket.on('cardPlayed', () => { lastCardEvent = Date.now(); });
  socket.on('roundResult', () => {
    const snapshot = mesaCartas?.innerHTML || '';
    const eventAt = Date.now();
    setTimeout(() => {
      if (!mesaCartas || !snapshot || lastCardEvent > eventAt) return;
      if (!mesaCartas.innerHTML) mesaCartas.innerHTML = snapshot;
      setTimeout(() => {
        if (lastCardEvent <= eventAt && mesaCartas) mesaCartas.innerHTML = '';
      }, 1000);
    }, 1300);
  });
})();
