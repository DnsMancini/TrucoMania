const { db } = require('./firebaseAdmin');

const friendOnline = new Map();

function normalizeNickname(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 15);
}

function pairId(a, b) {
  return [a, b].sort().join('_');
}

function publicPlayer(uid, data = {}) {
  return {
    uid,
    nickname: data.nickname || 'Jogador',
    avatar: data.avatar || (data.nickname ? data.nickname.charAt(0).toUpperCase() : 'J'),
    avatarUrl: data.avatarUrl || null
  };
}

function markOnline(uid) {
  if (!uid) return;
  friendOnline.set(uid, (friendOnline.get(uid) || 0) + 1);
}

function markOffline(uid) {
  if (!uid) return;
  const count = (friendOnline.get(uid) || 1) - 1;
  if (count <= 0) friendOnline.delete(uid);
  else friendOnline.set(uid, count);
}

function isOnline(uid) {
  return friendOnline.has(uid);
}

async function getPlayer(uid) {
  const snap = await db.collection('players').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

async function getFriendships(uid) {
  const [aSnap, bSnap] = await Promise.all([
    db.collection('friendships').where('uidA', '==', uid).get(),
    db.collection('friendships').where('uidB', '==', uid).get()
  ]);
  const docs = new Map();
  aSnap.forEach(doc => docs.set(doc.id, doc));
  bSnap.forEach(doc => docs.set(doc.id, doc));
  return Array.from(docs.values());
}

async function emitFriendList(socket) {
  const uid = socket.user?.uid;
  if (!uid) return;
  const docs = await getFriendships(uid);
  const friends = [];
  const requests = [];

  for (const doc of docs) {
    const data = doc.data();
    const otherUid = data.uidA === uid ? data.uidB : data.uidA;
    const other = await getPlayer(otherUid);
    if (!other) continue;

    if (data.status === 'accepted') {
      friends.push({
        ...publicPlayer(otherUid, other),
        online: isOnline(otherUid),
        status: isOnline(otherUid) ? 'online' : 'offline'
      });
    } else if (data.status === 'pending' && data.requesterUid !== uid) {
      requests.push({
        requestId: doc.id,
        ...publicPlayer(otherUid, other),
        createdAt: data.createdAt || null
      });
    }
  }

  socket.emit('friendsUpdate', { friends, requests });
}

function notifyUser(io, uid, event, payload) {
  io.sockets.sockets.forEach(s => {
    if (s.user?.uid === uid) s.emit(event, payload);
  });
}

function attachSocialHandlers(io) {
  io.on('connection', socket => {
    socket.on('authenticated', async data => {
      if (!socket.user?.uid) return;
      markOnline(socket.user.uid);
      try { await emitFriendList(socket); } catch (error) { console.error('[social] friends list:', error.message); }
    });

    socket.on('getFriends', async (callback) => {
      if (!socket.user?.uid) return callback?.({ error: 'Não autenticado' });
      try {
        await emitFriendList(socket);
        callback?.({ ok: true });
      } catch (error) {
        console.error('[social] getFriends:', error.message);
        callback?.({ error: 'Não foi possível carregar os amigos.' });
      }
    });

    socket.on('searchPlayers', async (payload, callback) => {
      if (!socket.user?.uid) return callback?.({ error: 'Não autenticado' });
      const nickname = normalizeNickname(payload?.nickname);
      if (nickname.length < 3) return callback?.({ error: 'Digite pelo menos 3 caracteres.' });

      try {
        const snap = await db.collection('players').where('nickname', '==', nickname).limit(10).get();
        const players = [];
        snap.forEach(doc => {
          if (doc.id !== socket.user.uid) players.push({
            ...publicPlayer(doc.id, doc.data()),
            online: isOnline(doc.id)
          });
        });
        callback?.({ ok: true, players });
      } catch (error) {
        console.error('[social] searchPlayers:', error.message);
        callback?.({ error: 'Não foi possível pesquisar jogadores.' });
      }
    });

    socket.on('addFriend', async (payload, callback) => {
      const uid = socket.user?.uid;
      if (!uid) return callback?.({ error: 'Não autenticado' });
      const targetUid = typeof payload?.uid === 'string' ? payload.uid : '';
      if (!targetUid || targetUid === uid) return callback?.({ error: 'Jogador inválido.' });

      try {
        const target = await getPlayer(targetUid);
        if (!target) return callback?.({ error: 'Jogador não encontrado.' });
        const id = pairId(uid, targetUid);
        const ref = db.collection('friendships').doc(id);
        const existing = await ref.get();
        if (existing.exists) {
          const current = existing.data();
          if (current.status === 'accepted') return callback?.({ error: 'Vocês já são amigos.' });
          if (current.status === 'pending') return callback?.({ error: current.requesterUid === uid ? 'Solicitação já enviada.' : 'Este jogador já enviou uma solicitação para você.' });
        }

        await ref.set({
          uidA: uid,
          uidB: targetUid,
          requesterUid: uid,
          status: 'pending',
          createdAt: new Date().toISOString()
        });

        notifyUser(io, targetUid, 'friendRequest', {
          requestId: id,
          player: publicPlayer(uid, await getPlayer(uid))
        });
        await emitFriendList(socket);
        callback?.({ ok: true });
      } catch (error) {
        console.error('[social] addFriend:', error.message);
        callback?.({ error: 'Não foi possível enviar a solicitação.' });
      }
    });

    socket.on('respondFriend', async (payload, callback) => {
      const uid = socket.user?.uid;
      if (!uid) return callback?.({ error: 'Não autenticado' });
      const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
      const accept = payload?.accept === true;
      if (!requestId) return callback?.({ error: 'Solicitação inválida.' });

      try {
        const ref = db.collection('friendships').doc(requestId);
        const snap = await ref.get();
        if (!snap.exists) return callback?.({ error: 'Solicitação não encontrada.' });
        const data = snap.data();
        if (data.status !== 'pending' || (data.uidA !== uid && data.uidB !== uid) || data.requesterUid === uid) {
          return callback?.({ error: 'Solicitação inválida ou expirada.' });
        }

        if (accept) {
          await ref.update({ status: 'accepted', acceptedAt: new Date().toISOString() });
          notifyUser(io, data.requesterUid, 'friendAccepted', { uid });
        } else {
          await ref.delete();
        }

        await emitFriendList(socket);
        callback?.({ ok: true });
      } catch (error) {
        console.error('[social] respondFriend:', error.message);
        callback?.({ error: 'Não foi possível responder à solicitação.' });
      }
    });

    socket.on('removeFriend', async (payload, callback) => {
      const uid = socket.user?.uid;
      const targetUid = typeof payload?.uid === 'string' ? payload.uid : '';
      if (!uid) return callback?.({ error: 'Não autenticado' });
      if (!targetUid || targetUid === uid) return callback?.({ error: 'Amigo inválido.' });
      try {
        const ref = db.collection('friendships').doc(pairId(uid, targetUid));
        const snap = await ref.get();
        if (snap.exists) {
          const data = snap.data();
          if (data.uidA !== uid && data.uidB !== uid) return callback?.({ error: 'Acesso negado.' });
          await ref.delete();
        }
        await emitFriendList(socket);
        notifyUser(io, targetUid, 'friendRemoved', { uid });
        callback?.({ ok: true });
      } catch (error) {
        console.error('[social] removeFriend:', error.message);
        callback?.({ error: 'Não foi possível remover o amigo.' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.user?.uid) markOffline(socket.user.uid);
    });
  });
}

module.exports = { attachSocialHandlers };
