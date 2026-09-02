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

  const setupLobbyRoomControls = () => {
    if (typeof socket === 'undefined') return;

    const entryPanel = document.querySelector('.entry-panel');
    const lobbyMenu = document.querySelector('.entry-panel .lobby-menu');
    const createButton = document.getElementById('createBtn');
    if (!entryPanel || !lobbyMenu || !createButton || document.getElementById('roomVisibility')) return;

    const controls = document.createElement('div');
    controls.className = 'room-creation-controls';
    controls.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:10px;align-items:center;';
    controls.innerHTML = \`
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
    \`;
    entryPanel.appendChild(controls);

    const joinByCodeContainer = document.createElement('div');
    joinByCodeContainer.className = 'room-code-entry';
    joinByCodeContainer.style.cssText = 'display:flex;gap:10px;margin-top:10px;';
    joinByCodeContainer.innerHTML = \`
      <input id="roomCodeInput" class="lobby-input" placeholder="Código da sala" maxlength="4" autocomplete="off" style="text-transform:uppercase;flex:1;" />
      <button id="joinCodeBtn" class="lobby-button">Entrar por código</button>
    \`;
    entryPanel.appendChild(joinByCodeContainer);

    const randomMatchButton = document.createElement('button');
    randomMatchButton.id = 'randomMatchBtn';
    randomMatchButton.className = 'lobby-button lobby-button-primary';
    randomMatchButton.textContent = '🎲 Partida Aleatória';
    randomMatchButton.style.cssText = 'width:100%;margin-top:10px;';
    entryPanel.appendChild(randomMatchButton);

    const originalCreateOnClick = createButton.onclick;
    createButton.onclick = () => {
      const name = nameInput.value.trim() || 'Jogador';
      const visibility = document.getElementById('roomVisibility')?.value || 'public';
      const fillWithBots = document.getElementById('roomFillBots')?.checked !== false;

      socket.emit('createRoom', name, { visibility, fillWithBots }, (result) => {
        if (result?.error) return alert(result.error);
        currentGameCode = result.roomCode;
        if (result.isPublic === false) {
          alert(\`Sala privada criada!\\nCódigo: ${result.roomCode}\\nCompartilhe este código com quem você quiser convidar.\`);
        }
        enterWaitingRoom(result);
      });
    };

    // Se alguma integração substituir o botão depois, manter a referência do fluxo original.
    createButton.dataset.originalCreateHandler = originalCreateOnClick ? 'preserved' : 'none';

    const joinCodeButton = document.getElementById('joinCodeBtn');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const joinByCode = () => {
      const roomCode = roomCodeInput.value.trim().toUpperCase();
      const name = nameInput.value.trim() || 'Jogador';
      if (!roomCode) return alert('Digite o código da sala.');

      socket.emit('joinRoom', { roomCode, playerName: name }, (result) => {
        if (result?.error) return alert(result.error);
        currentGameCode = result.roomCode;
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
            enterWaitingRoom(createResult);
          });
          return;
        }

        currentGameCode = result.roomCode;
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

    // game.js já carregou neste ponto, então podemos adicionar os controles sem
    // modificar o código existente do cliente nem o motor da partida.
    setupLobbyRoomControls();
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