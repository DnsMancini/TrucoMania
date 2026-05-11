// Configuração do Firebase - TrucoMania
// ATENÇÃO: Substitua pelos seus dados do Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDEFAULT_KEY",
  authDomain: "trucomania-default.firebaseapp.com",
  projectId: "trucomania-default",
  storageBucket: "trucomania-default.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Configurar persistência
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Firestore settings
db.settings({
  cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});
db.enablePersistence()
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistência offline falhou (múltiplas abas)');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistência offline não suportada');
    }
  });