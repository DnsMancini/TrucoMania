(() => {
  'use strict';

  const setup = () => {
    if (typeof socket === 'undefined') return;

    const card = document.querySelector('.social-sidebar .social-card');
    if (!card) return;

    const title = card.querySelector('h3');
    const list = card.querySelector('ul');
    const inviteButton = card.querySelector('button.lobby-button');
    if (!list) return;

    const search = document.createElement('input');
    search.id = 'friendSearchInput';
    search.className = 'lobby-input';
    search.placeholder = 'Pesquisar jogador...';
    search.maxLength = 15;
    search.style.cssText = 'width:100%;margin:8px 0;box-sizing:border-box;';

    const resultBox = document.createElement('div');
    resultBox.id = 'friendSearchResults';
    resultBox.style.cssText = 'display:none;margin:6px 0;';

    const manageButton = document.createElement('button');
    manageButton.type = 'button';
    manageButton.className = 'lobby-button';
    manageButton.textContent = '👥 Gerenciar amigos';
    manageButton.style.cssText = 'width:100%;margin-top:8px;';

    card.insertBefore(search, list);
    card.insertBefore(resultBox, list);
    if (inviteButton) inviteButton.style.display = 'none';
    card.appendChild(manageButton);

    const modal = document.createElement('div');
    modal.id = 'friendsModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.72);padding:18px;box-sizing:border-box;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="width:min(520px,100%);max-height:85vh;overflow:auto;background:#171a20;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:18px;box-sizing:border-box;box-shadow:0 20px 70px rgba(0,0,0,.45);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <h2 style="margin:0;font-size:20px;">👥 Amigos</h2>
          <button id="friendsModalClose" type="button" style="border:0;background:none;color:#fff;font-size:22px;cursor:pointer;">✕</button>
        </div>
        <div id="friendRequests" style="margin-top:14px;"></div>
        <div id="friendListFull" style="margin-top:14px;"></div>
      </div>`;
    document.body.appendChild(modal);

    const modalClose = modal.querySelector('#friendsModalClose');
    const requestBox = modal.querySelector('#friendRequests');
    const fullList = modal.querySelector('#friendListFull');

    let friendsState = { friends: [], requests: [] };

    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

    const renderFriends = () => {
      const friends = friendsState.friends || [];
      list.innerHTML = '';
      if (!friends.length) {
        list.innerHTML = '<li style="opacity:.7;list-style:none;">Nenhum amigo ainda.</li>';
      } else {
        friends.slice(0, 5).forEach(friend => {
          const li = document.createElement('li');
          li.style.cssText = 'display:flex;align-items:center;gap:8px;';
          const status = friend.online ? 'Online' : 'Offline';
          li.innerHTML = `<span class="dot ${friend.online ? 'on' : 'off'}"></span><span style="flex:1;">${escapeHtml(friend.nickname)}</span><small>${status}</small>`;
          list.appendChild(li);
        });
      }

      const requests = friendsState.requests || [];
      requestBox.innerHTML = requests.length ? `<strong>Solicitações</strong>${requests.map(r => `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px;border-radius:10px;background:rgba(255,255,255,.05);">
          <span style="flex:1;">${escapeHtml(r.nickname)}</span>
          <button class="lobby-button" data-friend-accept="${escapeHtml(r.requestId)}">Aceitar</button>
          <button class="lobby-button" data-friend-reject="${escapeHtml(r.requestId)}">Recusar</button>
        </div>`).join('')}` : '';

      fullList.innerHTML = friends.length ? friends.map(friend => `
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:9px;border-radius:10px;background:rgba(255,255,255,.05);">
          <span style="flex:1;">${escapeHtml(friend.nickname)} <small style="opacity:.65;">${friend.online ? 'Online' : 'Offline'}</small></span>
          <button class="lobby-button" data-friend-remove="${escapeHtml(friend.uid)}">Remover</button>
        </div>`).join('') : '<p style="opacity:.7;">Sua lista de amigos está vazia.</p>';
    };

    const loadFriends = () => socket.emit('getFriends', result => {
      if (result?.error) return;
      // A lista é enviada pelo evento friendsUpdate.
    });

    socket.on('friendsUpdate', state => {
      friendsState = state || { friends: [], requests: [] };
      renderFriends();
    });

    socket.on('friendRequest', request => {
      if (!request?.player) return;
      alert(`${request.player.nickname} enviou uma solicitação de amizade.`);
      loadFriends();
    });

    socket.on('friendAccepted', () => loadFriends());
    socket.on('friendRemoved', () => loadFriends());

    const searchPlayers = () => {
      const nickname = search.value.trim();
      if (nickname.length < 3) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
        return;
      }
      socket.emit('searchPlayers', { nickname }, result => {
        if (result?.error) {
          resultBox.style.display = 'block';
          resultBox.textContent = result.error;
          return;
        }
        const players = result.players || [];
        resultBox.style.display = 'block';
        resultBox.innerHTML = players.length ? players.map(player => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px;background:rgba(255,255,255,.05);margin-top:5px;">
            <span style="flex:1;">${escapeHtml(player.nickname)} ${player.online ? '🟢' : '⚫'}</span>
            <button class="lobby-button" data-add-friend="${escapeHtml(player.uid)}">Adicionar</button>
          </div>`).join('') : '<div style="opacity:.7;padding:8px;">Nenhum jogador encontrado.</div>';
      });
    };

    search.addEventListener('input', searchPlayers);

    resultBox.addEventListener('click', event => {
      const button = event.target.closest('[data-add-friend]');
      if (!button) return;
      button.disabled = true;
      socket.emit('addFriend', { uid: button.dataset.addFriend }, result => {
        if (result?.error) {
          button.disabled = false;
          return alert(result.error);
        }
        button.textContent = 'Enviado ✓';
        loadFriends();
      });
    });

    requestBox.addEventListener('click', event => {
      const accept = event.target.closest('[data-friend-accept]');
      const reject = event.target.closest('[data-friend-reject]');
      const button = accept || reject;
      if (!button) return;
      const requestId = button.dataset.friendAccept || button.dataset.friendReject;
      socket.emit('respondFriend', { requestId, accept: Boolean(accept) }, result => {
        if (result?.error) return alert(result.error);
        loadFriends();
      });
    });

    fullList.addEventListener('click', event => {
      const button = event.target.closest('[data-friend-remove]');
      if (!button) return;
      if (!confirm('Remover este amigo?')) return;
      socket.emit('removeFriend', { uid: button.dataset.friendRemove }, result => {
        if (result?.error) return alert(result.error);
        loadFriends();
      });
    });

    manageButton.addEventListener('click', () => {
      modal.style.display = 'flex';
      loadFriends();
    });
    modalClose.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.style.display = 'none'; });

    loadFriends();
    renderFriends();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
