// Efeitos Visuais Premium para TrucoMania Auth
class UIEffects {
  constructor() {
    this.initInputEffects();
    this.initButtonEffects();
    this.initValidationEffects();
  }

  initInputEffects() {
    document.querySelectorAll('.auth-input').forEach(input => {
      const wrapper = input.closest('.input-wrapper') || input;
      const glow = document.createElement('div');
      glow.className = 'input-glow';
      wrapper.style.position = 'relative';
      wrapper.appendChild(glow);
      input.addEventListener('focus', () => { wrapper.classList.add('input-focused'); this.animateGlow(glow, true); });
      input.addEventListener('blur', () => { wrapper.classList.remove('input-focused'); this.animateGlow(glow, false); });
      input.addEventListener('input', () => { this.shakeIfInvalid(input); });
    });
  }

  animateGlow(el, active) {
    if (active) { el.style.opacity = '1'; el.style.transform = 'scale(1.02)'; }
    else { el.style.opacity = '0'; el.style.transform = 'scale(1)'; }
  }

  initButtonEffects() {
    document.querySelectorAll('.auth-btn, .auth-btn-secondary').forEach(btn => {
      const sweep = document.createElement('div');
      sweep.className = 'btn-sweep';
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(sweep);
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        btn.style.setProperty('--mouse-x', x + '%');
        btn.style.setProperty('--mouse-y', y + '%');
        sweep.style.opacity = '1';
      });
      btn.addEventListener('mouseleave', () => { sweep.style.opacity = '0'; });
      btn.addEventListener('click', (e) => { this.createRipple(btn, e); });
    });
  }

  createRipple(container, event) {
    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    const rect = container.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = (event.clientX || event.touches?.[0]?.clientX || rect.left + rect.width/2) - rect.left - size/2;
    const y = (event.clientY || event.touches?.[0]?.clientY || rect.top + rect.height/2) - rect.top - size/2;
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    container.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  initValidationEffects() {
    document.querySelectorAll('[data-validate]').forEach(input => {
      const field = input.closest('.auth-field');
      const feedback = field?.querySelector('.field-feedback');
      input.addEventListener('input', () => {
        const valid = input.checkValidity();
        field?.classList.toggle('field-valid', valid);
        field?.classList.toggle('field-invalid', !valid && input.value.length > 0);
        if (feedback) {
          feedback.textContent = valid ? '✓' : input.validationMessage || 'Campo inválido';
          feedback.className = 'field-feedback ' + (valid ? 'valid' : 'invalid');
        }
      });
    });
  }

  shakeIfInvalid(input) {
    if (input.dataset.validate && !input.checkValidity() && input.value.length > 2) {
      const wrapper = input.closest('.input-wrapper');
      wrapper?.classList.add('shake');
      setTimeout(() => wrapper?.classList.remove('shake'), 500);
    }
  }

  static showLoading(btn) {
    if (!btn) return;
    btn.classList.add('btn-loading');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.dataset.originalText = originalText;
    btn.innerHTML = '<div class="loading-spinner-premium"><div class="spinner-ring"></div><span>Processando...</span></div>';
  }

  static hideLoading(btn) {
    if (!btn) return;
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
  }

  static showToast(message, type = 'success') {
    const existing = document.querySelector('.auth-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `auth-toast auth-toast-${type}`;
    toast.innerHTML = `<div class="auth-toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</div><span>${message}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('auth-toast-visible'));
    setTimeout(() => { toast.classList.remove('auth-toast-visible'); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  static updatePasswordStrength(password) {
    const meter = document.querySelector('.password-strength-meter');
    const bar = document.querySelector('.strength-bar');
    const label = document.querySelector('.strength-label');
    if (!meter || !bar) return;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const levels = [
      { label: 'Muito fraca', color: '#ff4444', width: '10%' },
      { label: 'Fraca', color: '#ff6b35', width: '25%' },
      { label: 'Razoável', color: '#ffd700', width: '45%' },
      { label: 'Boa', color: '#4caf50', width: '65%' },
      { label: 'Forte', color: '#00e676', width: '85%' },
      { label: 'Muito forte', color: '#00e676', width: '100%' }
    ];
    const level = levels[Math.min(score, 5)];
    bar.style.width = level.width;
    bar.style.background = `linear-gradient(90deg, ${level.color}, ${level.color}88)`;
    bar.style.boxShadow = `0 0 15px ${level.color}44`;
    if (label) label.textContent = level.label;
    meter.classList.add('strength-visible');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.uiEffects = new UIEffects();

  // ========== CORREÇÃO DE VEZ, MESA E DESTAQUE DA CARTA VENCEDORA ==========
  // Este código precisa rodar depois de game.js, por isso fica dentro do DOMContentLoaded.
  if (typeof socket === 'undefined') return;

  let authoritativeTurn = null;
  let turnLocked = true;
  let roundCards = [];
  let winnerHighlightTimer = null;
  let winnerOverlay = null;
  const HIGHLIGHT_MS = 2500;
  const posicoes = ['c0', 'c3', 'c2', 'c1'];

  const getRotatedIds = () => {
    if (typeof myPlayerIndex !== 'number') return [0, 1, 2, 3];
    return rotateArrayForPlayer([0, 1, 2, 3], myPlayerIndex);
  };

  const renderRoundCards = () => {
    const mesa = document.getElementById('mesaCartas');
    if (!mesa || typeof createCardHTML !== 'function') return;
    const rotatedIds = getRotatedIds();
    mesa.innerHTML = '';
    roundCards.forEach(({ player, card }) => {
      if (!card) return;
      const relPos = rotatedIds.indexOf(player);
      if (relPos < 0) return;
      const cartaDiv = document.createElement('div');
      cartaDiv.className = `cartaMesa ${posicoes[relPos]}`;
      cartaDiv.innerHTML = createCardHTML(card);
      mesa.appendChild(cartaDiv);
    });
  };

  const clearWinnerHighlight = () => {
    if (winnerHighlightTimer) {
      clearTimeout(winnerHighlightTimer);
      winnerHighlightTimer = null;
    }
    if (winnerOverlay) {
      winnerOverlay.remove();
      winnerOverlay = null;
    }
    const mesa = document.getElementById('mesaCartas');
    if (mesa) mesa.style.visibility = 'visible';
  };

  const highlightWinner = (winner) => {
    const mesa = document.getElementById('mesaCartas');
    if (!mesa || !Number.isInteger(winner) || winner < 0) return;
    const relPos = getRotatedIds().indexOf(winner);
    if (relPos < 0) return;
    const original = mesa.querySelector(`.cartaMesa.${posicoes[relPos]}`);
    if (!original) return;

    clearWinnerHighlight();
    const rect = original.getBoundingClientRect();
    winnerOverlay = original.cloneNode(true);
    winnerOverlay.classList.add('cartaVencedoraOverlay');
    winnerOverlay.style.left = `${rect.left}px`;
    winnerOverlay.style.top = `${rect.top}px`;
    winnerOverlay.style.width = `${rect.width}px`;
    winnerOverlay.style.height = `${rect.height}px`;
    document.body.appendChild(winnerOverlay);

    // As cartas da próxima rodada podem ser recebidas pelo cliente durante o destaque,
    // mas ficam invisíveis até o tempo terminar. Assim a carta vencedora continua em foco.
    mesa.style.visibility = 'hidden';
    winnerHighlightTimer = setTimeout(() => {
      winnerHighlightTimer = null;
      if (winnerOverlay) {
        winnerOverlay.remove();
        winnerOverlay = null;
      }
      mesa.style.visibility = 'visible';
    }, HIGHLIGHT_MS);
  };

  const setTurn = (player) => {
    authoritativeTurn = Number.isInteger(player) ? player : null;
    turnLocked = false;
  };

  socket.on('handStart', (data) => {
    clearWinnerHighlight();
    roundCards = [];
    authoritativeTurn = Number.isInteger(data?.currentPlayer) ? data.currentPlayer : null;
    turnLocked = false;
  });

  socket.on('gameStateRestore', (data) => {
    clearWinnerHighlight();
    roundCards = [];
    const current = Array.isArray(data?.roundCards?.[data?.currentRound]) ? data.roundCards[data.currentRound] : [];
    current.forEach((card, player) => { if (card) roundCards.push({ player, card }); });
    authoritativeTurn = Number.isInteger(data?.currentPlayer) ? data.currentPlayer : null;
    turnLocked = data?.turnStage !== 'play';
  });

  socket.on('maoDe11Started', ({ currentPlayer }) => setTurn(currentPlayer));
  socket.on('turn', ({ currentPlayer }) => setTurn(currentPlayer));

  socket.on('cardPlayed', ({ player, card }) => {
    turnLocked = true;
    if (Number.isInteger(player) && card) {
      const existing = roundCards.findIndex(item => item.player === player);
      if (existing >= 0) roundCards[existing] = { player, card };
      else roundCards.push({ player, card });
    }
  });

  socket.on('roundResult', ({ winner }) => {
    // O game.js original ainda limpa a mesa depois de 1,2s. O destaque é um clone
    // independente e permanece visível por 2,5s, sem ser apagado por esse timeout.
    highlightWinner(winner);
    roundCards = [];
  });

  socket.on('handEnd', () => {
    clearWinnerHighlight();
    turnLocked = true;
    authoritativeTurn = null;
    roundCards = [];
  });

  const mao = document.getElementById('mao');
  if (mao) {
    mao.addEventListener('click', (event) => {
      if (!gameActive || isMaoDe11Decision) return;
      if (turnLocked || authoritativeTurn !== myPlayerIndex) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  const mesa = document.getElementById('mesaCartas');
  if (mesa && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (roundCards.length > 0 && mesa.children.length === 0 && gameActive) renderRoundCards();
    });
    observer.observe(mesa, { childList: true });
  }

  const style = document.createElement('style');
  style.textContent = `
    .cartaVencedoraOverlay {
      position: fixed !important;
      z-index: 10050 !important;
      pointer-events: none !important;
      margin: 0 !important;
      transform: none !important;
      box-sizing: border-box;
      border: 2px solid #f1c40f !important;
      box-shadow: 0 0 8px 2px rgba(241,196,15,.9), 0 0 22px 8px rgba(241,196,15,.55), inset 0 0 12px rgba(241,196,15,.25) !important;
      animation: cartaVencedoraBrilho 1s ease-in-out infinite alternate;
    }
    @keyframes cartaVencedoraBrilho {
      from { filter: brightness(1.05); box-shadow: 0 0 8px 2px rgba(241,196,15,.9), 0 0 22px 8px rgba(241,196,15,.55), inset 0 0 12px rgba(241,196,15,.25) !important; }
      to { filter: brightness(1.28); box-shadow: 0 0 14px 4px rgba(255,230,80,1), 0 0 34px 12px rgba(241,196,15,.8), inset 0 0 18px rgba(241,196,15,.4) !important; }
    }
  `;
  document.head.appendChild(style);
});