// =============================================
// TRUCOMANIA AUTH - FUNCIONA ONLINE E OFFLINE
// =============================================

// Helper de log
const AuthLog = {
  info: (msg, data) => console.log(`[AUTH ✅] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[AUTH ⚠️] ${msg}`, data || ''),
  error: (msg, data, stack) => {
    console.error(`[AUTH 🛑] ${msg}`, data || '');
    if (stack) console.error('[AUTH Stack]', stack);
  }
};

const AUTH_STATE = {
  CHECKING: 'checking',
  SPLASH: 'splash',
  LOGIN: 'login',
  REGISTER: 'register',
  FORGOT: 'forgot',
  AUTHENTICATED: 'authenticated'
};

let currentState = AUTH_STATE.CHECKING;
let particlesSystem = null;
let hazeEffect = null;
let currentUserData = null;
let isSubmitting = false;
let authFlowStarted = false;

// Elementos DOM
const splashScreen = document.getElementById('splashScreen');
const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const forgotScreen = document.getElementById('forgotScreen');
const authOverlay = document.getElementById('authOverlay');

AuthLog.info('Módulo auth.js carregado');

// =============================================
// VALIDAÇÕES
// =============================================

function validarEmail(email) {
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return re.test(email);
}

function validarNickname(nick) {
  if (!nick || nick.length < 3 || nick.length > 15) return false;
  return /^[A-Za-zÀ-ÿ0-9_ ]+$/.test(nick);
}

// =============================================
// UI
// =============================================

function initVisualEffects() {
  try {
    const canvas = document.getElementById('particlesCanvas');
    const hazeCanvas = document.getElementById('hazeCanvas');
    if (canvas) {
      particlesSystem = new ParticleSystem(canvas);
      particlesSystem.start();
    }
    if (hazeCanvas) {
      hazeEffect = new HazeEffect(hazeCanvas);
      hazeEffect.start();
    }
  } catch (e) {
    AuthLog.warn('Erro ao iniciar efeitos (não crítico):', e.message);
  }
}

async function initAuthFlow() {
  if (authFlowStarted) return;
  authFlowStarted = true;

  AuthLog.info('Iniciando fluxo de autenticação');

  try {
    showScreen(AUTH_STATE.SPLASH);
    initVisualEffects();

    const loadingBar = document.getElementById('splashLoadingBar');
    if (loadingBar) {
      await AuthTransitions.animateLoading(loadingBar, 2000);
    }

    // Verificar sessão existente
    const user = auth.currentUser;
    if (user) {
      AuthLog.info('Sessão existente encontrada:', user.email);
      await loadUserProfile(user);
      enterLobby();
    } else {
      if (authTransitions && splashScreen && authOverlay) {
        authTransitions.splashToAuth(splashScreen, authOverlay);
      } else {
        splashScreen.style.display = 'none';
        authOverlay.style.display = 'flex';
      }
      setTimeout(() => showScreen(AUTH_STATE.LOGIN), 500);
    }
  } catch (err) {
    AuthLog.error('ERRO no initAuthFlow:', err.message, err.stack);
    splashScreen.style.display = 'none';
    authOverlay.style.display = 'flex';
    showScreen(AUTH_STATE.LOGIN);
  }
}

function showScreen(screen) {
  currentState = screen;
  [loginScreen, registerScreen, forgotScreen].forEach(s => {
    if (s) { s.classList.remove('active'); s.style.display = 'none'; }
  });
  switch (screen) {
    case AUTH_STATE.SPLASH:
      if (splashScreen) splashScreen.style.display = 'flex';
      break;
    case AUTH_STATE.LOGIN:
      if (loginScreen) {
        loginScreen.style.display = 'flex';
        setTimeout(() => loginScreen.classList.add('active'), 10);
      }
      break;
    case AUTH_STATE.REGISTER:
      if (registerScreen) {
        registerScreen.style.display = 'flex';
        setTimeout(() => registerScreen.classList.add('active'), 10);
      }
      break;
    case AUTH_STATE.FORGOT:
      if (forgotScreen) {
        forgotScreen.style.display = 'flex';
        setTimeout(() => forgotScreen.classList.add('active'), 10);
      }
      break;
  }
}

// =============================================
// PERFIL
// =============================================

async function loadUserProfile(user) {
  if (!user) return null;
  AuthLog.info('Carregando perfil para:', user.uid);

  try {
    const doc = await db.collection('players').doc(user.uid).get();
    if (doc.exists) {
      currentUserData = doc.data();
      AuthLog.info('Perfil encontrado:', currentUserData.nickname);
    } else {
      // Criar perfil
      AuthLog.info('Criando novo perfil no Firestore/Offline');
      const emailNome = user.email ? user.email.split('@')[0] : 'Jogador';
      currentUserData = {
        uid: user.uid,
        email: user.email || '',
        nickname: user.displayName || emailNome || 'Jogador',
        coins: 0,
        gems: 0,
        rank: 'Iniciante',
        avatar: (user.displayName || 'J').charAt(0).toUpperCase(),
        wins: 0,
        losses: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('players').doc(user.uid).set(currentUserData);
      AuthLog.info('Perfil criado com sucesso');
    }
    return currentUserData;
  } catch (error) {
    AuthLog.error('Falha ao acessar Firestore/Offline:', error.message);
    // Fallback
    currentUserData = {
      uid: user.uid,
      email: user.email || '',
      nickname: user.displayName || 'Jogador',
      coins: 0,
      gems: 0,
      rank: 'Iniciante',
      avatar: 'U',
      wins: 0,
      losses: 0,
      createdAt: new Date().toISOString()
    };
    return currentUserData;
  }
}

async function saveProfileNickname(uid, nickname) {
  try {
    await db.collection('players').doc(uid).update({ nickname, avatar: nickname.charAt(0).toUpperCase() });
  } catch (e) {
    // Se falhar update, tenta set
    try {
      await db.collection('players').doc(uid).set({
        uid,
        nickname,
        avatar: nickname.charAt(0).toUpperCase(),
        coins: 0,
        gems: 0,
        rank: 'Iniciante',
        wins: 0,
        losses: 0,
        createdAt: new Date().toISOString()
      });
    } catch (e2) {
      AuthLog.warn('Falha ao salvar nickname no perfil:', e2.message);
    }
  }
}

function enterLobby() {
  AuthLog.info('ENTRANDO NO LOBBY:', currentUserData?.nickname || 'desconhecido');

  try {
    authTransitions.authToLobby(authOverlay, document.getElementById('lobby'));

    // Atualizar toda a UI do lobby com dados do perfil
    if (typeof window.updateLobbyUI === 'function') {
      window.updateLobbyUI(currentUserData);
    } else {
      // Fallback caso profile.js não tenha carregado
      const displayName = document.getElementById('playerDisplayName');
      if (displayName && currentUserData) {
        displayName.textContent = currentUserData.nickname || 'Truqueiro';
      }
      const avatarEl = document.getElementById('playerAvatar');
      if (avatarEl && currentUserData) {
        avatarEl.textContent = currentUserData.avatar || 
          (currentUserData.nickname ? currentUserData.nickname.charAt(0).toUpperCase() : 'TM');
      }
      const coinsEl = document.getElementById('playerCoins');
      if (coinsEl && currentUserData) {
        coinsEl.textContent = (currentUserData.coins || 0).toLocaleString('pt-BR');
      }
      const gemsEl = document.getElementById('playerGems');
      if (gemsEl && currentUserData) {
        gemsEl.textContent = (currentUserData.gems || 0).toLocaleString('pt-BR');
      }
    }

    document.dispatchEvent(new CustomEvent('user-authenticated', {
      detail: currentUserData
    }));
  } catch (err) {
    AuthLog.error('Erro na transição:', err.message);
    const lobby = document.getElementById('lobby');
    if (lobby) {
      authOverlay.style.display = 'none';
      lobby.style.display = 'block';
    }
  }
}

// =============================================
// HANDLERS
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  AuthLog.info('DOMContentLoaded - registrando handlers');

  // ========== LOGIN ==========
  const loginForm = document.getElementById('loginForm');
  const btnLogin = document.getElementById('btnLogin');
  const btnGoRegister = document.getElementById('btnGoToRegister');
  const btnGoForgot = document.getElementById('btnGoToForgot');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const rememberMe = document.getElementById('rememberMe')?.checked || false;

      if (!email) { UIEffects.showToast('Digite seu email', 'error'); return; }
      if (!validarEmail(email)) { UIEffects.showToast('Email inválido', 'error'); return; }
      if (!password) { UIEffects.showToast('Digite sua senha', 'error'); return; }
      if (password.length < 6) { UIEffects.showToast('Senha deve ter no mínimo 6 caracteres', 'error'); return; }

      isSubmitting = true;
      btnLogin.disabled = true;
      UIEffects.showLoading(btnLogin);
      AuthLog.info('Tentando login:', email);

      try {
        try {
          const persistence = rememberMe
            ? firebase.auth.Auth.Persistence.LOCAL
            : firebase.auth.Auth.Persistence.SESSION;
          await auth.setPersistence(persistence);
        } catch (pe) { AuthLog.warn('Persistência:', pe.message); }

        const result = await auth.signInWithEmailAndPassword(email, password);
        AuthLog.info('Login OK! UID:', result.user.uid);

        await loadUserProfile(result.user);
        enterLobby();
      } catch (error) {
        AuthLog.error('ERRO LOGIN:', error.code, error.message);
        let msg = 'Erro ao fazer login';
        switch (error.code) {
          case 'auth/user-not-found': case 'auth/wrong-password':
            msg = 'Email ou senha inválidos'; break;
          case 'auth/invalid-email': msg = 'Formato de email inválido'; break;
          case 'auth/too-many-requests': msg = 'Muitas tentativas. Tente mais tarde'; break;
          case 'auth/user-disabled': msg = 'Conta desativada'; break;
          case 'auth/invalid-api-key': msg = 'ERRO: Firebase API Key inválida'; break;
          case 'auth/network-request-failed': msg = 'Falha de conexão. Verifique sua internet'; break;
          case 'auth/configuration-not-found': msg = 'ERRO: Projeto Firebase não encontrado. Verifique credenciais'; break;
          case 'auth/operation-not-allowed': msg = 'Login não habilitado no Firebase Console'; break;
          default: msg = `Erro: ${error.message}`;
        }
        UIEffects.showToast(msg, 'error');
      } finally {
        isSubmitting = false;
        btnLogin.disabled = false;
        UIEffects.hideLoading(btnLogin);
      }
    });
  }

  // Navegação
  if (btnGoRegister) {
    btnGoRegister.addEventListener('click', async () => {
      await authTransitions.switchScreen(loginScreen, registerScreen);
      showScreen(AUTH_STATE.REGISTER);
    });
  }
  if (btnGoForgot) {
    btnGoForgot.addEventListener('click', async () => {
      await authTransitions.switchScreen(loginScreen, forgotScreen);
      showScreen(AUTH_STATE.FORGOT);
    });
  }

  // ========== REGISTRO ==========
  const registerForm = document.getElementById('registerForm');
  const btnRegister = document.getElementById('btnRegister');
  const btnGoToLoginFromRegister = document.getElementById('btnGoToLoginFromRegister');
  const btnCloseRegister = document.getElementById('btnCloseRegister');
  const regPassword = document.getElementById('regPassword');
  const regConfirm = document.getElementById('regConfirm');
  const regNickname = document.getElementById('regNickname');
  const nicknameFeedback = document.getElementById('nicknameFeedback');

  // Validação nickname em tempo real
  if (regNickname && nicknameFeedback) {
    regNickname.addEventListener('input', () => {
      const nick = regNickname.value.trim();
      if (nick.length === 0) { nicknameFeedback.textContent = ''; }
      else if (nick.length < 3) { nicknameFeedback.textContent = 'Mínimo de 3 caracteres'; nicknameFeedback.style.color = 'var(--auth-text-muted)'; }
      else if (nick.length > 15) { nicknameFeedback.textContent = 'Máximo de 15 caracteres'; nicknameFeedback.style.color = 'var(--auth-danger)'; }
      else if (!/^[A-Za-zÀ-ÿ0-9_ ]+$/.test(nick)) { nicknameFeedback.textContent = 'Apenas letras, números e _'; nicknameFeedback.style.color = 'var(--auth-danger)'; }
      else { nicknameFeedback.textContent = '✓ Nickname válido'; nicknameFeedback.style.color = 'var(--auth-success)'; }
    });
  }

  // Confirmação senha
  if (regConfirm && regPassword) {
    regConfirm.addEventListener('input', () => {
      if (regConfirm.value && regConfirm.value !== regPassword.value) regConfirm.setCustomValidity('Senhas não conferem');
      else regConfirm.setCustomValidity('');
    });
    regPassword.addEventListener('input', () => {
      if (regConfirm.value && regConfirm.value !== regPassword.value) regConfirm.setCustomValidity('Senhas não conferem');
      else regConfirm.setCustomValidity('');
    });
  }

  // SUBMIT REGISTRO
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const email = document.getElementById('regEmail').value.trim();
      const nickname = regNickname?.value.trim();
      const password = regPassword?.value;
      const confirm = regConfirm?.value;

      AuthLog.info('Submit registro:', { email, nickname, pwLen: password?.length });

      if (!email || !nickname || !password || !confirm) {
        UIEffects.showToast('Preencha todos os campos', 'error'); return;
      }
      if (!validarEmail(email)) { UIEffects.showToast('Email inválido', 'error'); return; }
      if (!validarNickname(nickname)) { UIEffects.showToast('Nickname deve ter 3-15 caracteres', 'error'); return; }
      if (password !== confirm) { UIEffects.showToast('Senhas não conferem', 'error'); return; }
      if (password.length < 6) { UIEffects.showToast('Senha deve ter no mínimo 6 caracteres', 'error'); return; }

      isSubmitting = true;
      btnRegister.disabled = true;
      UIEffects.showLoading(btnRegister);

      try {
        AuthLog.info('Criando usuário:', email);
        const result = await auth.createUserWithEmailAndPassword(email, password);
        AuthLog.info('Usuário criado! UID:', result.user.uid);

        // Atualizar displayName com o nickname
        try {
          await result.user.updateProfile({ displayName: nickname });
          AuthLog.info('displayName atualizado para:', nickname);
        } catch (upErr) {
          AuthLog.warn('Falha ao atualizar displayName:', upErr.message);
        }

        // Salvar perfil
        const playerData = {
          uid: result.user.uid,
          email: email,
          nickname: nickname,
        coins: 0, gems: 0,
          rank: 'Iniciante',
          avatar: nickname.charAt(0).toUpperCase(),
          wins: 0, losses: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
          await db.collection('players').doc(result.user.uid).set(playerData);
          AuthLog.info('Perfil salvo!');
        } catch (fsErr) {
          AuthLog.warn('Falha ao salvar perfil:', fsErr.message);
        }

        currentUserData = playerData;
        AuthLog.info('REGISTRO COMPLETO!');
        UIEffects.showToast('Conta criada com sucesso!', 'success');
        setTimeout(() => enterLobby(), 500);

      } catch (error) {
        AuthLog.error('ERRO REGISTRO:', error.code, error.message);
        let msg = 'Erro ao criar conta';
        switch (error.code) {
          case 'auth/email-already-in-use': msg = 'Este email já está em uso'; break;
          case 'auth/invalid-email': msg = 'Email inválido'; break;
          case 'auth/weak-password': msg = 'Senha muito fraca. Use 6+ caracteres'; break;
          case 'auth/operation-not-allowed': msg = 'Cadastro não habilitado no Firebase'; break;
          case 'auth/invalid-api-key': msg = 'ERRO: Firebase API Key inválida'; break;
          case 'auth/network-request-failed': msg = 'Falha de conexão'; break;
          case 'auth/configuration-not-found': msg = 'ERRO: Firebase não configurado. Verifique as credenciais'; break;
          case 'auth/too-many-requests': msg = 'Muitas tentativas. Aguarde'; break;
          default: msg = `Erro: ${error.message}`;
        }
        UIEffects.showToast(msg, 'error');
      } finally {
        isSubmitting = false;
        btnRegister.disabled = false;
        UIEffects.hideLoading(btnRegister);
      }
    });
  }

  if (btnGoToLoginFromRegister) {
    btnGoToLoginFromRegister.addEventListener('click', async () => {
      await authTransitions.switchScreen(registerScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }
  if (btnCloseRegister) {
    btnCloseRegister.addEventListener('click', async () => {
      await authTransitions.switchScreen(registerScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }

  // ========== RECUPERAÇÃO DE SENHA ==========
  const forgotForm = document.getElementById('forgotForm');
  const btnForgot = document.getElementById('btnForgot');
  const forgotSuccess = document.getElementById('forgotSuccess');
  const btnBackToLoginFromSuccess = document.getElementById('btnBackToLoginFromSuccess');
  const btnBackToLoginFromForgot = document.getElementById('btnBackToLoginFromForgot');

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const email = document.getElementById('forgotEmail').value.trim();
      if (!email) { UIEffects.showToast('Digite seu email', 'error'); return; }
      if (!validarEmail(email)) { UIEffects.showToast('Email inválido', 'error'); return; }

      isSubmitting = true;
      btnForgot.disabled = true;
      UIEffects.showLoading(btnForgot);

      try {
        await auth.sendPasswordResetEmail(email);
        AuthLog.info('Email de recuperação enviado');
        forgotForm.style.display = 'none';
        if (forgotSuccess) forgotSuccess.style.display = 'block';
        UIEffects.showToast('Email de recuperação enviado!', 'success');
      } catch (error) {
        AuthLog.error('Erro recuperação:', error.code, error.message);
        let msg = 'Erro ao enviar email';
        switch (error.code) {
          case 'auth/user-not-found': msg = 'Email não encontrado'; break;
          case 'auth/invalid-email': msg = 'Email inválido'; break;
          case 'auth/too-many-requests': msg = 'Muitas tentativas. Tente mais tarde'; break;
          default: msg = `Erro: ${error.message}`;
        }
        UIEffects.showToast(msg, 'error');
      } finally {
        isSubmitting = false;
        btnForgot.disabled = false;
        UIEffects.hideLoading(btnForgot);
      }
    });
  }

  if (btnBackToLoginFromSuccess) {
    btnBackToLoginFromSuccess.addEventListener('click', async () => {
      forgotForm.style.display = 'block';
      if (forgotSuccess) forgotSuccess.style.display = 'none';
      await authTransitions.switchScreen(forgotScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }
  if (btnBackToLoginFromForgot) {
    btnBackToLoginFromForgot.addEventListener('click', async () => {
      forgotForm.style.display = 'block';
      if (forgotSuccess) forgotSuccess.style.display = 'none';
      await authTransitions.switchScreen(forgotScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }

  // Botão de logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (typeof window.logout === 'function') {
        window.logout();
      } else {
        logout();
      }
    });
  }
});

// =============================================
// LISTENER DE AUTENTICAÇÃO
// =============================================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    if (currentState === AUTH_STATE.SPLASH || currentState === AUTH_STATE.CHECKING) {
      AuthLog.info('[onAuthStateChanged] Usuário detectado, carregando perfil');
      try { await loadUserProfile(user); } catch (err) {
        AuthLog.error('[onAuthStateChanged] Erro:', err);
      }
      setTimeout(() => {
        if (currentState !== AUTH_STATE.AUTHENTICATED) enterLobby();
      }, 1500);
    }
  }
});

// =============================================
// LOGOUT
// =============================================
async function logout() {
  AuthLog.info('Logout');
  try { await auth.signOut(); } catch (e) {
    AuthLog.warn('Erro signOut:', e.message);
  }
  currentUserData = null;
  currentState = AUTH_STATE.CHECKING;
  authFlowStarted = false;

  try {
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.style.opacity = '0';
    setTimeout(() => {
      if (lobby) lobby.style.display = 'none';
      if (authOverlay) authOverlay.style.display = 'flex';
      showScreen(AUTH_STATE.LOGIN);
    }, 300);
    UIEffects.showToast('Desconectado', 'success');
  } catch (err) {
    location.reload();
  }
}

window.logout = logout;
window.getCurrentUser = () => currentUserData;
window.currentUserData = currentUserData;
window.isAuthenticated = () => !!auth.currentUser;
window.AuthLog = AuthLog;

// =============================================
// INICIALIZAÇÃO
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  AuthLog.info('DOM pronto. Modo: Firebase ONLINE');
  setTimeout(initAuthFlow, 300);
});