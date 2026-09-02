(() => {
  const createButton = () => {
    if (document.getElementById('btnSairSala')) return;

    const gameWrapper = document.getElementById('gameWrapper');
    if (!gameWrapper || typeof socket === 'undefined') return;

    const button = document.createElement('button');
    button.id = 'btnSairSala';
    button.type = 'button';
    button.textContent = '↩️ Sair da sala';
    button.style.cssText = 'position:fixed;top:12px;left:12px;z-index:10000;padding:9px 14px;border:1px solid rgba(255,255,255,.25);border-radius:10px;background:rgba(0,0,0,.45);color:#fff;font-weight:700;cursor:pointer;backdrop-filter:blur(6px);display:none;';
    document.body.appendChild(button);

    const updateVisibility = () => {
      button.style.display = gameWrapper.classList.contains('game-hidden') ? 'none' : 'block';
    };

    new MutationObserver(updateVisibility).observe(gameWrapper, { attributes: true, attributeFilter: ['class'] });
    updateVisibility();

    button.addEventListener('click', () => {
      if (!window.confirm('Sair da sala e voltar ao Hub?')) return;

      button.disabled = true;
      button.textContent = 'Saindo...';

      socket.emit('leaveRoom', (result) => {
        if (result?.error) {
          button.disabled = false;
          button.textContent = '↩️ Sair da sala';
          alert(result.error);
          return;
        }
        location.reload();
      });
    });
  };

  const createLobbyControls = () => {
    if (document.getElementById('roomVisibility')) return;

    const entryPanel = document.querySelector('.entry-panel');
    const lobbyMenu = document.querySelector('.entry-panel .lobby-menu');
    const createBtn = document.getElementById('createBtn');
    const nameInput = document.getElementById('nameInput');
    if (!entryPanel || !lobbyMenu || !createBtn || !nameInput || typeof socket === 'undefined') return;

    const controls = document.createElement('div');
    controls.id = 'roomControls';
    controls.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:10px;align-items:center;';
    controls.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <span>Tipo</span>
        <select id="roomVisibility" class="lobby-input" style="flex:1;min-width:0;">
          <option value="public">🌐 Pública</option>
          <option value="private">🔒 Privada</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <input id="roomFillBots" type="checkbox" checked />
        <span>Completar com bots</span>
      </label>
    `;
    entryPanel.appendChild(controls);

    const codeRow = document.createElement('div');
    codeRow.style.cssText = 'display:flex;gap:10px;margin-top:10px;';
    codeRow.innerHTML = `
      <input id="roomCodeInput" class="lobby-input" placeholder="Código da sala" maxlength="4" autocomplete="off" style="text-transform:uppercase;flex:1;" />
      <button id="joinCodeBtn" class="lobby-button" type="button">Entrar por código</button>
    `;
    entryPanel.appendChild(codeRow);

    const randomBtn = document.createElement('button');
    randomBtn.id = 'randomMatchBtn';
    randomBtn.className = 'lobby-button lobby-button-primary';
    randomBtn.type = 'button';
    randomBtn.textContent = '🎲 Partida Aleatória';
    randomBtn.style.cssText = 'width:100%;margin-top:10px;';
    entryPanel.appendChild(randomBtn);

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
      const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
      const name = nameInput.value.trim() || 'Jogador';
      if (!roomCode) return alert('Digite o código da sala.');
      socket.emit('joinRoom', { roomCode, playerName: name }, (result) => {
        if (result?.error) return alert(result.error);
        if (typeof currentGameCode !== 'undefined') currentGameCode = result.roomCode;
        if (typeof enterWaitingRoom === 'function') enterWaitingRoom(result);
      });
    };

    document.getElementById('joinCodeBtn').onclick = joinByCode;
    document.getElementById('roomCodeInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') joinByCode();
    });
    document.getElementById('roomCodeInput').addEventListener('input', (event) => {
      event.target.value = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
    });

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
  };

  const init = () => {
    createLobbyControls();
    createButton();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
