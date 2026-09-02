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
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
