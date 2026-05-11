// =============================================
// TRUCOMANIA AUTH - LÓGICA COMPLETA
// =============================================

// Estados da autenticação
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

// Elementos do DOM
const splashScreen = document.getElementById('splashScreen');
const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const forgotScreen = document.getElementById('forgotScreen');
const authOverlay = document.getElementById('authOverlay');

// =============================================
// FLUXO DE AUTENTICAÇÃO
// =============================================

// Inicializar efeitos visuais
function initVisualEffects() {
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
}

// Fluxo principal de inicialização
async function initAuthFlow() {
  // Mostrar splash primeiro
  showScreen(AUTH_STATE.SPLASH);
  
  // Iniciar efeitos de fundo
  initVisualEffects();
  
  // Animar barra de loading
  const loadingBar = document.getElementById('splashLoadingBar');
  if (loadingBar) {
    await AuthTransitions.animateLoading(loadingBar, 2500);
  }
  
  // Verificar sessão existente
  const user = auth.currentUser;
  if (user) {
    // Sessão existente - carregar perfil
    await loadUserProfile(user);
    enterLobby();
  } else {
    // Sem sessão - ir para login
    authTransitions.splashToAuth(splashScreen, authOverlay);
    setTimeout(() => showScreen(AUTH_STATE.LOGIN), 500);
  }
}

// Mostrar tela específica
function showScreen(screen) {
  currentState = screen;
  
  // Esconder todas
  [loginScreen, registerScreen, forgotScreen].forEach(s => {
    if (s) {
      s.classList.remove('active');
      s.style.display = 'none';
    }
  });
  
  // Mostrar a correta
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

// Carregar perfil do Firestore
async function loadUserProfile(user) {
  try {
    const doc = await db.collection('players').doc(user.uid).get();
    if (doc.exists) {
      currentUserData = doc.data();
    } else {
      // Criar perfil básico se não existir
      currentUserData = {
        uid: user.uid,
        email: user.email,
        nickname: user.displayName || user.email?.split('@')[0] || 'Jogador',
        coins: 1000,
        gems: 100,
        rank: 'Iniciante',
        avatar: 'TM',
        wins: 0,
        losses: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('players').doc(user.uid).set(currentUserData);
    }
    return currentUserData;
  } catch (error) {
    console.warn('Erro ao carregar perfil:', error);
    return null;
  }
}

// Entrar no lobby (autenticado)
function enterLobby() {
  // Transição com fade
  authTransitions.authToLobby(authOverlay, document.getElementById('lobby'));
  
  // Atualizar dados do jogador no lobby
  const displayName = document.getElementById('playerDisplayName');
  if (displayName && currentUserData) {
    displayName.textContent = currentUserData.nickname || 'Truqueiro';
  }
  
  // Disparar evento
  document.dispatchEvent(new CustomEvent('user-authenticated', {
    detail: currentUserData
  }));
}

// =============================================
// EVENTOS DOS FORMULÁRIOS
// =============================================

// LOGIN
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const btnLogin = document.getElementById('btnLogin');
  const btnGoogle = document.getElementById('btnGoogleLogin');
  const btnGuest = document.getElementById('btnGuestLogin');
  const btnGoRegister = document.getElementById('btnGoToRegister');
  const btnGoForgot = document.getElementById('btnGoToForgot');
  const btnCloseLogin = document.getElementById('btnCloseLogin');

  // Login email/senha
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const rememberMe = document.getElementById('rememberMe')?.checked || false;
      
      if (!email || !password) {
        UIEffects.showToast('Preencha todos os campos', 'error');
        return;
      }
      
      UIEffects.showLoading(btnLogin);
      
      try {
        const persistence = rememberMe 
          ? firebase.auth.Auth.Persistence.LOCAL 
          : firebase.auth.Auth.Persistence.SESSION;
        await auth.setPersistence(persistence);
        
        const result = await auth.signInWithEmailAndPassword(email, password);
        await loadUserProfile(result.user);
        enterLobby();
      } catch (error) {
        let message = 'Erro ao fazer login';
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-email':
            message = 'Email ou senha inválidos';
            break;
          case 'auth/too-many-requests':
            message = 'Muitas tentativas. Tente novamente mais tarde';
            break;
          case 'auth/user-disabled':
            message = 'Conta desativada';
            break;
        }
        UIEffects.showToast(message, 'error');
      } finally {
        UIEffects.hideLoading(btnLogin);
      }
    });
  }

  // Login Google
  if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
      UIEffects.showLoading(btnGoogle);
      
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        
        const result = await auth.signInWithPopup(provider);
        await loadUserProfile(result.user);
        enterLobby();
      } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
          UIEffects.showToast('Erro ao fazer login com Google', 'error');
        }
      } finally {
        UIEffects.hideLoading(btnGoogle);
      }
    });
  }

  // Convidado
  if (btnGuest) {
    btnGuest.addEventListener('click', () => {
      UIEffects.showToast('Entrando como visitante...', 'success');
      
      // Criar perfil visitante anônimo
      currentUserData = {
        uid: 'guest_' + Date.now(),
        email: null,
        nickname: 'Visitante',
        coins: 500,
        gems: 50,
        rank: 'Visitante',
        avatar: '👤',
        wins: 0,
        losses: 0,
        createdAt: new Date().toISOString()
      };
      
      enterLobby();
    });
  }

  // Navegação entre telas
  if (btnGoRegister) {
    btnGoRegister.addEventListener('click', () => {
      authTransitions.switchScreen(loginScreen, registerScreen);
      showScreen(AUTH_STATE.REGISTER);
    });
  }

  if (btnGoForgot) {
    btnGoForgot.addEventListener('click', () => {
      authTransitions.switchScreen(loginScreen, forgotScreen);
      showScreen(AUTH_STATE.FORGOT);
    });
  }

  if (btnCloseLogin) {
    btnCloseLogin.addEventListener('click', () => {
      // Apenas esconde o auth se não estiver autenticado ainda
      if (currentState !== AUTH_STATE.AUTHENTICATED) {
        UIEffects.showToast('Faça login para jogar', 'error');
      }
    });
  }

  // =============================================
  // REGISTRO
  // =============================================
  const registerForm = document.getElementById('registerForm');
  const btnRegister = document.getElementById('btnRegister');
  const btnGoToLoginFromRegister = document.getElementById('btnGoToLoginFromRegister');
  const btnCloseRegister = document.getElementById('btnCloseRegister');
  const regPassword = document.getElementById('regPassword');
  const regConfirm = document.getElementById('regConfirm');
  const regNickname = document.getElementById('regNickname');
  const nicknameFeedback = document.getElementById('nicknameFeedback');

  // Validação de nickname em tempo real
  if (regNickname && nicknameFeedback) {
    regNickname.addEventListener('input', () => {
      const nick = regNickname.value.trim();
      if (nick.length < 3) {
        nicknameFeedback.textContent = 'Mínimo de 3 caracteres';
        nicknameFeedback.style.color = 'var(--auth-text-muted)';
      } else if (nick.length > 15) {
        nicknameFeedback.textContent = 'Máximo de 15 caracteres';
        nicknameFeedback.style.color = 'var(--auth-danger)';
      } else if (!/^[A-Za-zÀ-ÿ0-9_ ]+$/.test(nick)) {
        nicknameFeedback.textContent = 'Apenas letras, números e _';
        nicknameFeedback.style.color = 'var(--auth-danger)';
      } else {
        nicknameFeedback.textContent = '✓ Nickname válido';
        nicknameFeedback.style.color = 'var(--auth-success)';
      }
    });
  }

  // Validação de confirmação de senha
  if (regConfirm && regPassword) {
    regConfirm.addEventListener('input', () => {
      if (regConfirm.value && regConfirm.value !== regPassword.value) {
        regConfirm.setCustomValidity('Senhas não conferem');
      } else {
        regConfirm.setCustomValidity('');
      }
    });
    
    regPassword.addEventListener('input', () => {
      if (regConfirm.value && regConfirm.value !== regPassword.value) {
        regConfirm.setCustomValidity('Senhas não conferem');
      } else {
        regConfirm.setCustomValidity('');
      }
    });
  }

  // Submit registro
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('regEmail').value.trim();
      const nickname = regNickname?.value.trim();
      const password = regPassword?.value;
      const confirm = regConfirm?.value;
      
      // Validações
      if (!email || !nickname || !password || !confirm) {
        UIEffects.showToast('Preencha todos os campos', 'error');
        return;
      }
      
      if (nickname.length < 3 || nickname.length > 15) {
        UIEffects.showToast('Nickname deve ter entre 3 e 15 caracteres', 'error');
        return;
      }
      
      if (password !== confirm) {
        UIEffects.showToast('Senhas não conferem', 'error');
        return;
      }
      
      if (password.length < 6) {
        UIEffects.showToast('Senha deve ter no mínimo 6 caracteres', 'error');
        return;
      }
      
      UIEffects.showLoading(btnRegister);
      
      try {
        // Criar usuário
        const result = await auth.createUserWithEmailAndPassword(email, password);
        
        // Atualizar displayName
        await result.user.updateProfile({
          displayName: nickname
        });
        
        // Criar perfil no Firestore
        const playerData = {
          uid: result.user.uid,
          email: email,
          nickname: nickname,
          coins: 1000,
          gems: 100,
          rank: 'Iniciante',
          avatar: nickname.charAt(0).toUpperCase(),
          wins: 0,
          losses: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('players').doc(result.user.uid).set(playerData);
        currentUserData = playerData;
        
        UIEffects.showToast('Conta criada com sucesso!', 'success');
        enterLobby();
      } catch (error) {
        let message = 'Erro ao criar conta';
        switch (error.code) {
          case 'auth/email-already-in-use':
            message = 'Este email já está em uso';
            break;
          case 'auth/invalid-email':
            message = 'Email inválido';
            break;
          case 'auth/weak-password':
            message = 'Senha muito fraca';
            break;
        }
        UIEffects.showToast(message, 'error');
      } finally {
        UIEffects.hideLoading(btnRegister);
      }
    });
  }

  if (btnGoToLoginFromRegister) {
    btnGoToLoginFromRegister.addEventListener('click', () => {
      authTransitions.switchScreen(registerScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }

  if (btnCloseRegister) {
    btnCloseRegister.addEventListener('click', () => {
      authTransitions.switchScreen(registerScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }

  // =============================================
  // RECUPERAÇÃO DE SENHA
  // =============================================
  const forgotForm = document.getElementById('forgotForm');
  const btnForgot = document.getElementById('btnForgot');
  const forgotSuccess = document.getElementById('forgotSuccess');
  const btnBackToLoginFromSuccess = document.getElementById('btnBackToLoginFromSuccess');
  const btnBackToLoginFromForgot = document.getElementById('btnBackToLoginFromForgot');
  const btnCloseForgot = document.getElementById('btnCloseForgot');

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('forgotEmail').value.trim();
      if (!email) {
        UIEffects.showToast('Digite seu email', 'error');
        return;
      }
      
      UIEffects.showLoading(btnForgot);
      
      try {
        await auth.sendPasswordResetEmail(email);
        
        // Esconder formulário, mostrar sucesso
        forgotForm.style.display = 'none';
        if (forgotSuccess) forgotSuccess.style.display = 'block';
        
        UIEffects.showToast('Email de recuperação enviado!', 'success');
      } catch (error) {
        let message = 'Erro ao enviar email';
        switch (error.code) {
          case 'auth/user-not-found':
            message = 'Email não encontrado';
            break;
          case 'auth/invalid-email':
            message = 'Email inválido';
            break;
          case 'auth/too-many-requests':
            message = 'Muitas tentativas. Tente novamente mais tarde';
            break;
        }
        UIEffects.showToast(message, 'error');
      } finally {
        UIEffects.hideLoading(btnForgot);
      }
    });
  }

  if (btnBackToLoginFromSuccess) {
    btnBackToLoginFromSuccess.addEventListener('click', () => {
      forgotForm.style.display = 'block';
      if (forgotSuccess) forgotSuccess.style.display = 'none';
      authTransitions.switchScreen(forgotScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }

  if (btnBackToLoginFromForgot) {
    btnBackToLoginFromForgot.addEventListener('click', () => {
      forgotForm.style.display = 'block';
      if (forgotSuccess) forgotSuccess.style.display = 'none';
      authTransitions.switchScreen(forgotScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }

  if (btnCloseForgot) {
    btnCloseForgot.addEventListener('click', () => {
      forgotForm.style.display = 'block';
      if (forgotSuccess) forgotSuccess.style.display = 'none';
      authTransitions.switchScreen(forgotScreen, loginScreen);
      showScreen(AUTH_STATE.LOGIN);
    });
  }
});

// =============================================
// LISTENER DE AUTENTICAÇÃO
// =============================================
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // Usuário já está logado (pode ser de sessão anterior)
    if (currentState === AUTH_STATE.SPLASH || currentState === AUTH_STATE.CHECKING) {
      await loadUserProfile(user);
      // Aguardar splash terminar
      setTimeout(() => {
        if (currentState !== AUTH_STATE.AUTHENTICATED) {
          enterLobby();
        }
      }, 2000);
    }
  }
});

// =============================================
// LOGOUT
// =============================================
async function logout() {
  try {
    await auth.signOut();
    currentUserData = null;
    currentState = AUTH_STATE.CHECKING;
    
    // Voltar para tela de login
    const lobby = document.getElementById('lobby');
    lobby.style.opacity = '0';
    
    setTimeout(() => {
      lobby.style.display = 'none';
      authOverlay.style.display = 'flex';
      showScreen(AUTH_STATE.LOGIN);
    }, 300);
    
    UIEffects.showToast('Desconectado com sucesso', 'success');
  } catch (error) {
    UIEffects.showToast('Erro ao desconectar', 'error');
  }
}

// Expor funções globalmente
window.logout = logout;
window.getCurrentUser = () => currentUserData;
window.isAuthenticated = () => !!auth.currentUser || !!currentUserData?.uid?.startsWith('guest_');

// =============================================
// INICIALIZAÇÃO
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  // Iniciar fluxo de autenticação
  setTimeout(initAuthFlow, 300);
});