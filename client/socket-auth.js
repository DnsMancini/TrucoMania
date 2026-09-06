// TrucoMania - Autenticação do Socket.IO com Firebase Auth
// Mantém o servidor protegido: o socket recebe o Firebase ID token antes
// das operações protegidas do lobby/jogo.
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

        socket.emit('authenticate', token, (response) => {
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

  function installAuthListener() {
    if (authListenerRegistered || typeof firebase === 'undefined' || !firebase.auth) return;
    authListenerRegistered = true;

    firebase.auth().onIdTokenChanged(async (user) => {
      if (!currentSocket || !currentSocket.connected) return;
      if (!user) {
        tokenVersion++;
        return;
      }
      await authenticateSocket(currentSocket, 'token atualizado');
    });
  }

  // O game.js continua usando const socket = io(...), mas recebe um socket
  // automaticamente autenticado sem precisar alterar a lógica do lobby.
  window.io = function (...args) {
    const socket = originalIo(...args);
    currentSocket = socket;

    socket.__trucoManiaAuthenticated = false;

    socket.on('connect', async () => {
      socket.__trucoManiaAuthenticated = await authenticateSocket(socket, 'conexão');
      if (socket.__trucoManiaAuthenticated) {
        // Depois de autenticar, atualiza a lista de salas. O game.js também
        // pode emitir getRooms no connect; o servidor permite essa operação
        // mesmo antes da autenticação.
        socket.emit('getRooms');
      }
    });

    socket.on('authenticated', () => {
      socket.__trucoManiaAuthenticated = true;
    });

    socket.on('authError', (data) => {
      socket.__trucoManiaAuthenticated = false;
      console.error('[SOCKET-AUTH] Servidor recusou a sessão:', data?.message || 'Sessão inválida');
    });

    installAuthListener();
    return socket;
  };

  installAuthListener();
  console.info('[SOCKET-AUTH] Ponte Firebase → Socket.IO instalada.');
})();
