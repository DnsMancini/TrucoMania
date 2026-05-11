const express = require('express');
const { admin, db } = require('./firebaseAdmin');

const router = express.Router();

const COLLECTIONS = {
  users: 'users',
  transactions: 'transactions',
  auditLogs: 'audit_logs',
  matches: 'matches'
};

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function writeAuditLog({ adminUid, action, targetUid, before, after, reason }) {
  await db.collection(COLLECTIONS.auditLogs).add({
    adminUid,
    action,
    targetUid,
    before: before || null,
    after: after || null,
    reason: reason || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function writeTransaction({ uid, type, amount, balanceBefore, balanceAfter, source = 'admin_panel' }) {
  await db.collection(COLLECTIONS.transactions).add({
    uid,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    source,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

function buildSuspiciousAlerts(transactions, matches) {
  const alerts = [];
  const txByUser = new Map();

  transactions.forEach((tx) => {
    const arr = txByUser.get(tx.uid) || [];
    arr.push(tx);
    txByUser.set(tx.uid, arr);

    if (Math.abs(parseNumber(tx.amount)) >= 50000) {
      alerts.push({ type: 'absurd_gain', uid: tx.uid, message: `Transação muito alta (${tx.amount})`, at: tx.createdAt || null });
    }
  });

  txByUser.forEach((items, uid) => {
    const rewards = items.filter((i) => i.type === 'reward').length;
    if (rewards >= 5) {
      alerts.push({ type: 'multi_reward_chain', uid, message: `Múltiplas rewards seguidas (${rewards})`, at: items[0]?.createdAt || null });
    }
  });

  const matchesByUser = new Map();
  matches.forEach((match) => {
    const uid = match.uid || match.playerUid;
    if (!uid) return;
    const count = (matchesByUser.get(uid) || 0) + 1;
    matchesByUser.set(uid, count);
  });

  matchesByUser.forEach((count, uid) => {
    if (count >= 20) {
      alerts.push({ type: 'match_spam', uid, message: `Possível spam de partidas (${count})`, at: null });
    }
  });

  return alerts;
}

async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Token ausente.' });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const userDoc = await db.collection(COLLECTIONS.users).doc(decoded.uid).get();
    const role = userDoc.exists ? userDoc.data()?.role : null;

    if (decoded.admin !== true && role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    req.adminUser = {
      uid: decoded.uid,
      email: decoded.email || null,
      role: role || (decoded.admin ? 'admin' : 'user')
    };

    next();
  } catch (error) {
    console.error('[admin] Falha na autenticação:', error.message);
    res.status(401).json({ error: 'Autenticação inválida.' });
  }
}

router.use(requireAdmin);

router.get('/', (_req, res) => {
  res.sendFile('admin.html', { root: 'client' });
});

router.get('/dashboard', async (_req, res) => {
  try {
    const [usersSnap, txSnap, matchesSnap] = await Promise.all([
      db.collection(COLLECTIONS.users).get(),
      db.collection(COLLECTIONS.transactions).orderBy('createdAt', 'desc').limit(200).get(),
      db.collection(COLLECTIONS.matches).orderBy('createdAt', 'desc').limit(200).get()
    ]);

    const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const totalCoins = users.reduce((acc, u) => acc + parseNumber(u.coins), 0);
    const onlineUsers = users.filter((u) => u.online === true).length;
    const suspiciousAlerts = buildSuspiciousAlerts(transactions, matches);

    suspiciousAlerts.slice(0, 20).forEach((alert) => {
      console.warn('[admin][alerta]', alert.type, alert.uid, alert.message);
    });

    res.json({
      totalUsers: users.length,
      onlineUsers,
      totalCoins,
      recentMatches: matches.slice(0, 20),
      recentTransactions: transactions.slice(0, 20),
      suspiciousAlerts: suspiciousAlerts.slice(0, 50)
    });
  } catch (error) {
    console.error('[admin] Erro dashboard:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const snap = await db.collection(COLLECTIONS.users).limit(500).get();
    let users = snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));

    if (q) {
      users = users.filter((user) => {
        const email = (user.email || '').toLowerCase();
        const name = (user.displayName || user.name || '').toLowerCase();
        const uid = (user.uid || '').toLowerCase();
        return email.includes(q) || name.includes(q) || uid.includes(q);
      });
    }

    res.json({ users });
  } catch (error) {
    console.error('[admin] Erro /users:', error);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

router.get('/user/:uid', async (req, res) => {
  try {
    const doc = await db.collection(COLLECTIONS.users).doc(req.params.uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: { uid: doc.id, ...doc.data() } });
  } catch (error) {
    console.error('[admin] Erro /user/:uid:', error);
    res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
});

async function adjustBalance(req, res, signal) {
  const { uid, amount, reason } = req.body;
  const delta = parseNumber(amount);
  if (!uid || delta <= 0) return res.status(400).json({ error: 'uid/amount inválidos.' });

  try {
    const ref = db.collection(COLLECTIONS.users).doc(uid);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('user_not_found');
      const user = snap.data();
      const before = parseNumber(user.coins);
      const after = signal === 1 ? before + delta : Math.max(0, before - delta);

      tx.update(ref, { coins: after, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { before, after, user };
    });

    await writeTransaction({
      uid,
      type: signal === 1 ? 'admin_adjust_add' : 'admin_adjust_remove',
      amount: signal === 1 ? delta : -delta,
      balanceBefore: result.before,
      balanceAfter: result.after
    });

    await writeAuditLog({
      adminUid: req.adminUser.uid,
      action: signal === 1 ? 'add_coins' : 'remove_coins',
      targetUid: uid,
      before: { coins: result.before },
      after: { coins: result.after },
      reason
    });

    res.json({ ok: true, before: result.before, after: result.after });
  } catch (error) {
    if (error.message === 'user_not_found') return res.status(404).json({ error: 'Usuário não encontrado.' });
    console.error('[admin] Erro ajuste saldo:', error);
    res.status(500).json({ error: 'Falha ao ajustar saldo.' });
  }
}

router.post('/add-coins', (req, res) => adjustBalance(req, res, 1));
router.post('/remove-coins', (req, res) => adjustBalance(req, res, -1));

router.post('/ban-user', async (req, res) => {
  const { uid, banned, reason } = req.body;
  if (!uid || typeof banned !== 'boolean') return res.status(400).json({ error: 'uid/banned inválidos.' });
  try {
    const ref = db.collection(COLLECTIONS.users).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const before = snap.data();

    await ref.update({ banned, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await writeAuditLog({
      adminUid: req.adminUser.uid,
      action: banned ? 'ban_user' : 'unban_user',
      targetUid: uid,
      before: { banned: before.banned || false },
      after: { banned },
      reason
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('[admin] Erro ban-user:', error);
    res.status(500).json({ error: 'Falha ao atualizar banimento.' });
  }
});

router.get('/transactions', async (_req, res) => {
  try {
    const snap = await db.collection(COLLECTIONS.transactions).orderBy('createdAt', 'desc').limit(200).get();
    res.json({ transactions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (error) {
    console.error('[admin] Erro transactions:', error);
    res.status(500).json({ error: 'Erro ao listar transações.' });
  }
});

router.get('/audit-logs', async (_req, res) => {
  try {
    const snap = await db.collection(COLLECTIONS.auditLogs).orderBy('createdAt', 'desc').limit(300).get();
    res.json({ logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (error) {
    console.error('[admin] Erro audit-logs:', error);
    res.status(500).json({ error: 'Erro ao listar logs.' });
  }
});

module.exports = router;
