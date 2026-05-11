// =============================================
// TRUCOMANIA FIREBASE - CONFIGURAÇÃO SEGURA
// =============================================

// ATENÇÃO: Configure com suas credenciais REAIS do Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDEFAULT_KEY",
  authDomain: "trucomania-default.firebaseapp.com",
  projectId: "trucomania-default",
  storageBucket: "trucomania-default.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

console.log('[FIREBASE] Inicializando com projectId:', firebaseConfig.projectId);

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