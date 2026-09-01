const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { handleSocket } = require('./socketHandler');
const adminRoutes = require('./adminRoutes');
const { admin } = require('./firebaseAdmin');
require('dotenv').config();

const app = express();
app.use(express.json());
const server = http.createServer(app);

// CORS para Socket.IO - usar URL específica em produção
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL === '*' ? true : CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

// Autenticar o Socket.IO com o ID Token do Firebase antes de aceitar a conexão.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Não autenticado'));
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    socket.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || null
    };
    next();
  } catch (error) {
    console.error('[socket-auth] Token Firebase inválido:', error.message);
    next(new Error('Não autenticado'));
  }
});

app.get('/config.js', (_req, res) => {
  const sanitize = (value) => (typeof value === 'string' ? value.trim() : value);
  const firebaseConfig = {
    apiKey: sanitize(process.env.FIREBASE_API_KEY) || '',
    authDomain: sanitize(process.env.FIREBASE_AUTH_DOMAIN) || '',
    projectId: sanitize(process.env.FIREBASE_PROJECT_ID) || '',
    storageBucket: sanitize(process.env.FIREBASE_STORAGE_BUCKET) || '',
    messagingSenderId: sanitize(process.env.FIREBASE_MESSAGING_SENDER_ID) || '',
    appId: sanitize(process.env.FIREBASE_APP_ID) || ''
  };

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.type('application/javascript');
  res.send(`window.__TRUCOMANIA_CONFIG__ = ${JSON.stringify({ firebaseConfig })};`);
});

app.use('/admin', adminRoutes);

// Servir arquivos do front-end
app.use(express.static(path.join(__dirname, '..', 'client')));

handleSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TrucoMania rodando na porta ${PORT}`);
});
