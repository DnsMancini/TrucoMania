// =============================================
// TRUCOMANIA PROFILE - Modal de Perfil e Avatares
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
  const btnNavShop = document.getElementById('btnNavShop');

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
}

function openProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal || !window.currentUserData) return;

  const userData = window.currentUserData;

  document.getElementById('profileCurrentAvatar').textContent = userData.avatar || '🎮';
  document.getElementById('profileNickname').textContent = userData.nickname || 'Jogador';
  document.getElementById('profileRank').textContent = userData.rank || 'Iniciante';
  document.getElementById('profileStatsCoins').textContent = formatNumber(userData.coins || 0);
  document.getElementById('profileStatsGems').textContent = formatNumber(userData.gems || 0);
  document.getElementById('profileStatsWins').textContent = userData.wins || 0;
  document.getElementById('profileStatsLosses').textContent = userData.losses || 0;

  renderAvatarGrid(userData.avatar);

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
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

    if (emoji === currentAvatar) {
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

  // Atualizar no modal
  document.getElementById('profileCurrentAvatar').textContent = emoji;

  // Salvar no perfil
  if (window.currentUserData) {
    const oldAvatar = window.currentUserData.avatar;
    window.currentUserData.avatar = emoji;

    // Atualizar lobby
    updateLobbyAvatar(emoji);

    // Atualizar jogo
    updateGameAvatar(emoji);

    // Salvar no banco
    saveAvatarToDb(emoji).catch(() => {
      // Reverter em caso de erro
      window.currentUserData.avatar = oldAvatar;
    });
  }
}

function updateLobbyAvatar(emoji) {
  const avatarEl = document.getElementById('playerAvatar');
  if (avatarEl) {
    avatarEl.textContent = emoji;
  }
}

function updateGameAvatar(emoji) {
  const p0avatar = document.querySelector('#p0 .avatar');
  if (p0avatar) {
    p0avatar.textContent = emoji;
  }
}

async function saveAvatarToDb(emoji) {
  const user = window.auth?.currentUser;
  if (!user) return;

  try {
    await window.db.collection('players').doc(user.uid).update({ avatar: emoji });
  } catch (e) {
    try {
      await window.db.collection('players').doc(user.uid).set({ avatar: emoji }, { merge: true });
    } catch (e2) {
      console.warn('[PROFILE] Falha ao salvar avatar:', e2.message);
    }
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

  const avatarEl = document.getElementById('playerAvatar');
  if (avatarEl) avatarEl.textContent = userData.avatar || (userData.nickname ? userData.nickname.charAt(0).toUpperCase() : 'TM');

  const coinsEl = document.getElementById('playerCoins');
  if (coinsEl) coinsEl.textContent = formatNumber(userData.coins || 0);

  const gemsEl = document.getElementById('playerGems');
  if (gemsEl) gemsEl.textContent = formatNumber(userData.gems || 0);

  // Atualizar avatar no jogo
  updateGameAvatar(userData.avatar || (userData.nickname ? userData.nickname.charAt(0).toUpperCase() : 'TM'));
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