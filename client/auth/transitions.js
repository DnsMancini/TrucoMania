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

// ===== MATCHMAKING / LOADING DE 15 SEGUNDOS =====
// Reaproveita o mesmo elemento usado pelo game.js, mas o move para o body
// para garantir cobertura real da viewport e impedir que a mesa apareça atrás.
(function initMatchmakingLoading() {
  const boot = () => {
    const overlay = document.getElementById('contagemRegressiva');
    const number = document.getElementById('contagemNumero');
    if (!overlay || !number || !document.body) return;

    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }

    const shell = document.createElement('div');
    shell.className = 'matchmaking-loading-shell';
    shell.innerHTML = `
      <div class="matchmaking-loading-logo">🃏</div>
      <div class="matchmaking-loading-kicker">TRUCO MANIA</div>
      <div class="matchmaking-loading-title">Preparando a partida</div>
      <div class="matchmaking-loading-subtitle">Aguardando jogadores...</div>
      <div class="matchmaking-loading-ring">
        <div class="matchmaking-loading-ring-glow"></div>
        <div class="matchmaking-loading-number"></div>
        <div class="matchmaking-loading-label">SEGUNDOS</div>
      </div>
      <div class="matchmaking-loading-progress"><span></span></div>
      <div class="matchmaking-loading-status"><i></i><span>Conectando jogadores e preparando a mesa</span></div>
    `;

    const numberDisplay = shell.querySelector('.matchmaking-loading-number');
    const progress = shell.querySelector('.matchmaking-loading-progress > span');

    // Preserva o mesmo #contagemNumero que o game.js atualiza.
    numberDisplay.appendChild(number);
    overlay.replaceChildren(shell);

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      top: '0',
      right: '0',
      bottom: '0',
      left: '0',
      width: '100vw',
      height: '100dvh',
      minWidth: '100vw',
      minHeight: '100vh',
      margin: '0',
      padding: '0',
      boxSizing: 'border-box',
      display: 'none',
      placeItems: 'center',
      overflow: 'hidden',
      background: '#050608',
      color: '#fff',
      border: '0',
      borderRadius: '0',
      transform: 'none',
      filter: 'none',
      opacity: '1',
      zIndex: '2147483647',
      fontFamily: 'inherit',
      isolation: 'isolate'
    });

    const styleId = 'matchmaking-loading-styles';
    if (!document.getElementById(styleId)) {
      const loadingStyle = document.createElement('style');
      loadingStyle.id = styleId;
      loadingStyle.textContent = `
        #contagemRegressiva.matchmaking-active {
          display: grid !important;
        }
        #contagemRegressiva.matchmaking-active::before,
        #contagemRegressiva.matchmaking-active::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        #contagemRegressiva.matchmaking-active::before {
          background:
            radial-gradient(circle at 50% 42%, rgba(196, 155, 48, 0.12), transparent 38%),
            linear-gradient(180deg, #090b10 0%, #050608 55%, #020304 100%);
        }
        #contagemRegressiva.matchmaking-active::after {
          background-image:
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent);
        }
        #contagemRegressiva .matchmaking-loading-shell {
          position: relative;
          z-index: 2;
          width: min(460px, calc(100vw - 36px));
          box-sizing: border-box;
          padding: 34px 30px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          border: 1px solid rgba(219, 180, 75, 0.28);
          border-radius: 24px;
          background: linear-gradient(145deg, rgba(17,20,27,0.98), rgba(7,9,13,0.99));
          box-shadow: 0 28px 90px rgba(0,0,0,0.72), 0 0 55px rgba(219,180,75,0.06), inset 0 1px 0 rgba(255,255,255,0.04);
          backdrop-filter: none;
        }
        #contagemRegressiva .matchmaking-loading-logo {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          margin-bottom: 12px;
          border-radius: 18px;
          background: linear-gradient(145deg, rgba(219,180,75,0.18), rgba(219,180,75,0.04));
          border: 1px solid rgba(219,180,75,0.22);
          box-shadow: 0 0 35px rgba(219,180,75,0.09);
          font-size: 30px;
        }
        #contagemRegressiva .matchmaking-loading-kicker {
          font-size: 11px;
          letter-spacing: 0.32em;
          font-weight: 800;
          color: #d9b44b;
          margin-bottom: 6px;
        }
        #contagemRegressiva .matchmaking-loading-title {
          font-size: clamp(23px, 5vw, 32px);
          line-height: 1.1;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: #fff;
        }
        #contagemRegressiva .matchmaking-loading-subtitle {
          margin-top: 8px;
          color: rgba(255,255,255,0.58);
          font-size: 14px;
        }
        #contagemRegressiva .matchmaking-loading-ring {
          position: relative;
          width: 170px;
          height: 170px;
          margin: 24px 0 18px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          border: 1px solid rgba(219,180,75,0.2);
          background: radial-gradient(circle, rgba(219,180,75,0.09) 0%, rgba(12,14,19,0.98) 58%);
          box-shadow: inset 0 0 35px rgba(219,180,75,0.06), 0 0 35px rgba(0,0,0,0.4);
        }
        #contagemRegressiva .matchmaking-loading-ring::before,
        #contagemRegressiva .matchmaking-loading-ring::after {
          content: '';
          position: absolute;
          inset: 10px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.05);
        }
        #contagemRegressiva .matchmaking-loading-ring::after {
          inset: -1px;
          border-color: rgba(219,180,75,0.52);
          border-right-color: transparent;
          border-bottom-color: transparent;
          animation: matchmakingSpin 1.35s linear infinite;
        }
        #contagemRegressiva .matchmaking-loading-ring-glow {
          position: absolute;
          inset: 25px;
          border-radius: 50%;
          box-shadow: 0 0 34px rgba(219,180,75,0.08);
          animation: matchmakingPulse 1.8s ease-in-out infinite;
        }
        #contagemRegressiva #contagemNumero.matchmaking-number {
          position: relative;
          z-index: 1;
          display: block !important;
          width: auto !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          color: #f2d274 !important;
          font-size: 68px !important;
          font-weight: 900 !important;
          line-height: 0.9 !important;
          text-shadow: 0 0 24px rgba(219,180,75,0.18);
        }
        #contagemRegressiva .matchmaking-loading-label {
          position: absolute;
          bottom: 42px;
          font-size: 9px;
          letter-spacing: 0.28em;
          color: rgba(255,255,255,0.36);
          font-weight: 800;
        }
        #contagemRegressiva .matchmaking-loading-progress {
          width: min(330px, 78vw);
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.6);
        }
        #contagemRegressiva .matchmaking-loading-progress > span {
          display: block;
          width: 100%;
          height: 100%;
          transform-origin: left center;
          transform: scaleX(1);
          border-radius: inherit;
          background: linear-gradient(90deg, #8e6b18, #f2d274, #b9902d);
          box-shadow: 0 0 12px rgba(219,180,75,0.2);
          transition: transform 240ms linear;
        }
        #contagemRegressiva .matchmaking-loading-status {
          margin-top: 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(255,255,255,0.42);
          font-size: 11px;
        }
        #contagemRegressiva .matchmaking-loading-status i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #75d66d;
          box-shadow: 0 0 10px rgba(117,214,109,0.55);
          animation: matchmakingBlink 1s ease-in-out infinite;
        }
        @keyframes matchmakingSpin { to { transform: rotate(360deg); } }
        @keyframes matchmakingPulse { 0%,100% { opacity:.55; transform:scale(.96); } 50% { opacity:1; transform:scale(1.04); } }
        @keyframes matchmakingBlink { 0%,100% { opacity:.45; } 50% { opacity:1; } }
        @media (max-width: 560px) {
          #contagemRegressiva .matchmaking-loading-shell { padding: 28px 20px 22px; border-radius: 20px; }
          #contagemRegressiva .matchmaking-loading-ring { width: 150px; height: 150px; margin: 20px 0 16px; }
          #contagemRegressiva #contagemNumero.matchmaking-number { font-size: 58px !important; }
        }
      `;
      document.head.appendChild(loadingStyle);
    }

    number.classList.add('matchmaking-number');

    const sync = () => {
      const hidden = overlay.classList.contains('oculto');
      const value = Number.parseInt(number.textContent, 10);
      const active = !hidden && Number.isFinite(value) && value > 0;

      overlay.classList.toggle('matchmaking-active', active);

      if (active) {
        const remaining = Math.max(0, Math.min(15, value));
        progress.style.transform = `scaleX(${remaining / 15})`;
      } else {
        progress.style.transform = 'scaleX(0)';
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    observer.observe(number, { childList: true, characterData: true, subtree: true });
    sync();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

// Exportar instância global
window.authTransitions = new AuthTransitions();