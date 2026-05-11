// =============================================
// TRUCOMANIA AUTH - VERSÃO DEBUG + CORREÇÕES
// =============================================

// Helper de log estruturado
const AuthLog = {
  info: (msg, data) => console.log(`[AUTH ✅] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[AUTH ⚠️] ${msg}`, data || ''),
  error: (msg, data, stack) => {
    console.error(`[AUTH 🛑] ${msg}`, data || '');
    if (stack) console.error('[AUTH Stack]', stack);
  }
};

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
let isSubmitting = false; // ← Proteção anti-múltiplos submits
let authFlowStarted = false; // ← Evita init duplicado

// Elementos do DOM
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
  // Regex REAL de email
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return re.test(email);
}

function validarNickname(nick) {
  if (!nick || nick.length < 3 || nick.length > 15) return false;
  if (!/^[A-Za-zÀ-ÿ0-9_ ]+$/.test(nick)) return false;
  return true;
}

// =============================================
// FLUXO DE AUTENTICAÇÃO
// =============================================

function initVisualEffects() {
  try {
    const canvas = document.getElementById('particlesCanvas');
    const hazeCanvas = document.getElementById('hazeCanvas');
    
    if (canvas) {
      particlesSystem = new ParticleSystem(canvas);
      particlesSystem.start();
      AuthLog.info('Sistema de partículas iniciado');
    }
    
    if (hazeCanvas) {
      hazeEffect = new HazeEffect(hazeCanvas);
      hazeEffect.start();
      AuthLog.info('Efeito haze iniciado');
    }
  } catch (e) {
    AuthLog.warn('Erro ao iniciar efeitos visuais (não crítico):', e.message);
  }
}

async function initAuthFlow() {
  if (authFlowStarted) {
    AuthLog.warn('initAuthFlow já foi chamado, ignorando');
    return;
  }
  authFlowStarted = true;
  
  AuthLog.info('Iniciando fluxo de autenticação');
  
  try {
    showScreen(AUTH_STATE.SPLASH);
    initVisualEffects();
    
    const loadingBar = document.getElementById('splashLoadingBar');
    if (loadingBar) {
      await AuthTransitions.animateLoading(loadingBar, 2500);
    }
    
    // Verificar sessão existente
    AuthLog.info('Verificando sessão existente...');
    AuthLog.info('auth.currentUser:', auth.currentUser?.uid || 'null');
    
    const user = auth.currentUser;
    if (user) {
      AuthLog.info('Sessão existente encontrada:', user.email || user.uid);
      try {
        await loadUserProfile(user);
        AuthLog.info('Perfil carregado com sucesso');
      } catch (profileErr) {
        AuthLog.error('Erro ao carregar perfil (continuando):', profileErr.message, profileErr.stack);
      }
      enterLobby();
    } else {
      AuthLog.info('Nenhuma sessão ativa, indo para tela de login');
      if (authTransitions && splashScreen && authOverlay) {
        authTransitions.splashToAuth(splashScreen, authOverlay);
      } else {
        // Fallback se transitions não estiver pronto
        splashScreen.style.display = 'none';
        authOverlay.style.display = 'flex';
      }
      setTimeout(() => showScreen(AUTH_STATE.LOGIN), 500);
    }
  } catch (err) {
    AuthLog.error('ERRO no initAuthFlow:', err.message, err.stack);
    // Fallback: mostrar login mesmo com erro
    splashScreen.style.display = 'none';
    authOverlay.style.display = 'flex';
    showScreen(AUTH_STATE.LOGIN);
  }
}

function showScreen(screen) {
  AuthLog.info('Mudando para tela:', screen);
  currentState = screen;
  
  [loginScreen, registerScreen, forgotScreen].forEach(s => {
    if (s) {
      s.classList.remove('active');
      s.style.display = 'none';
    }
  });
  
  switch (screen) {
    case AUTH_STATE.SPLASH:
      if (splashScreen) {
        splashScreen.style.display = 'flex';
        AuthLog.info('Splash screen visível');
      }
      break;
    case AUTH_STATE.LOGIN:
      if (loginScreen) {
        loginScreen.style.display = 'flex';
        setTimeout(() => loginScreen.classList.add('active'), 10);
        AuthLog.info('Tela de login visível');
      }
      break;
    case AUTH_STATE.REGISTER:
      if (registerScreen) {
        registerScreen.style.display = 'flex';
        setTimeout(() => registerScreen.classList.add('active'), 10);
        AuthLog.info('Tela de registro visível');
      }
      break;
    case AUTH_STATE.FORGOT:
      if (forgotScreen) {
        forgotScreen.style.display = 'flex';
        setTimeout(() => forgotScreen.classList.add('active'), 10);
        AuthLog.info('Tela de recuperação visível');
      }
      break;
  }
}

async function loadUserProfile(user) {
  if (!user) {
    AuthLog.error('loadUserProfile chamado sem usuário');
    return null;
  }
  
  AuthLog.info('Carregando perfil do Firestore para:', user.uid);
  
  try {
    const doc = await db.collection('players').doc(user.uid).get();
    if (doc.exists) {
      currentUserData = doc.data();
      AuthLog.info('Perfil encontrado no Firestore:', currentUserData.nickname);
    } else {
      AuthLog.warn('Perfil não existe no Firestore, criando novo');
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
      AuthLog.info('Perfil criado no Firestore:', currentUserData.nickname);
    }
    return currentUserData;
  } catch (error) {
    AuthLog.error('Falha ao acessar Firestore:', error.code || error.message);
    // Fallback: usar dados mínimos do user
    currentUserData = {
      uid: user.uid,
      email: user.email,
      nickname: user.displayName || 'Jogador',
      coins: 1000,
      gems: 100,
      rank: 'Iniciante',
      avatar: 'TM',
      wins: 0,
      losses: 0,
      createdAt: new Date().toISOString()
    };
    AuthLog.warn('Usando fallback de perfil (Firestore indisponível)');
    return currentUserData;
  }
}

function enterLobby() {
  AuthLog.info('ENTRANDO NO LOBBY com nickname:', currentUserData?.nickname || 'desconhecido');
  
  try {
    authTransitions.authToLobby(authOverlay, document.getElementById('lobby'));
    
    const displayName = document.getElementById('playerDisplayName');
    if (displayName && currentUserData) {
      displayName.textContent = currentUserData.nickname || 'Truqueiro';
    }
    
    document.dispatchEvent(new CustomEvent('user-authenticated', {
      detail: currentUserData
    }));
    
    AuthLog.info('Evento user-authenticated disparado');
  } catch (err) {
    AuthLog.error('Erro na transição para lobby:', err.message, err.stack);
    // Fallback: mostrar lobby diretamente
    const lobby = document.getElementById('lobby');
    if (lobby) {
      authOverlay.style.display = 'none';
      lobby.style.display = 'block';
    }
  }
}

// =============================================
// EVENTOS DOS FORMULÁRIOS
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  AuthLog.info('DOMContentLoaded - inicializando handlers');
  
  // ============= LOGIN =============
  const loginForm = document.getElementById('loginForm');
  const btnLogin = document.getElementById('btnLogin');
  const btnGuest = document.getElementById('btnGuestLogin');
  const btnGoRegister = document.getElementById('btnGoToRegister');
  const btnGoForgot = document.getElementById('btnGoToForgot');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      AuthLog.info('Submit do formulário de login');
      
      // Proteção anti-múltiplos submits
      if (isSubmitting) {
        AuthLog.warn('Submit bloqueado - já está em andamento');
        return;
      }
      
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const rememberMe = document.getElementById('rememberMe')?.checked || false;
      
      // Validação de email com regex
      if (!email) {
        UIEffects.showToast('Digite seu email', 'error');
        return;
      }
      
      if (!validarEmail(email)) {
        AuthLog.warn('Email inválido:', email);
        UIEffects.showToast('Email inválido', 'error');
        return;
      }
      
      if (!password) {
        UIEffects.showToast('Digite sua senha', 'error');
        return;
      }
      
      if (password.length < 6) {
        UIEffects.showToast('Senha deve ter no mínimo 6 caracteres', 'error');
        return;
      }
      
      isSubmitting = true;
      btnLogin.disabled = true;
      UIEffects.showLoading(btnLogin);
      AuthLog.info('Tentando login email/senha:', email);
      
      try {
        // Configurar persistência sob demanda
        const persistence = rememberMe 
          ? firebase.auth.Auth.Persistence.LOCAL 
          : firebase.auth.Auth.Persistence.SESSION;
        
        try {
          await auth.setPersistence(persistence);
          AuthLog.info('Persistência configurada:', rememberMe ? 'LOCAL' : 'SESSION');
        } catch (persistErr) {
          AuthLog.warn('Falha ao configurar persistência (não crítico):', persistErr.message);
        }
        
        const result = await auth.signInWithEmailAndPassword(email, password);
        AuthLog.info('Login bem-sucedido! UID:', result.user.uid);
        
        await loadUserProfile(result.user);
        enterLobby();
      } catch (error) {
        AuthLog.error('ERRO NO LOGIN - code:', error.code, 'message:', error.message);
        
        let message = 'Erro ao fazer login';
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
            message = 'Email ou senha inválidos';
            break;
          case 'auth/invalid-email':
            message = 'Formato de email inválido';
            break;
          case 'auth/too-many-requests':
            message = 'Muitas tentativas. Tente novamente mais tarde';
            break;
          case 'auth/user-disabled':
            message = 'Esta conta foi desativada';
            break;
          case 'auth/invalid-api-key':
            message = 'ERRO DE CONFIGURAÇÃO: Firebase API Key inválida. Verifique firebase.js';
            break;
          case 'auth/network-request-failed':
            message = 'Falha de conexão. Verifique sua internet';
            break;
          case 'auth/configuration-not-found':
            message = 'ERRO: Firebase não configurado corretamente. Verifique credenciais';
            break;
          case 'auth/operation-not-allowed':
            message = 'Login com email/senha não está habilitado no Firebase Console';
            break;
          default:
            message = `Erro: ${error.message || 'Desconhecido'}`;
        }
        UIEffects.showToast(message, 'error');
      } finally {
        isSubmitting = false;
        btnLogin.disabled = false;
        UIEffects.hideLoading(btnLogin);
        AuthLog.info('Processo de login finalizado');
      }
    });
  } else {
    AuthLog.error('Formulário de login NÃO encontrado no DOM');
  }

  // Google Login REMOVIDO conforme solicitado

  // Convidado
  if (btnGuest) {
    btnGuest.addEventListener('click', () => {
      AuthLog.info('Entrando como visitante');
      UIEffects.showToast('Entrando como visitante...', 'success');
      
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

  // Navegação
  if (btnGoRegister) {
    btnGoRegister.addEventListener('click', () => {
      AuthLog.info('Navegando: Login → Register');
      authTransitions.switchScreen(loginScreen, registerScreen);
      showScreen(AUTH_STATE.REGISTER);
    });
  }

  if (btnGoForgot) {
    btnGoForgot.addEventListener('click', () => {
      AuthLog.info('Navegando: Login → Forgot');
      authTransitions.switchScreen(loginScreen, forgotScreen);
      showScreen(AUTH_STATE.FORGOT);
    });
  }

  // ============= REGISTRO =============
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
      if (nick.length === 0) {
        nicknameFeedback.textContent = '';
      } else if (nick.length < 3) {
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

  // Submit do REGISTRO - VERSÃO CORRIGIDA COM DEBUG COMPLETO
  if (registerForm) {
    AuthLog.info('Handler de registro registrado');
    
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      AuthLog.info('=== SUBMIT DO FORMULÁRIO DE REGISTRO ===');
      
      // Proteção anti-múltiplos submits
      if (isSubmitting) {
        AuthLog.warn('Submit bloqueado - registro já em andamento');
        return;
      }
      
      // Capturar valores
      const email = document.getElementById('regEmail').value.trim();
      const nickname = regNickname?.value.trim();
      const password = regPassword?.value;
      const confirm = regConfirm?.value;
      
      AuthLog.info('Dados do formulário:', { 
        email: email || '(vazio)', 
        nickname: nickname || '(vazio)',
        passwordLength: password?.length || 0,
        confirmLength: confirm?.length || 0
      });
      
      // === VALIDAÇÕES ===
      
      if (!email || !nickname || !password || !confirm) {
        AuthLog.warn('Campos obrigatórios faltando');
        UIEffects.showToast('Preencha todos os campos', 'error');
        return;
      }
      
      if (!validarEmail(email)) {
        AuthLog.warn('Email inválido:', email);
        UIEffects.showToast('Email inválido. Use um formato como: nome@email.com', 'error');
        return;
      }
      
      if (!validarNickname(nickname)) {
        AuthLog.warn('Nickname inválido:', nickname);
        UIEffects.showToast('Nickname deve ter 3-15 caracteres (letras, números e _)', 'error');
        return;
      }
      
      if (password !== confirm) {
        AuthLog.warn('Senhas não conferem');
        UIEffects.showToast('Senhas não conferem', 'error');
        return;
      }
      
      if (password.length < 6) {
        AuthLog.warn('Senha muito curta:', password.length);
        UIEffects.showToast('Senha deve ter no mínimo 6 caracteres', 'error');
        return;
      }
      
      // Bloquear submit duplicado
      isSubmitting = true;
      btnRegister.disabled = true;
      UIEffects.showLoading(btnRegister);
      
      AuthLog.info('Iniciando criação de usuário no Firebase Auth...');
      AuthLog.info('Chamando auth.createUserWithEmailAndPassword com email:', email);
      
      try {
        // === PASSO 1: Criar usuário no Firebase Auth ===
        const result = await auth.createUserWithEmailAndPassword(email, password);
        AuthLog.info('✅ USUÁRIO CRIADO NO FIREBASE AUTH!');
        AuthLog.info('UID:', result.user.uid);
        AuthLog.info('Email:', result.user.email);
        
        // === PASSO 2: Atualizar displayName ===
        AuthLog.info('Atualizando displayName para:', nickname);
        try {
          await result.user.updateProfile({
            displayName: nickname
          });
          AuthLog.info('✅ displayName atualizado com sucesso');
        } catch (profileErr) {
          AuthLog.warn('Falha ao atualizar displayName (não crítico):', profileErr.message);
        }
        
        // === PASSO 3: Criar perfil no Firestore ===
        AuthLog.info('Criando perfil no Firestore...');
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
        
        try {
          await db.collection('players').doc(result.user.uid).set(playerData);
          AuthLog.info('✅ Perfil salvo no Firestore com sucesso');
        } catch (firestoreErr) {
          AuthLog.warn('Falha ao salvar perfil no Firestore:', firestoreErr.message);
          AuthLog.info('Continuando sem Firestore (login ainda funciona)');
        }
        
        currentUserData = playerData;
        
        AuthLog.info('🎉 REGISTRO COMPLETO com sucesso!');
        UIEffects.showToast('Conta criada com sucesso!', 'success');
        
        // Pequeno delay para mostrar o toast antes da transição
        setTimeout(() => enterLobby(), 500);
        
      } catch (error) {
        // === TRATAMENTO COMPLETO DE ERROS ===
        AuthLog.error('🛑 ERRO NO REGISTRO:');
        AuthLog.error('Código:', error.code);
        AuthLog.error('Mensagem completa:', error.message);
        AuthLog.error('Stack:', error.stack);
        
        let message = 'Erro ao criar conta';
        
        // Mapeamento completo de erros
        switch (error.code) {
          case 'auth/email-already-in-use':
            message = 'Este email já está em uso por outra conta';
            break;
          case 'auth/invalid-email':
            message = 'O formato do email é inválido';
            break;
          case 'auth/weak-password':
            message = 'Senha muito fraca. Use pelo menos 6 caracteres com letras e números';
            break;
          case 'auth/operation-not-allowed':
            message = 'Cadastro por email/senha não está habilitado no Firebase Console';
            AuthLog.error('SOLUÇÃO: Ative "Email/Password" em Firebase > Authentication > Sign-in method');
            break;
          case 'auth/invalid-api-key':
            message = 'ERRO DE CONFIGURAÇÃO: A chave da API Firebase é inválida';
            AuthLog.error('SOLUÇÃO: Substitua as credenciais em firebase.js pelas do seu projeto Firebase');
            break;
          case 'auth/network-request-failed':
            message = 'Falha de conexão com a internet. Verifique sua rede';
            break;
          case 'auth/configuration-not-found':
            message = 'Projeto Firebase não encontrado. Verifique as credenciais em firebase.js';
            break;
          case 'auth/too-many-requests':
            message = 'Muitas tentativas. Aguarde alguns minutos e tente novamente';
            break;
          default:
            // Mostrar o erro real do Firebase na tela
            message = `Erro: ${error.message || 'Falha desconhecida'}`;
        }
        
        AuthLog.error('Mensagem para o usuário:', message);
        UIEffects.showToast(message, 'error');
        
      } finally {
        // Garantir que os botões sejam reabilitados
        isSubmitting = false;
        btnRegister.disabled = false;
        UIEffects.hideLoading(btnRegister);
        AuthLog.info('Processo de registro finalizado (finally)');
      }
    });
  } else {
    AuthLog.error('🛑 Formulário de registro NÃO encontrado no DOM');
    AuthLog.error('Verifique se o elemento #registerForm existe no index.html');
    AuthLog.error('IDs disponíveis no DOM:', 
      Array.from(document.querySelectorAll('form')).map(f => f.id));
  }

  if (btnGoToLoginFromRegister) {
    btnGoToLoginFromRegister.addEventListener('click', () => {
      AuthLog.info('Navegando: Register → Login');
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

  // ============= RECUPERAÇÃO DE SENHA =============
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
      if (!email) {
        UIEffects.showToast('Digite seu email', 'error');
        return;
      }
      
      if (!validarEmail(email)) {
        UIEffects.showToast('Email inválido', 'error');
        return;
      }
      
      isSubmitting = true;
      btnForgot.disabled = true;
      UIEffects.showLoading(btnForgot);
      AuthLog.info('Solicitando recuperação de senha para:', email);
      
      try {
        await auth.sendPasswordResetEmail(email);
        AuthLog.info('Email de recuperação enviado com sucesso');
        
        forgotForm.style.display = 'none';
        if (forgotSuccess) forgotSuccess.style.display = 'block';
        
        UIEffects.showToast('Email de recuperação enviado!', 'success');
      } catch (error) {
        AuthLog.error('Erro na recuperação de senha:', error.code, error.message);
        
        let message = 'Erro ao enviar email';
        switch (error.code) {
          case 'auth/user-not-found':
            message = 'Nenhuma conta encontrada com este email';
            break;
          case 'auth/invalid-email':
            message = 'Email inválido';
            break;
          case 'auth/too-many-requests':
            message = 'Muitas tentativas. Tente novamente mais tarde';
            break;
          case 'auth/invalid-api-key':
            message = 'ERRO DE CONFIGURAÇÃO: Firebase API Key inválida';
            break;
          case 'auth/network-request-failed':
            message = 'Falha de conexão. Verifique sua internet';
            break;
          default:
            message = `Erro: ${error.message}`;
        }
        UIEffects.showToast(message, 'error');
      } finally {
        isSubmitting = false;
        btnForgot.disabled = false;
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
});

// =============================================
// LISTENER DE AUTENTICAÇÃO (CORRIGIDO RACE CONDITION)
// =============================================
let authListenerInitialized = false;

auth.onAuthStateChanged(async (user) => {
  // Evitar duplicação
  if (authListenerInitialized) return;
  authListenerInitialized = true;
  
  if (user) {
    AuthLog.info('[onAuthStateChanged] Usuário detectado:', user.email || user.uid);
    
    // Só agir se ainda estiver no fluxo inicial
    if (currentState === AUTH_STATE.SPLASH || currentState === AUTH_STATE.CHECKING) {
      AuthLog.info('[onAuthStateChanged] Carregando perfil e entrando no lobby');
      
      try {
        await loadUserProfile(user);
      } catch (err) {
        AuthLog.error('[onAuthStateChanged] Erro ao carregar perfil:', err);
      }
      
      // Esperar splash completar antes de entrar
      setTimeout(() => {
        if (currentState !== AUTH_STATE.AUTHENTICATED) {
          enterLobby();
        }
      }, 2000);
    }
  } else {
    AuthLog.info('[onAuthStateChanged] Nenhum usuário logado');
  }
});

// =============================================
// LOGOUT CORRIGIDO
// =============================================
async function logout() {
  AuthLog.info('Iniciando logout');
  
  try {
    await auth.signOut();
    AuthLog.info('Logout do Firebase bem-sucedido');
  } catch (signOutErr) {
    AuthLog.warn('Erro ao fazer signOut Firebase (continuando):', signOutErr.message);
  }
  
  currentUserData = null;
  currentState = AUTH_STATE.CHECKING;
  
  // Limpar flag para permitir novo init
  authFlowStarted = false;
  authListenerInitialized = false;
  
  try {
    const lobby = document.getElementById('lobby');
    if (lobby) lobby.style.opacity = '0';
    
    setTimeout(() => {
      if (lobby) lobby.style.display = 'none';
      if (authOverlay) authOverlay.style.display = 'flex';
      showScreen(AUTH_STATE.LOGIN);
    }, 300);
    
    UIEffects.showToast('Desconectado com sucesso', 'success');
  } catch (err) {
    AuthLog.error('Erro no logout UI:', err.message);
    // Fallback: recarregar página
    location.reload();
  }
}

// Expor funções globalmente
window.logout = logout;
window.getCurrentUser = () => currentUserData;
window.isAuthenticated = () => !!auth.currentUser || !!currentUserData?.uid?.startsWith('guest_');
window.AuthLog = AuthLog; // Expor logs para debug no console

// =============================================
// INICIALIZAÇÃO
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  AuthLog.info('DOM completamente carregado, iniciando auth flow em 300ms');
  
  // Listar forms disponíveis para debug
  const forms = document.querySelectorAll('form');
  AuthLog.info('Forms encontrados no DOM:', forms.length);
  forms.forEach(f => AuthLog.info(' - Form ID:', f.id));
  
  setTimeout(() => {
    AuthLog.info('Chamando initAuthFlow()');
    initAuthFlow();
  }, 300);
});