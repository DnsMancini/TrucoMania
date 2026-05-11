// =============================================
// TRUCOMANIA FIREBASE - COM FALLBACK OFFLINE
// =============================================
// Se o Firebase não estiver configurado, usa localStorage.
// Quando configurar as credenciais reais, o Firebase ativa automaticamente.

const defaultFirebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const runtimeFirebaseConfig = window.__TRUCOMANIA_CONFIG__?.firebaseConfig || {};

function sanitizeFirebaseConfig(config) {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
  );
}

const firebaseConfig = sanitizeFirebaseConfig({ ...defaultFirebaseConfig, ...runtimeFirebaseConfig });

function hasPlaceholderConfig(config) {
  return !config.apiKey || config.apiKey.includes('DEFAULT_KEY') || !config.projectId || !config.authDomain;
}

function maskSensitiveConfig(config) {
  return {
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 6)}...` : '(não definido)',
    appId: config.appId ? `${config.appId.slice(0, 10)}...` : '(não definido)'
  };
}

console.log('[FIREBASE] Verificando configuração...');

// =============================================
// SISTEMA OFFLINE (localStorage)
// =============================================

const OFFLINE_PREFIX = 'truco_offline_';
const OFFLINE_USERS_KEY = OFFLINE_PREFIX + 'users';
const OFFLINE_SESSION_KEY = OFFLINE_PREFIX + 'session';

function getOfflineUsers() {
  try {
    const raw = localStorage.getItem(OFFLINE_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveOfflineUsers(users) {
  localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(users));
}

function getOfflineSession() {
  try {
    const raw = localStorage.getItem(OFFLINE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveOfflineSession(session) {
  if (session) {
    localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(OFFLINE_SESSION_KEY);
  }
}

function generateId() {
  return 'off_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// Estado offline global
let offlineCurrentUser = getOfflineSession();
let offlineListeners = [];

function notifyOfflineListeners(user) {
  offlineListeners.forEach(fn => {
    try { fn(user); } catch(e) {}
  });
}

// Objeto auth offline
const offlineAuth = {
  currentUser: offlineCurrentUser,

  onAuthStateChanged(callback) {
    offlineListeners.push(callback);
    // Chamar imediatamente com estado atual
    setTimeout(() => callback(this.currentUser), 0);
    // Retornar função de unsubscribe
    return () => {
      offlineListeners = offlineListeners.filter(fn => fn !== callback);
    };
  },

  async setPersistence() {
    // No offline, sempre persistente (localStorage)
    return Promise.resolve();
  },

  async signInWithEmailAndPassword(email, password) {
    const users = getOfflineUsers();
    const user = Object.values(users).find(u => u.email === email);
    
    if (!user) {
      const err = new Error('Nenhum usuário encontrado com este email');
      err.code = 'auth/user-not-found';
      throw err;
    }
    
    // Hash simples (não criptográfico - apenas para simular)
    const hash = btoa(password);
    if (user.passwordHash !== hash) {
      const err = new Error('Senha incorreta');
      err.code = 'auth/wrong-password';
      throw err;
    }
    
    const sessionUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.nickname,
      emailVerified: true,
      isAnonymous: false,
      metadata: { creationTime: user.createdAt }
    };
    
    this.currentUser = sessionUser;
    offlineCurrentUser = sessionUser;
    saveOfflineSession(sessionUser);
    notifyOfflineListeners(sessionUser);
    
    return { user: sessionUser };
  },

  async createUserWithEmailAndPassword(email, password) {
    const users = getOfflineUsers();
    
    // Verificar se email já existe
    if (Object.values(users).some(u => u.email === email)) {
      const err = new Error('Este email já está em uso');
      err.code = 'auth/email-already-in-use';
      throw err;
    }
    
    const uid = generateId();
    const hash = btoa(password);
    
    const newUser = {
      uid,
      email,
      nickname: email.split('@')[0],
      passwordHash: hash,
      coins: 1000,
      gems: 100,
      rank: 'Iniciante',
      avatar: email.charAt(0).toUpperCase(),
      wins: 0,
      losses: 0,
      createdAt: new Date().toISOString()
    };
    
    users[uid] = newUser;
    saveOfflineUsers(users);
    
    const sessionUser = {
      uid,
      email,
      displayName: email.split('@')[0],
      emailVerified: true,
      isAnonymous: false,
      metadata: { creationTime: newUser.createdAt }
    };
    
    this.currentUser = sessionUser;
    offlineCurrentUser = sessionUser;
    saveOfflineSession(sessionUser);
    notifyOfflineListeners(sessionUser);
    
    return { user: sessionUser };
  },

  async sendPasswordResetEmail(email) {
    const users = getOfflineUsers();
    const exists = Object.values(users).some(u => u.email === email);
    
    if (!exists) {
      const err = new Error('Nenhum usuário encontrado com este email');
      err.code = 'auth/user-not-found';
      throw err;
    }
    
    // Modo offline: apenas simula o envio
    console.log('[OFFLINE AUTH] Email de recuperação simulado para:', email);
    return Promise.resolve();
  },

  async signOut() {
    this.currentUser = null;
    offlineCurrentUser = null;
    saveOfflineSession(null);
    notifyOfflineListeners(null);
    return Promise.resolve();
  },

  async updateProfile(uid, data) {
    const users = getOfflineUsers();
    if (users[uid]) {
      Object.assign(users[uid], data);
      saveOfflineUsers(users);
    }
    if (this.currentUser && this.currentUser.uid === uid) {
      Object.assign(this.currentUser, data);
      offlineCurrentUser = { ...this.currentUser };
      saveOfflineSession(this.currentUser);
    }
    return Promise.resolve();
  }
};

// =============================================
// FIRESTORE OFFLINE
// =============================================

function getOfflinePlayers() {
  try {
    const raw = localStorage.getItem(OFFLINE_PREFIX + 'players');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveOfflinePlayers(players) {
  localStorage.setItem(OFFLINE_PREFIX + 'players', JSON.stringify(players));
}

const offlineDb = {
  collection(collectionName) {
    return {
      doc(docId) {
        return {
          async get() {
            const players = getOfflinePlayers();
            const data = players[docId] || null;
            return {
              exists: !!data,
              data: () => data
            };
          },
          async set(data) {
            const players = getOfflinePlayers();
            players[docId] = { ...data, uid: docId };
            saveOfflinePlayers(players);
          },
          async update(data) {
            const players = getOfflinePlayers();
            if (players[docId]) {
              Object.assign(players[docId], data);
              saveOfflinePlayers(players);
            }
          }
        };
      },
      async add(data) {
        const id = generateId();
        const doc = { ...data, uid: id };
        const players = getOfflinePlayers();
        players[id] = doc;
        saveOfflinePlayers(players);
        return { id };
      }
    };
  }
};

// =============================================
// DECISÃO: Firebase Real vs Offline
// =============================================

let auth;
let db;
let isOfflineMode = false;

if (hasPlaceholderConfig(firebaseConfig)) {
  console.log('[FIREBASE] Nenhuma credencial configurada. Usando MODO OFFLINE.');
  console.log('[FIREBASE] Para usar Firebase, configure as variáveis FIREBASE_* no servidor ou edite as credenciais aqui.');
  isOfflineMode = true;
  window.__FIREBASE_DISABLED__ = true;
  window.__OFFLINE_MODE__ = true;
  auth = offlineAuth;
  db = offlineDb;
} else {
  // Verificar se as credenciais parecem válidas
  try {
    firebase.initializeApp(firebaseConfig);
    console.log('[FIREBASE] App inicializado com sucesso');
    auth = firebase.auth();
    db = firebase.firestore();
    window.__FIREBASE_DISABLED__ = false;
    window.__OFFLINE_MODE__ = false;
    console.log('[FIREBASE] Modo ONLINE ativado');
    
    // Tentar configurar Firestore offline
    db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
    db.enablePersistence().catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('[FIREBASE] Firestore offline: múltiplas abas abertas');
      }
    });
  } catch (e) {
    console.error('[FIREBASE] ERRO ao inicializar Firebase:', e.message);
    console.log('[FIREBASE] Fazendo fallback para MODO OFFLINE');
    isOfflineMode = true;
    window.__FIREBASE_DISABLED__ = true;
    window.__OFFLINE_MODE__ = true;
    auth = offlineAuth;
    db = offlineDb;
  }
}

// Expor funções utilitárias offline (para uso pelo auth.js)
window.__offlineUpdateProfile = async (uid, data) => {
  if (isOfflineMode && auth === offlineAuth) {
    await offlineAuth.updateProfile(uid, data);
  }
};