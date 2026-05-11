// =============================================
// TRUCOMANIA FIREBASE - CONFIGURAÇÃO SEGURA
// =============================================

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
  return !config.apiKey || config.apiKey.includes('DEFAULT_KEY') || !config.projectId;
}

function createDisabledAuth() {
  const notConfigured = async () => {
    const err = new Error('Firebase não configurado no servidor. Defina FIREBASE_API_KEY, FIREBASE_PROJECT_ID e demais variáveis.');
    err.code = 'auth/configuration-not-found';
    throw err;
  };

  return {
    currentUser: null,
    onAuthStateChanged: (callback) => {
      if (typeof callback === 'function') callback(null);
      return () => {};
    },
    setPersistence: notConfigured,
    signInWithEmailAndPassword: notConfigured,
    createUserWithEmailAndPassword: notConfigured,
    sendPasswordResetEmail: notConfigured,
    signOut: async () => {},
  };
}

function createDisabledDb() {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => null }),
        set: async () => {
          const err = new Error('Firestore indisponível: Firebase não configurado.');
          err.code = 'firestore/not-configured';
          throw err;
        }
      })
    })
  };
}

console.log('[FIREBASE] Inicializando com projectId:', firebaseConfig.projectId || '(não definido)');

let auth;
let db;

if (hasPlaceholderConfig(firebaseConfig)) {
  console.error('[FIREBASE] Configuração ausente. Defina as variáveis FIREBASE_* no servidor.');
  window.__FIREBASE_DISABLED__ = true;
  auth = createDisabledAuth();
  db = createDisabledDb();
} else {
  // Inicializar Firebase
  try {
    firebase.initializeApp(firebaseConfig);
    console.log('[FIREBASE] App inicializado com sucesso');
  } catch (e) {
    console.error('[FIREBASE] ERRO CRÍTICO ao inicializar Firebase:', e);
    console.error('[FIREBASE] Stack:', e.stack);
  }

  auth = firebase.auth();
  db = firebase.firestore();
  window.__FIREBASE_DISABLED__ = false;
  console.log('[FIREBASE] Auth e Firestore instanciados');
}

// Não configurar persistência global aqui - será feito sob demanda no login
// Não habilitar Firestore offline aqui - será feito sob demanda
