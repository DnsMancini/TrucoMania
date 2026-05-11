// =============================================
// TRUCOMANIA FIREBASE - MODO ONLINE (100% Firebase)
// =============================================

const firebaseConfig = {
  apiKey: "AIzaSyAbuVNRLpOHoYEr8m8QHK2SqJ4oMn-7GAQ",
  authDomain: "trucomania-fe149.firebaseapp.com",
  projectId: "trucomania-fe149",
  storageBucket: "trucomania-fe149.firebasestorage.app",
  messagingSenderId: "838967045086",
  appId: "1:838967045086:web:bdb65c50d95c48b804cb4f",
  measurementId: "G-FZQS567CEF"
};

console.log('[FIREBASE] Verificando configuração...');

// =============================================
// INICIALIZAÇÃO FIREBASE
// =============================================

let auth;
let db;
let storage;

try {
  firebase.initializeApp(firebaseConfig);
  console.log('[FIREBASE] App inicializado com sucesso');
  
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  
  console.log('[FIREBASE] Modo ONLINE ativo');
} catch (e) {
  console.error('[FIREBASE] ERRO FATAL ao inicializar Firebase:', e.message);
  throw new Error('Falha na inicialização do Firebase. Verifique as credenciais.');
}

// Atribuir às variáveis globais
window.auth = auth;
window.db = db;
window.storage = storage;
