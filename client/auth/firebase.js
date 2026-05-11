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
const firebaseConfig = { ...defaultFirebaseConfig, ...runtimeFirebaseConfig };

function hasPlaceholderConfig(config) {
  return !config.apiKey || config.apiKey.includes('DEFAULT_KEY') || !config.projectId;
}

console.log('[FIREBASE] Inicializando com projectId:', firebaseConfig.projectId || '(não definido)');

if (hasPlaceholderConfig(firebaseConfig)) {
  console.error('[FIREBASE] Configuração ausente. Defina as variáveis FIREBASE_* no servidor.');
  throw new Error('Firebase não configurado no servidor. Defina FIREBASE_API_KEY, FIREBASE_PROJECT_ID e demais variáveis.');
}

// Inicializar Firebase
try {
  firebase.initializeApp(firebaseConfig);
  console.log('[FIREBASE] App inicializado com sucesso');
} catch (e) {
  console.error('[FIREBASE] ERRO CRÍTICO ao inicializar Firebase:', e);
  console.error('[FIREBASE] Stack:', e.stack);
}

const auth = firebase.auth();
const db = firebase.firestore();

console.log('[FIREBASE] Auth e Firestore instanciados');

// Não configurar persistência global aqui - será feito sob demanda no login
// Não habilitar Firestore offline aqui - será feito sob demanda
