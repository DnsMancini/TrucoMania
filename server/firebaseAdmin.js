const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let initialized = false;

function parseServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('[admin] FIREBASE_SERVICE_ACCOUNT_JSON inválido:', error.message);
    return null;
  }
}

function parseServiceAccountFromFile() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '/etc/secrets/firebase-service-account.json';

  const resolvedPath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.join(__dirname, '..', serviceAccountPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`[admin] Arquivo de service account não encontrado: ${resolvedPath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    console.error('[admin] Não foi possível ler service account do arquivo:', error.message);
    return null;
  }
}

function initFirebaseAdmin() {
  if (initialized) return;

  const credentials = parseServiceAccountFromEnv() || parseServiceAccountFromFile();
  const options = {};

  if (credentials) {
    options.credential = admin.credential.cert(credentials);
  } else {
    options.credential = admin.credential.applicationDefault();
  }

  if (process.env.FIREBASE_PROJECT_ID) {
    options.projectId = process.env.FIREBASE_PROJECT_ID;
  }

  admin.initializeApp(options);
  initialized = true;
  console.log('[admin] Firebase Admin inicializado.');
}

initFirebaseAdmin();

const db = admin.firestore();

module.exports = {
  admin,
  db
};
