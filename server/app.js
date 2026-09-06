const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const path = require('path');
const { handleSocket } = require('./socketHandler');
const adminRoutes = require('./adminRoutes');
require('dotenv').config();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));

// Security headers. CSP keeps inline legacy scripts working while restricting
// executable/resource origins to the services actually used by the game.
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://www.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.firebaseapp.com https://*.firebaseio.com https://*.googleapis.com https://securetoken.googleapis.com wss: ws:",
    "frame-src 'self' https://*.firebaseapp.com https://*.google.com",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; '));
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const server = http.createServer(app);

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

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://trucomania.onrender.com/sitemap.xml\n');
});

app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://trucomania.onrender.com/</loc></url></urlset>');
});

app.get('/', (_req, res) => {
  const indexPath = path.join(__dirname, '..', 'client', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // SEO metadata is injected server-side so the SPA keeps its existing markup
  // while crawlers receive a meaningful document head.
  html = html.replace('<title>Truco Mania</title>', '<title>TrucoMania — Jogue Truco Paulista Online</title>\n  <meta name="description" content="Jogue Truco Paulista online no TrucoMania. Crie ou entre em salas e dispute partidas multiplayer em tempo real.">\n  <meta name="robots" content="index,follow">\n  <meta property="og:type" content="website">\n  <meta property="og:title" content="TrucoMania — Jogue Truco Paulista Online">\n  <meta property="og:description" content="Jogue Truco Paulista online com partidas multiplayer em tempo real.">\n  <meta property="og:url" content="https://trucomania.onrender.com/">\n  <meta name="twitter:card" content="summary">');

  const socketAuthScript = `
<script>
(() => {
  let socketAuthenticated = false;
  let authenticationInProgress = null;
  let reconnectButton = null;
  let reconnectStateSetup = false;

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

  const hideReconnectButton = () => {
    if (reconnectButton) reconnectButton.style.display = 'none';
  };

  const showReconnectButton = () => {
    if (typeof socket === 'undefined') return;
    const entryPanel = document.querySelector('.entry-panel');
    if (!entryPanel) return;

    if (!reconnectButton) {
      reconnectButton = document.createElement('button');
      reconnectButton.id = 'reconnectGameBtn';
      reconnectButton.className = 'lobby-button';
      reconnectButton.style.cssText = 'width:100%;margin-top:10px;border:1px solid rgba(241,196,15,.45);background:rgba(241,196,15,.08);color:#f1c40f;font-weight:700;';
      reconnectButton.textContent = '↩️ Retornar à partida';
      entryPanel.appendChild(reconnectButton);

      reconnectButton.onclick = () => {
        if (!socketAuthenticated) {
          const user = typeof auth !== 'undefined' ? auth.currentUser : null;
          if (user) authenticateSocket(user);
          return;
        }

        reconnectButton.disabled = true;
        reconnectButton.textContent = '↩️ Retornando...';
        socket.emit('reconnectToGame', (result) => {
          if (result?.ok) {
            hideReconnectButton();
            return;
          }
          reconnectButton.disabled = false;
          reconnectButton.textContent = '↩️ Retornar à partida';
          alert(result?.error || 'Não foi possível retornar à partida.');
        });
      };
    }

    reconnectButton.disabled = false;
    reconnectButton.textContent = '↩️ Retornar à partida';
    reconnectButton.style.display = 'block';
  };

  const setupReconnectGameState = () => {
    if (typeof socket === 'undefined' || reconnectStateSetup) return;
    reconnectStateSetup = true;

    socket.on('authenticated', (data) => {
      if (data?.reconnectAvailable) showReconnectButton();
      else hideReconnectButton();
    });

    socket.on('gameStateRestore', () => {
      hideReconnectButton();
    });
  };

  const setupLobbyRoomControls = () => {
    if (typeof socket === 'undefined') return;

    const entryPanel = document.querySelector('.entry-panel');
    const lobbyMenu = document.querySelector('.entry-panel .lobby-menu');
    const createButton = document.getElementById('createBtn');
    if (!entryPanel || !lobbyMenu || !createButton || document.getElementById('roomVisibility')) return;

    const controls = document.createElement('div');
    controls.className = 'room-creation-controls';
    controls.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:10px;align-items:center;';
    controls.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <span>Tipo</span>
        <select id="roomVisibility" class="lobby-input" style="flex:1;min-width:0;">
          <option value="public">🌐 Pública</option>
          <option value="private">🔒 Privada</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
        <input id="roomFillBots" type="checkbox" checked />
        <span>Completar com bots</span>
      </label>
    `;
    entryPanel.appendChild(controls);

    const joinByCodeContainer = document.createElement('div');
    joinByCodeContainer.className = 'room-code-entry';
    joinByCodeContainer.style.cssText = 'display:flex;gap:10px;margin-top:10px;';
    joinByCodeContainer.innerHTML = `
      <input id="roomCodeInput" class="lobby-input" placeholder="Código da sala" maxlength="4" autocomplete="off" style="text-transform:uppercase;flex:1;" />
      <button id="joinCodeBtn" class="lobby-button">Entrar por código</button>
    `;
    entryPanel.appendChild(joinByCodeContainer);

    const randomMatchButton = document.createElement('button');
    randomMatchButton.id = 'randomMatchBtn';
    randomMatchButton.className = 'lobby-button lobby-button-primary';
    randomMatchButton.textContent = '🎲 Partida Aleatória';
    randomMatchButton.style.cssText = 'width:100%;margin-top:10px;';
    entryPanel.appendChild(randomMatchButton);

    createButton.onclick = () => {
      const name = nameInput.value.trim() || 'Jogador';
      const visibility = document.getElementById('roomVisibility')?.value || 'public';
      const fillWithBots = document.getElementById('roomFillBots')?.checked !== false;

      socket.emit('createRoom', name, { visibility, fillWithBots }, (result) => {
        if (result?.error) return alert(result.error);
        currentGameCode = result.roomCode;
        hideReconnectButton();
        if (result.isPublic === false) {
          alert('Sala privada criada!\nCódigo: ' + result.roomCode + '\nCompartilhe este código com quem você quiser convidar.');
        }
        enterWaitingRoom(result);
      });
    };

    const joinCodeButton = document.getElementById('joinCodeBtn');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const joinByCode = () => {
      const roomCode = roomCodeInput.value.trim().toUpperCase();
      const name = nameInput.value.trim() || 'Jogador';
      if (!roomCode) return alert('Digite o código da sala.');

      socket.emit('joinRoom', { roomCode, playerName: name }, (result) => {
        if (result?.error) return alert(result.error);
        currentGameCode = result.roomCode;
        hideReconnectButton();
        enterWaitingRoom(result);
      });
    };

    joinCodeButton.onclick = joinByCode;
    roomCodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') joinByCode();
    });
    roomCodeInput.addEventListener('input', () => {
      roomCodeInput.value = roomCodeInput.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
    });

    randomMatchButton.onclick = () => {
      const name = nameInput.value.trim() || 'Jogador';
      randomMatchButton.disabled = true;
      randomMatchButton.textContent = '🎲 Procurando partida...';

      socket.emit('randomMatch', name, (result) => {
        if (result?.error) {
          randomMatchButton.disabled = false;
          randomMatchButton.textContent = '🎲 Partida Aleatória';
          return alert(result.error);
        }

        if (result?.createNew) {
          socket.emit('createRoom', name, { visibility: 'public', fillWithBots: true }, (createResult) => {
            if (createResult?.error) {
              randomMatchButton.disabled = false;
              randomMatchButton.textContent = '🎲 Partida Aleatória';
              return alert(createResult.error);
            }
            currentGameCode = createResult.roomCode;
            hideReconnectButton();
            enterWaitingRoom(createResult);
          });
          return;
        }

        currentGameCode = result.roomCode;
        hideReconnectButton();
        enterWaitingRoom(result);
      });
    };
  };

  const setup = () => {
    if (typeof auth === 'undefined' || typeof socket === 'undefined') return;

    const originalEmit = socket.emit.bind(socket);
    const protectedEvents = new Set(['createRoom', 'joinRoom', 'randomMatch']);

    socket.emit = (...args) => {
      const eventName = args[0];
      if (!protectedEvents.has(eventName)) return originalEmit(...args);

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

    socket.on('authenticated', (data) => {
      socketAuthenticated = true;
      if (data?.reconnectAvailable) showReconnectButton();
      else hideReconnectButton();
    });
    socket.on('authError', () => { socketAuthenticated = false; });
    socket.on('disconnect', () => { socketAuthenticated = false; });
    socket.on('connect', () => {
      socketAuthenticated = false;
      if (auth.currentUser) authenticateSocket(auth.currentUser);
    });

    auth.onAuthStateChanged((user) => {
      if (user) {
        authenticateSocket(user);
      } else {
        socketAuthenticated = false;
        hideReconnectButton();
        if (socket.connected) socket.disconnect();
      }
    });

    setupReconnectGameState();
    setupLobbyRoomControls();
  };

  setup();
})();
</script>`;

  html = html.replace('</body>', `${socketAuthScript}\n</body>`);
  res.type('html').send(html);
});

app.use(express.static(path.join(__dirname, '..', 'client'), {
  setHeaders: (res, filePath) => {
    if (/\.(?:js|css|png|jpg|jpeg|webp|gif|svg|mp3|wav|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    }
  }
}));

handleSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TrucoMania rodando na porta ${PORT}`);
});
