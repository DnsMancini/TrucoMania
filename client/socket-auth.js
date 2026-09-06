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

    if (socket.__trucoAuthPromise) return socket.__trucoAuthPromise;

    socket.__trucoAuthPromise = (async () => {
      try {
        const token = await user.getIdToken();
        if (!socket.connected) return false;

        return await new Promise((resolve) => {
          let settled = false;
          const finish = (ok) => {
            if (settled) return;
            settled = true;
            resolve(ok);
          };

          socket.__trucoOriginalEmit('authenticate', token, (response) => {
            if (response && response.ok) {
              socket.__trucoAuthUid = user.uid;
              console.info('[SOCKET-AUTH] Socket autenticado:', reason || 'ok');
              finish(true);
              return;
            }
            console.error('[SOCKET-AUTH] Falha na autenticação:', response?.error || 'resposta inválida');
            finish(false);
          });

          setTimeout(() => finish(false), 10000);
        });
      } catch (error) {
        console.error('[SOCKET-AUTH] Erro ao obter/validar token:', error.message);
        return false;
      } finally {
        socket.__trucoAuthPromise = null;
      }
    })();

    return socket.__trucoAuthPromise;
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
      const socket = currentSocket;
      if (!socket) return;

      if (!user) {
        socket.__trucoManiaAuthenticated = false;
        socket.__trucoAuthUid = null;
        return;
      }

      if (socket.connected && socket.__trucoManiaAuthenticated && socket.__trucoAuthUid === user.uid) {
        socket.__trucoManiaAuthenticated = false;
        const ok = await authenticateSocket(socket, 'renovação do token');
        socket.__trucoManiaAuthenticated = ok;
        if (ok) flushQueue(socket, true);
      }
    });
  }

  function loadSocialModule() {
    if (document.getElementById('trucomania-social-script')) return;
    const script = document.createElement('script');
    script.id = 'trucomania-social-script';
    script.src = '/social.js?v=1';
    script.async = true;
    script.onload = () => console.info('[SOCIAL] Módulo de amigos carregado.');
    script.onerror = () => console.error('[SOCIAL] Não foi possível carregar o módulo de amigos.');
    document.body.appendChild(script);
  }

  window.io = function (...args) {
    const socket = originalIo(...args);
    currentSocket = socket;

    socket.__trucoManiaAuthenticated = false;
    socket.__trucoAuthUid = null;
    socket.__trucoAuthQueue = [];
    socket.__trucoAuthPromise = null;
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
  window.addEventListener('load', loadSocialModule, { once: true });
  console.info('[SOCKET-AUTH] Ponte Firebase → Socket.IO instalada.');
})();
