// =============================================
// TRUCOMANIA PROFILE - Modal de Perfil, Avatares e Upload de Foto
// =============================================

const AVAILABLE_AVATARS = [
  '🃏', '🎮', '🔥', '⚡', '💀', '👑',
  '🦁', '🐺', '🦅', '🐉', '🦈', '🐯',
  '😎', '🤠', '👻', '🤖', '👽', '🎭',
  '💎', '🏆', '🚀', '⭐', '🎯', '🧊'
];

let profileInitialized = false;

function initProfileSystem() {
  if (profileInitialized) return;
  profileInitialized = true;

  const modal = document.getElementById('profileModal');
  const btnProfile = document.getElementById('btnNavProfile');
  const btnClose = document.getElementById('btnCloseProfile');

  if (!modal) return;

  // Abrir modal
  if (btnProfile) {
    btnProfile.addEventListener('click', () => openProfileModal());
  }

  // Fechar modal
  if (btnClose) {
    btnClose.addEventListener('click', closeProfileModal);
  }

  // Fechar clicando fora
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeProfileModal();
  });

  // Fechar com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProfileModal();
  });

  // Avatar clicável - alterna entre emoji e upload
  const avatarEl = document.getElementById('profileCurrentAvatar');
  if (avatarEl) {
    avatarEl.style.cursor = 'pointer';
    avatarEl.title = 'Clique para personalizar';
    avatarEl.addEventListener('click', toggleAvatarActions);
  }

  // Botões de ação do avatar
  const btnChooseEmoji = document.getElementById('btnChooseEmoji');
  const btnUploadPhoto = document.getElementById('btnUploadPhoto');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');
  const fileInput = document.getElementById('avatarFileInput');

  if (btnChooseEmoji) {
    btnChooseEmoji.addEventListener('click', () => {
      showAvatarSelector();
      hideAvatarActions();
    });
  }

  if (btnUploadPhoto && fileInput) {
    btnUploadPhoto.addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', handleFileUpload);
  }

  if (btnRemovePhoto) {
    btnRemovePhoto.addEventListener('click', removeUploadedPhoto);
  }

  // Fechar seletor ao clicar fora
  document.addEventListener('click', (e) => {
    const actions = document.getElementById('avatarActions');
    const selector = document.getElementById('avatarSelector');
    const avatar = document.getElementById('profileCurrentAvatar');
    if (actions && !actions.contains(e.target) && avatar && !avatar.contains(e.target) && !e.target.closest('.avatar-option') && !e.target.closest('.avatar-action-btn')) {
      hideAvatarActions();
    }
  });
}

function toggleAvatarActions() {
  const actions = document.getElementById('avatarActions');
  if (!actions) return;
  if (actions.style.display === 'flex') {
    hideAvatarActions();
  } else {
    showAvatarActions();
  }
}

function showAvatarActions() {
  const actions = document.getElementById('avatarActions');
  if (!actions) return;
  actions.style.display = 'flex';
}

function hideAvatarActions() {
  const actions = document.getElementById('avatarActions');
  if (!actions) return;
  actions.style.display = 'none';
}

function showAvatarSelector() {
  const selector = document.getElementById('avatarSelector');
  if (selector) selector.style.display = 'block';
}

function hideAvatarSelector() {
  const selector = document.getElementById('avatarSelector');
  if (selector) selector.style.display = 'none';
}

function openProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal || !window.currentUserData) return;

  const userData = window.currentUserData;

  // Verificar se tem avatarUrl (foto enviada) ou emoji
  updateProfileAvatarDisplay(userData);

  document.getElementById('profileNickname').textContent = userData.nickname || 'Jogador';
  document.getElementById('profileRank').textContent = userData.rank || 'Iniciante';
  document.getElementById('profileStatsCoins').textContent = formatNumber(userData.coins || 0);
  document.getElementById('profileStatsGems').textContent = formatNumber(userData.gems || 0);
  document.getElementById('profileStatsWins').textContent = userData.wins || 0;
  document.getElementById('profileStatsLosses').textContent = userData.losses || 0;

  renderAvatarGrid(userData.avatar);
  hideAvatarActions();
  showAvatarSelector();

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

// Atualiza a exibição do avatar (emoji ou imagem)
function updateProfileAvatarDisplay(userData) {
  const avatarEl = document.getElementById('profileCurrentAvatar');
  if (!avatarEl) return;

  if (userData.avatarUrl) {
    // Tem foto enviada - exibir imagem
    avatarEl.innerHTML = `<img src="${escapeHtml(userData.avatarUrl)}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.innerHTML='🎮'" />`;
    // Mostrar botão de remover foto
    const btnRemove = document.getElementById('btnRemovePhoto');
    if (btnRemove) btnRemove.style.display = 'inline-flex';
  } else {
    // Emoji
    avatarEl.innerHTML = '';
    avatarEl.textContent = userData.avatar || '🎮';
    const btnRemove = document.getElementById('btnRemovePhoto');
    if (btnRemove) btnRemove.style.display = userData.avatarUrl ? 'inline-flex' : 'none';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAvatarGrid(currentAvatar) {
  const grid = document.getElementById('avatarGrid');
  if (!grid) return;

  grid.innerHTML = '';

  AVAILABLE_AVATARS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'avatar-option';
    btn.textContent = emoji;
    btn.dataset.avatar = emoji;

    if (emoji === currentAvatar && !window.currentUserData?.avatarUrl) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => selectAvatar(emoji, btn));
    grid.appendChild(btn);
  });
}

function selectAvatar(emoji, btnElement) {
  // Atualizar visual nos botões
  document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
  btnElement.classList.add('selected');

  // Limpar avatarUrl se existir (trocar de foto para emoji)
  if (window.currentUserData) {
    window.currentUserData.avatarUrl = null;
  }

  // Atualizar no modal
  const avatarEl = document.getElementById('profileCurrentAvatar');
  if (avatarEl) {
    avatarEl.innerHTML = '';
    avatarEl.textContent = emoji;
  }

  // Salvar no perfil
  if (window.currentUserData) {
    const oldAvatar = window.currentUserData.avatar;
    window.currentUserData.avatar = emoji;

    // Atualizar lobby
    updateLobbyAvatar(emoji);

    // Atualizar jogo
    updateGameAvatar(emoji);

    // Salvar no banco (remover avatarUrl se existir)
    saveAvatarToDb(emoji, null).catch(() => {
      window.currentUserData.avatar = oldAvatar;
    });
  }

  hideAvatarActions();
}

function updateLobbyAvatar(emojiOrUrl) {
  const avatarEl = document.getElementById('playerAvatar');
  if (!avatarEl) return;

  if (emojiOrUrl && emojiOrUrl.startsWith('http')) {
    avatarEl.innerHTML = `<img src="${escapeHtml(emojiOrUrl)}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
  } else {
    avatarEl.innerHTML = '';
    avatarEl.textContent = emojiOrUrl || 'TM';
  }
}

function updateGameAvatar(emojiOrUrl) {
  const p0avatar = document.querySelector('#p0 .avatar');
  if (!p0avatar) return;

  if (emojiOrUrl && emojiOrUrl.startsWith('http')) {
    p0avatar.innerHTML = `<img src="${escapeHtml(emojiOrUrl)}" alt="Avatar" style="width:100%;height:100%;border-radius:12px;object-fit:cover;" />`;
    // Remover o ::after do avatar
    p0avatar.style.background = 'none';
  } else {
    p0avatar.innerHTML = '';
    p0avatar.textContent = emojiOrUrl || '';
    p0avatar.style.background = '';
  }
}

async function saveAvatarToDb(emoji, avatarUrl) {
  const user = window.auth?.currentUser;
  if (!user) return;

  const db = window.db;
  const data = {};
  if (emoji !== undefined) data.avatar = emoji;
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

  try {
    // Se avatarUrl for null, remover o campo do documento
    if (avatarUrl === null) {
      await db.collection('players').doc(user.uid).update({
        avatar: emoji || '🎮',
        avatarUrl: firebase.firestore.FieldValue.delete()
      });
    } else {
      await db.collection('players').doc(user.uid).update(data);
    }
  } catch (e) {
    try {
      const playerRef = db.collection('players').doc(user.uid);
      const playerDoc = await playerRef.get();

      if (playerDoc.exists) {
        // O perfil já existe: nunca substitua campos de progresso por valores padrão.
        await playerRef.set(data, { merge: true });
      } else {
        // O perfil realmente não existe: somente aqui é seguro inicializar os padrões.
        await playerRef.set({
          ...data,
          coins: 0,
          gems: 0,
          rank: 'Iniciante',
          wins: 0,
          losses: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e2) {
      console.warn('[PROFILE] Falha ao salvar avatar:', e2.message);
    }
  }
}

// ========== UPLOAD DE FOTO ==========

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Validar tipo e tamanho
  if (!file.type.startsWith('image/')) {
    alert('Selecione uma imagem válida (jpg, png, gif)');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert('A imagem deve ter no máximo 2MB');
    return;
  }

  const user = window.auth?.currentUser;
  if (!user) {
    alert('Faça login para enviar foto.');
    return;
  }

  // Mostrar loading
  const avatarEl = document.getElementById('profileCurrentAvatar');
  const originalContent = avatarEl?.innerHTML || '🎮';
  if (avatarEl) avatarEl.textContent = '⏳';

  try {
    // Redimensionar imagem antes do upload
    const resizedBlob = await resizeImage(file, 200, 200);

    // Upload para Firebase Storage
    const storageRef = window.storage.ref();
    const avatarRef = storageRef.child(`avatars/${user.uid}_${Date.now()}.jpg`);

    const snapshot = await avatarRef.put(resizedBlob, {
      contentType: 'image/jpeg',
      customMetadata: { uploadedBy: user.uid }
    });

    const downloadUrl = await snapshot.ref.getDownloadURL();

    // Atualizar dados do usuário
    if (window.currentUserData) {
      window.currentUserData.avatarUrl = downloadUrl;
      window.currentUserData.avatar = null;
    }

    // Atualizar exibição
    updateProfileAvatarDisplay(window.currentUserData);
    updateLobbyAvatar(downloadUrl);
    updateGameAvatar(downloadUrl);

    // Salvar no Firestore
    await saveAvatarToDb(null, downloadUrl);

    alert('Foto atualizada com sucesso!');
    hideAvatarActions();
  } catch (error) {
    console.error('[PROFILE] Erro no upload:', error);
    if (avatarEl) avatarEl.innerHTML = originalContent;
    alert('Erro ao enviar foto. Tente novamente.');
  } finally {
    // Limpar input para permitir re-upload do mesmo arquivo
    event.target.value = '';
  }
}

// Redimensiona a imagem para economizar espaço e acelerar upload
function resizeImage(file, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao redimensionar'));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

async function removeUploadedPhoto() {
  const user = window.auth?.currentUser;
  if (!user || !window.currentUserData?.avatarUrl) return;

  if (!confirm('Remover foto personalizada?')) return;

  try {
    // Tentar deletar do Storage
    try {
      const storageRef = window.storage.ref();
      const listResult = await storageRef.child('avatars/').listAll();
      const userPhotos = listResult.items.filter(item => item.name.startsWith(user.uid));
      await Promise.all(userPhotos.map(item => item.delete()));
    } catch (storageErr) {
      console.warn('[PROFILE] Erro ao deletar do Storage:', storageErr.message);
    }

    // Limpar dados
    window.currentUserData.avatarUrl = null;
    if (!window.currentUserData.avatar) {
      window.currentUserData.avatar = '🎮';
    }

    // Atualizar exibição
    updateProfileAvatarDisplay(window.currentUserData);
    updateLobbyAvatar(window.currentUserData.avatar);
    updateGameAvatar(window.currentUserData.avatar);

    // Salvar no Firestore
    await saveAvatarToDb(window.currentUserData.avatar, null);

    // Re-renderizar grid para mostrar seleção correta
    renderAvatarGrid(window.currentUserData.avatar);

    hideAvatarActions();
  } catch (error) {
    console.error('[PROFILE] Erro ao remover foto:', error);
    alert('Erro ao remover foto.');
  }
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('pt-BR');
}

// Atualizar UI do lobby com os dados do perfil
function updateLobbyUI(userData) {
  if (!userData) return;

  const displayName = document.getElementById('playerDisplayName');
  if (displayName) displayName.textContent = userData.nickname || 'Truqueiro';

  const avatarVal = userData.avatarUrl || userData.avatar || (userData.nickname ? userData.nickname.charAt(0).toUpperCase() : 'TM');
  updateLobbyAvatar(avatarVal);

  const coinsEl = document.getElementById('playerCoins');
  if (coinsEl) coinsEl.textContent = formatNumber(userData.coins || 0);

  const gemsEl = document.getElementById('playerGems');
  if (gemsEl) gemsEl.textContent = formatNumber(userData.gems || 0);

  // Atualizar avatar no jogo
  updateGameAvatar(avatarVal);
}

// Exportar funções
window.initProfileSystem = initProfileSystem;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.updateLobbyUI = updateLobbyUI;
window.AVAILABLE_AVATARS = AVAILABLE_AVATARS;

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProfileSystem);
} else {
  initProfileSystem();
}