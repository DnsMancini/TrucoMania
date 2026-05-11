// Efeitos Visuais Premium para TrucoMania Auth
class UIEffects {
  constructor() {
    this.initInputEffects();
    this.initButtonEffects();
    this.initValidationEffects();
  }

  // Glassmorphism input com glow animado
  initInputEffects() {
    document.querySelectorAll('.auth-input').forEach(input => {
      const wrapper = input.closest('.input-wrapper') || input;
      
      // Criar elemento de glow
      const glow = document.createElement('div');
      glow.className = 'input-glow';
      wrapper.style.position = 'relative';
      wrapper.appendChild(glow);

      input.addEventListener('focus', () => {
        wrapper.classList.add('input-focused');
        this.animateGlow(glow, true);
      });

      input.addEventListener('blur', () => {
        wrapper.classList.remove('input-focused');
        this.animateGlow(glow, false);
      });

      input.addEventListener('input', () => {
        this.shakeIfInvalid(input);
      });
    });
  }

  animateGlow(el, active) {
    if (active) {
      el.style.opacity = '1';
      el.style.transform = 'scale(1.02)';
    } else {
      el.style.opacity = '0';
      el.style.transform = 'scale(1)';
    }
  }

  // Botões com efeito light sweep
  initButtonEffects() {
    document.querySelectorAll('.auth-btn, .auth-btn-secondary').forEach(btn => {
      // Criar overlay de light sweep
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

      btn.addEventListener('mouseleave', () => {
        sweep.style.opacity = '0';
      });

      // Efeito ripple ao clicar
      btn.addEventListener('click', (e) => {
        this.createRipple(btn, e);
      });
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

  // Validação visual em tempo real
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

  // Efeito de loading spinner premium
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
    if (btn.dataset.originalText) {
      btn.innerHTML = btn.dataset.originalText;
    }
  }

  // Toast notification premium
  static showToast(message, type = 'success') {
    const existing = document.querySelector('.auth-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `auth-toast auth-toast-${type}`;
    toast.innerHTML = `
      <div class="auth-toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</div>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('auth-toast-visible'));
    setTimeout(() => {
      toast.classList.remove('auth-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Password strength meter
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

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  window.uiEffects = new UIEffects();
});