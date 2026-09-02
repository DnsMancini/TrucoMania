const firebaseConfig = window.__TRUCOMANIA_CONFIG__?.firebaseConfig || {};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const state = { users: [] };

async function authHeader() {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Faça login com conta admin.');
  const token = await user.getIdToken(true);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api(path, options = {}) {
  const headers = await authHeader();
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error((await response.json()).error || 'Erro na API');
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderStats(data) {
  const stats = document.getElementById('stats');
  stats.innerHTML = [
    ['Usuários', data.totalUsers],
    ['Online', data.onlineUsers],
    ['Moedas totais', data.totalCoins],
    ['Alertas suspeitos', data.suspiciousAlerts.length]
  ].map(([k, v]) => `<div class="card"><strong>${k}</strong><div>${escapeHtml(v)}</div></div>`).join('');
}

function renderUsers(users) {
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${escapeHtml(u.uid)}</td><td>${escapeHtml(u.displayName || u.name || '-')}</td><td>${escapeHtml(u.email || '-')}</td>
      <td>${escapeHtml(u.coins || 0)}</td><td>${escapeHtml(u.gems || 0)}</td><td>${escapeHtml(u.rank || '-')}</td>
      <td>
        <button onclick="changeCoins('${escapeHtml(u.uid)}', 1)">+ moedas</button>
        <button onclick="changeCoins('${escapeHtml(u.uid)}', -1)">- moedas</button>
        <button onclick="toggleBan('${escapeHtml(u.uid)}', ${u.banned ? 'false' : 'true'})">${u.banned ? 'Desbanir' : 'Banir'}</button>
      </td>
    </tr>`).join('');
}

async function loadUsers() {
  const q = document.getElementById('search').value.trim();
  const data = await api(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  state.users = data.users;
  renderUsers(state.users);
}

window.changeCoins = async (uid, mode) => {
  const amount = Number(prompt('Quantidade de moedas:'));
  if (!amount || amount <= 0) return;
  const reason = prompt('Motivo do ajuste:') || 'Ajuste administrativo';
  const endpoint = mode === 1 ? '/admin/add-coins' : '/admin/remove-coins';
  await api(endpoint, { method: 'POST', body: JSON.stringify({ uid, amount, reason }) });
  await refreshAll();
};

window.toggleBan = async (uid, banned) => {
  const reason = prompt('Motivo do banimento/desbanimento:') || 'Moderação';
  await api('/admin/ban-user', { method: 'POST', body: JSON.stringify({ uid, banned, reason }) });
  await refreshAll();
};

async function refreshAll() {
  const [dash, tx, logs] = await Promise.all([
    api('/admin/dashboard'),
    api('/admin/transactions'),
    api('/admin/audit-logs')
  ]);

  renderStats(dash);
  await loadUsers();
  document.getElementById('transactions').textContent = JSON.stringify(tx.transactions.slice(0, 30), null, 2);
  document.getElementById('auditLogs').textContent = JSON.stringify(logs.logs.slice(0, 40), null, 2);
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    alert('Faça login para acessar o admin.');
    window.location.href = '/';
    return;
  }

  try {
    await refreshAll();
    setInterval(refreshAll, 15000);
  } catch (error) {
    console.error('[admin-ui] erro:', error);
    alert(error.message);
  }
});

document.getElementById('refreshUsers').addEventListener('click', loadUsers);
document.getElementById('search').addEventListener('input', () => loadUsers().catch(console.error));
