// TrucoMania - Autenticação do Socket.IO com Firebase Auth
(function () {
  'use strict';

  if (typeof io !== 'function') {
    console.error('[SOCKET-AUTH] Socket.IO não carregou.');
    return;
  }

  const originalIo = io;
  let currentSocket = null;
  let authListenerRegistered = false;
  let tokenVersion = 0;
  const protectedEvents = new Set(['createRoom', 'joinRoom', 'randomMatch', 'reconnectToGame', 'leaveRoom', 'playCard', 'callBet', 'respondBet', 'respondMaoDe11', 'fleeHand']);

  async function authenticateSocket(socket, reason) {
    if (!socket || !socket.connected) return false;
    if (typeof firebase === 'undefined' || !firebase.auth) {
      console.warn('[SOCKET-AUTH] Firebase Auth indisponível.');
      return false;
    }

    const user = firebase.auth().currentUser;
    if (!user) {
      console.warn('[SOCKET-AUTH] Nenhum usuário Firebase autenticado.');
      return false;
    }

    try {
      const version = ++tokenVersion;
      const token = await user.getIdToken();
      if (!socket.connected || version !== tokenVersion) return false;

      return await new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        socket.__trucoOriginalEmit('authenticate', token, (response) => {
          if (response && response.ok) {
            console.info('[SOCKET-AUTH] Socket autenticado:', reason || 'ok');
            finish(true);
          } else {
            console.error('[SOCKET-AUTH] Falha na autenticação:', response?.error || 'resposta inválida');
            finish(false);
          }
        });

        setTimeout(() => finish(false), 10000);
      });
    } catch (error) {
      console.error('[SOCKET-AUTH] Erro ao obter/validar token:', error.message);
      return false;
    }
  }

  function flushQueue(socket, ok) {
    const queue = socket.__trucoAuthQueue || [];
    socket.__trucoAuthQueue = [];
    if (!queue.length) return;

    if (!ok) {
      queue.forEach(({ args }) => {
        const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
        callback?.({ error: 'Sessão não autenticada. Faça login novamente.' });
      });
      return;
    }

    queue.forEach(({ args }) => socket.__trucoOriginalEmit(...args));
  }

  function installAuthListener() {
    if (authListenerRegistered || typeof firebase === 'undefined' || !firebase.auth) return;
    authListenerRegistered = true;

    firebase.auth().onIdTokenChanged(async (user) => {
      if (!currentSocket || !currentSocket.connected) return;
      if (!user) {
        tokenVersion++;
        currentSocket.__trucoManiaAuthenticated = false;
        return;
      }
      const ok = await authenticateSocket(currentSocket, 'token atualizado');
      currentSocket.__trucoManiaAuthenticated = ok;
      if (ok) flushQueue(currentSocket, true);
    });
  }

  // O game.js continua usando const socket = io(...). Este wrapper autentica
  // automaticamente o socket e segura eventos protegidos até a autenticação.
  window.io = function (...args) {
    const socket = originalIo(...args);
    currentSocket = socket;

    socket.__trucoManiaAuthenticated = false;
    socket.__trucoAuthQueue = [];
    socket.__trucoOriginalEmit = socket.emit.bind(socket);

    socket.emit = function (eventName, ...eventArgs) {
      if (protectedEvents.has(eventName) && !socket.__trucoManiaAuthenticated) {
        socket.__trucoAuthQueue.push({ eventName, args: [eventName, ...eventArgs] });
        console.warn('[SOCKET-AUTH] Evento protegido aguardando autenticação:', eventName);
        authenticateSocket(socket, 'evento protegido').then((ok) => {
          socket.__trucoManiaAuthenticated = ok;
          if (ok) flushQueue(socket, true);
          else if (!socket.connected) flushQueue(socket, false);
        });
        return socket;
      }
      return socket.__trucoOriginalEmit(eventName, ...eventArgs);
    };

    socket.on('connect', async () => {
      socket.__trucoManiaAuthenticated = await authenticateSocket(socket, 'conexão');
      if (socket.__trucoManiaAuthenticated) {
        flushQueue(socket, true);
        socket.__trucoOriginalEmit('getRooms');
      }
    });

    socket.on('authenticated', () => {
      socket.__trucoManiaAuthenticated = true;
      flushQueue(socket, true);
    });

    socket.on('authError', (data) => {
      socket.__trucoManiaAuthenticated = false;
      console.error('[SOCKET-AUTH] Servidor recusou a sessão:', data?.message || 'Sessão inválida');
    });

    socket.on('disconnect', () => {
      socket.__trucoManiaAuthenticated = false;
    });

    installAuthListener();
    return socket;
  };

  installAuthListener();
  console.info('[SOCKET-AUTH] Ponte Firebase → Socket.IO instalada.');

  // Carrega a correção de transição somente depois que game.js já foi carregado,
  // permitindo que ela complemente o listener de "turn" sem alterar a lógica principal.
  window.addEventListener('load', () => {
    if (document.querySelector('script[data-truco-round-fix]')) return;
    const script = document.createElement('script');
    script.src = '/round-transition-fix.js?v=1';
    script.dataset.trucoRoundFix = 'true';
    document.body.appendChild(script);
  }, { once: true });
})();
