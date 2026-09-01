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
  let socketAuthenticated = false;
  let authenticationInProgress = null;

  const authenticateSocket = async (user) => {
    if (!user || typeof socket === 'undefined') return false;

    if (socketAuthenticated) return true;
    if (authenticationInProgress) return authenticationInProgress;

    authenticationInProgress = (async () => {
      try {
        const token = await user.getIdToken();

        if (!socket.connected) {
          socket.connect();
          await new Promise((resolve) => {
            if (socket.connected) return resolve();
            socket.once('connect', resolve);
          });
        }

        return await new Promise((resolve) => {
          socket.emit('authenticate', token, (result) => {
            if (result && result.ok) {
              socketAuthenticated = true;
              console.log('[socket-auth] Socket autenticado com Firebase.');
              resolve(true);
              return;
            }

            socketAuthenticated = false;
            console.error('[socket-auth] Falha ao autenticar:', result?.error || 'Erro desconhecido');
            resolve(false);
          });
        });
      } catch (error) {
        socketAuthenticated = false;
        console.error('[socket-auth] Não foi possível autenticar:', error.message);
        return false;
      } finally {
        authenticationInProgress = null;
      }
    })();

    return authenticationInProgress;
  };

  const setup = () => {
    if (typeof auth === 'undefined' || typeof socket === 'undefined') return;

    const originalEmit = socket.emit.bind(socket);
    const protectedEvents = new Set(['createRoom', 'joinRoom']);

    socket.emit = (...args) => {
      const eventName = args[0];

      if (!protectedEvents.has(eventName)) {
        return originalEmit(...args);
      }

      const user = auth.currentUser;
      if (!user) {
        const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
        if (callback) callback({ error: 'Não autenticado' });
        return socket;
      }

      const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;

      authenticateSocket(user).then((authenticated) => {
        if (!authenticated) {
          if (callback) callback({ error: 'Não autenticado' });
          return;
        }

        if (callback) args.push(callback);
        originalEmit(...args);
      });

      return socket;
    };

    socket.on('authenticated', () => {
      socketAuthenticated = true;
    });

    socket.on('authError', () => {
      socketAuthenticated = false;
    });

    socket.on('disconnect', () => {
      socketAuthenticated = false;
    });

    socket.on('connect', () => {
      socketAuthenticated = false;
      if (auth.currentUser) authenticateSocket(auth.currentUser);
    });

    auth.onAuthStateChanged((user) => {
      if (user) {
        authenticateSocket(user);
      } else {
        socketAuthenticated = false;
        if (socket.connected) socket.disconnect();
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
