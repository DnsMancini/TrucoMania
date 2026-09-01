const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const { handleSocket } = require('./socketHandler');
const adminRoutes = require('./adminRoutes');
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

// A autenticação do Firebase acontece no navegador. O script abaixo conecta
// a sessão Firebase ao socket já criado pelo game.js, sem alterar o fluxo visual.
app.get('/', (_req, res) => {
  const indexPath = path.join(__dirname, '..', 'client', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  const socketAuthScript = `
<script>
(() => {
  const authenticateSocket = async (user) => {
    if (!user || typeof socket === 'undefined') return;
    try {
      const token = await user.getIdToken();
      const sendAuth = () => {
        socket.emit('authenticate', token, (result) => {
          if (result && result.error) {
            console.error('[socket-auth] Falha ao autenticar:', result.error);
          }
        });
      };
      if (socket.connected) sendAuth();
      else socket.once('connect', sendAuth);
      if (!socket.connected) socket.connect();
    } catch (error) {
      console.error('[socket-auth] Não foi possível obter token Firebase:', error.message);
    }
  };

  const setup = () => {
    if (typeof auth === 'undefined' || typeof socket === 'undefined') return;

    socket.on('connect', () => {
      if (auth.currentUser) authenticateSocket(auth.currentUser);
    });

    auth.onAuthStateChanged((user) => {
      if (user) {
        authenticateSocket(user);
      } else if (socket.connected) {
        socket.disconnect();
      }
    });
  };

  setup();
})();
</script>`;

  html = html.replace('</body>', `${socketAuthScript}\n</body>`);
  res.type('html').send(html);
});

// Servir arquivos do front-end
app.use(express.static(path.join(__dirname, '..', 'client')));

handleSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TrucoMania rodando na porta ${PORT}`);
});
