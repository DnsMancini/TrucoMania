// Transições Cinematográficas Premium para TrucoMania Auth
class AuthTransitions {
  constructor() {
    this.currentScreen = null;
    this.transitioning = false;
  }

  // Transição principal entre telas
  async switchScreen(fromElement, toElement, direction = 'forward', onShow = null) {
    if (this.transitioning) return;
    this.transitioning = true;

    // Se não há tela atual, apenas mostrar a nova
    if (!fromElement) {
      toElement.style.display = 'flex';
      toElement.style.opacity = '0';
      await this.animateIn(toElement);
      this.currentScreen = toElement;
      this.transitioning = false;
      if (onShow) onShow();
      return;
    }

    // Fade out da tela atual
    await this.animateOut(fromElement);
    fromElement.style.display = 'none';

    // Mostrar nova tela
    toElement.style.display = 'flex';
    toElement.style.opacity = '0';
    toElement.style.transform = `translateY(${direction === 'forward' ? '20px' : '-20px'}) scale(0.98)`;
    
    await this.animateIn(toElement);
    this.currentScreen = toElement;
    this.transitioning = false;
    if (onShow) onShow();
  }

  // Animação de entrada cinematográfica
  async animateIn(element) {
    return new Promise(resolve => {
      // Reset
      element.style.transition = 'none';
      element.style.opacity = '0';
      element.style.transform = 'translateY(20px) scale(0.98)';
      
      // Forçar reflow
      void element.offsetHeight;

      // Aplicar transição
      element.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      element.style.opacity = '1';
      element.style.transform = 'translateY(0) scale(1)';

      // Animar elementos filhos em cascata
      const children = element.querySelectorAll('.animate-child');
      children.forEach((child, index) => {
        child.style.opacity = '0';
        child.style.transform = 'translateY(15px)';
        child.style.transition = `all 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${0.1 + index * 0.08}s`;
        
        setTimeout(() => {
          child.style.opacity = '1';
          child.style.transform = 'translateY(0)';
        }, 50);
      });

      setTimeout(resolve, 700);
    });
  }

  // Animação de saída
  async animateOut(element) {
    return new Promise(resolve => {
      element.style.transition = 'all 0.4s cubic-bezier(0.55, 0, 1, 0.45)';
      element.style.opacity = '0';
      element.style.transform = 'translateY(-15px) scale(0.97)';
      element.style.filter = 'blur(2px)';
      setTimeout(resolve, 450);
    });
  }

  // Transição splash → auth
  async splashToAuth(splashElement, authElement) {
    if (this.transitioning) return;
    this.transitioning = true;

    // Fade do splash com blur
    splashElement.style.transition = 'all 0.8s cubic-bezier(0.55, 0, 1, 0.45)';
    splashElement.style.opacity = '0';
    splashElement.style.transform = 'scale(1.1)';
    splashElement.style.filter = 'blur(4px)';

    // Mostrar auth atrás
    authElement.style.display = 'flex';
    authElement.style.opacity = '0';
    authElement.style.transform = 'scale(0.95)';

    setTimeout(() => {
      splashElement.style.display = 'none';
      authElement.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      authElement.style.opacity = '1';
      authElement.style.transform = 'scale(1)';
      this.currentScreen = authElement;
      this.transitioning = false;
    }, 500);
  }

  // Transição auth → lobby (login completo)
  async authToLobby(authElement, lobbyElement) {
    if (this.transitioning) return;
    this.transitioning = true;

    // Efeito de "portal" - zoom out dramático
    authElement.style.transition = 'all 0.5s cubic-bezier(0.55, 0, 1, 0.45)';
    authElement.style.opacity = '0';
    authElement.style.transform = 'scale(1.05)';
    authElement.style.filter = 'blur(3px) brightness(1.5)';

    lobbyElement.style.display = 'block';
    lobbyElement.style.opacity = '0';
    lobbyElement.style.transform = 'scale(0.92)';

    setTimeout(() => {
      authElement.style.display = 'none';
      authElement.style.filter = 'none';
      
      lobbyElement.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      lobbyElement.style.opacity = '1';
      lobbyElement.style.transform = 'scale(1)';
      
      // Disparar animações do lobby
      document.dispatchEvent(new CustomEvent('lobby-ready'));
      
      this.currentScreen = lobbyElement;
      this.transitioning = false;
    }, 400);
  }

  // Efeito de loading para splash
  static createLoadingBar(container) {
    const bar = document.createElement('div');
    bar.className = 'splash-loading-bar';
    bar.innerHTML = '<div class="splash-loading-progress"></div>';
    container.appendChild(bar);
    return bar;
  }

  // Animar progresso do loading
  static animateLoading(barElement, duration = 2500) {
    return new Promise(resolve => {
      const progress = barElement.querySelector('.splash-loading-progress');
      if (!progress) { resolve(); return; }

      progress.style.transition = `width ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      progress.style.width = '100%';

      setTimeout(resolve, duration + 200);
    });
  }

  // Efeito de partículas de transição
  static createTransitionParticles(x, y) {
    const container = document.createElement('div');
    container.className = 'transition-particles';
    container.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      pointer-events: none;
      z-index: 9999;
    `;

    for (let i = 0; i < 12; i++) {
      const particle = document.createElement('div');
      const angle = (i / 12) * Math.PI * 2;
      const velocity = 80 + Math.random() * 120;
      const hue = Math.random() > 0.5 ? 120 : 45;
      
      particle.style.cssText = `
        position: absolute;
        width: ${4 + Math.random() * 6}px;
        height: ${4 + Math.random() * 6}px;
        background: hsla(${hue}, 80%, 60%, 0.8);
        border-radius: 50%;
        box-shadow: 0 0 10px hsla(${hue}, 80%, 60%, 0.5);
        transform: translate(-50%, -50%);
        animation: particleBurst 0.8s ease-out forwards;
        --tx: ${Math.cos(angle) * velocity}px;
        --ty: ${Math.sin(angle) * velocity}px;
      `;
      
      container.appendChild(particle);
    }

    document.body.appendChild(container);
    setTimeout(() => container.remove(), 900);
  }
}

// Keyframe animation para partículas
const style = document.createElement('style');
style.textContent = `
  @keyframes particleBurst {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Exportar instância global
window.authTransitions = new AuthTransitions();