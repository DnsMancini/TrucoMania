// Transições Cinematográficas Premium para TrucoMania Auth
class AuthTransitions {
  constructor() {
    this.currentScreen = null;
    this.transitioning = false;
  }

  async switchScreen(fromElement, toElement, direction = 'forward', onShow = null) {
    if (this.transitioning) return;
    this.transitioning = true;
    if (!fromElement) {
      toElement.style.display = 'flex';
      toElement.style.opacity = '0';
      await this.animateIn(toElement);
      this.currentScreen = toElement;
      this.transitioning = false;
      if (onShow) onShow();
      return;
    }
    await this.animateOut(fromElement);
    fromElement.style.display = 'none';
    toElement.style.display = 'flex';
    toElement.style.opacity = '0';
    toElement.style.transform = `translateY(${direction === 'forward' ? '20px' : '-20px'}) scale(0.98)`;
    await this.animateIn(toElement);
    this.currentScreen = toElement;
    this.transitioning = false;
    if (onShow) onShow();
  }

  async animateIn(element) {
    return new Promise(resolve => {
      element.style.transition = 'none';
      element.style.opacity = '0';
      element.style.transform = 'translateY(20px) scale(0.98)';
      void element.offsetHeight;
      element.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      element.style.opacity = '1';
      element.style.transform = 'translateY(0) scale(1)';
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

  async animateOut(element) {
    return new Promise(resolve => {
      element.style.transition = 'all 0.4s cubic-bezier(0.55, 0, 1, 0.45)';
      element.style.opacity = '0';
      element.style.transform = 'translateY(-15px) scale(0.97)';
      element.style.filter = 'blur(2px)';
      setTimeout(resolve, 450);
    });
  }

  async splashToAuth(splashElement, authElement) {
    if (this.transitioning) return;
    this.transitioning = true;
    splashElement.style.transition = 'all 0.8s cubic-bezier(0.55, 0, 1, 0.45)';
    splashElement.style.opacity = '0';
    splashElement.style.transform = 'scale(1.1)';
    splashElement.style.filter = 'blur(4px)';
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

  async authToLobby(authElement, lobbyElement) {
    if (this.transitioning) return;
    this.transitioning = true;
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
      document.dispatchEvent(new CustomEvent('lobby-ready'));
      this.currentScreen = lobbyElement;
      this.transitioning = false;
    }, 400);
  }

  static createLoadingBar(container) {
    const bar = document.createElement('div');
    bar.className = 'splash-loading-bar';
    bar.innerHTML = '<div class="splash-loading-progress"></div>';
    container.appendChild(bar);
    return bar;
  }

  static animateLoading(barElement, duration = 2500) {
    return new Promise(resolve => {
      const progress = barElement.querySelector('.splash-loading-progress');
      if (!progress) { resolve(); return; }
      progress.style.transition = `width ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      progress.style.width = '100%';
      setTimeout(resolve, duration + 200);
    });
  }

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

const style = document.createElement('style');
style.textContent = `
  @keyframes particleBurst {
    0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); opacity: 0; }
  }
`;
document.head.appendChild(style);

// ===== MATCHMAKING / LOADING =====
// Usa o mesmo elemento do game.js, mas o coloca diretamente no body para garantir cobertura integral.
(function initMatchmakingLoading() {
  const boot = () => {
    const overlay = document.getElementById('contagemRegressiva');
    const number = document.getElementById('contagemNumero');
    if (!overlay || !number || !document.body) return;

    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);

    const shell = document.createElement('div');
    shell.className = 'matchmaking-loading-shell';
    shell.innerHTML = `
      <div class="matchmaking-brand">
        <span class="matchmaking-brand-mark">🃏</span>
        <span class="matchmaking-brand-name">TRUCO MANIA</span>
      </div>
      <div class="matchmaking-loading-title">Preparando sua partida</div>
      <div class="matchmaking-loading-subtitle">Aguardando jogadores e preparando a mesa</div>
      <div class="matchmaking-loader" aria-hidden="true">
        <span class="matchmaking-loader-core"></span>
      </div>
      <div class="matchmaking-loading-progress"><span></span></div>
      <div class="matchmaking-loading-status"><i></i><span>Conectando aos jogadores</span><b>•••</b></div>
      <span class="matchmaking-hidden-number" aria-hidden="true"></span>
    `;

    const hiddenNumber = shell.querySelector('.matchmaking-hidden-number');
    hiddenNumber.appendChild(number);
    overlay.replaceChildren(shell);

    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100dvh',
      minWidth: '100vw', minHeight: '100vh', margin: '0', padding: '0',
      boxSizing: 'border-box', display: 'none', placeItems: 'center',
      overflow: 'hidden', background: '#030406', color: '#fff', border: '0',
      borderRadius: '0', transform: 'none', filter: 'none', opacity: '1',
      zIndex: '2147483647', fontFamily: 'inherit', isolation: 'isolate'
    });

    const styleId = 'matchmaking-loading-styles';
    if (!document.getElementById(styleId)) {
      const loadingStyle = document.createElement('style');
      loadingStyle.id = styleId;
      loadingStyle.textContent = `
        #contagemRegressiva.matchmaking-active { display:grid !important; }
        #contagemRegressiva.matchmaking-active::before,
        #contagemRegressiva.matchmaking-active::after {
          content:''; position:absolute; inset:0; pointer-events:none;
        }
        #contagemRegressiva.matchmaking-active::before {
          background:
            radial-gradient(ellipse at 50% 38%, rgba(214,177,71,.10), transparent 34%),
            radial-gradient(ellipse at 50% 100%, rgba(82,102,137,.06), transparent 48%),
            linear-gradient(180deg,#07090d 0%,#030406 58%,#010203 100%);
        }
        #contagemRegressiva.matchmaking-active::after {
          background:linear-gradient(90deg,transparent 0,rgba(255,255,255,.018) 50%,transparent 100%);
        }
        #contagemRegressiva .matchmaking-loading-shell {
          position:relative; z-index:2; width:min(390px,calc(100vw - 40px));
          box-sizing:border-box; padding:34px 36px 28px; display:flex;
          flex-direction:column; align-items:center; text-align:center;
          border:1px solid rgba(214,177,71,.20); border-radius:18px;
          background:linear-gradient(160deg,rgba(14,17,23,.99),rgba(5,7,10,.995));
          box-shadow:0 22px 70px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.035);
        }
        #contagemRegressiva .matchmaking-brand { display:flex; align-items:center; gap:10px; }
        #contagemRegressiva .matchmaking-brand-mark {
          width:34px; height:34px; display:grid; place-items:center; border-radius:10px;
          background:rgba(214,177,71,.10); border:1px solid rgba(214,177,71,.22); font-size:17px;
        }
        #contagemRegressiva .matchmaking-brand-name {
          color:#d9b85e; font-size:10px; font-weight:900; letter-spacing:.28em;
        }
        #contagemRegressiva .matchmaking-loading-title {
          margin-top:22px; color:#f7f7f5; font-size:25px; line-height:1.15;
          font-weight:800; letter-spacing:-.025em;
        }
        #contagemRegressiva .matchmaking-loading-subtitle {
          max-width:290px; margin-top:9px; color:rgba(255,255,255,.46); font-size:13px; line-height:1.5;
        }
        #contagemRegressiva .matchmaking-loader {
          width:72px; height:72px; margin:28px 0 22px; position:relative; border-radius:50%;
          border:1px solid rgba(214,177,71,.18); display:grid; place-items:center;
          background:radial-gradient(circle,rgba(214,177,71,.08),rgba(8,10,14,.98) 65%);
        }
        #contagemRegressiva .matchmaking-loader::before {
          content:''; position:absolute; inset:7px; border-radius:50%;
          border:2px solid transparent; border-top-color:#d9b85e; border-right-color:rgba(217,184,94,.32);
          animation:matchmakingSpin 1.15s linear infinite;
        }
        #contagemRegressiva .matchmaking-loader::after {
          content:''; position:absolute; inset:18px; border-radius:50%;
          border:1px solid rgba(255,255,255,.06);
        }
        #contagemRegressiva .matchmaking-loader-core {
          width:7px; height:7px; border-radius:50%; background:#f0d47f;
          box-shadow:0 0 18px rgba(240,212,127,.55); animation:matchmakingPulse 1.5s ease-in-out infinite;
        }
        #contagemRegressiva .matchmaking-loading-progress {
          width:100%; height:4px; overflow:hidden; border-radius:999px;
          background:rgba(255,255,255,.065);
        }
        #contagemRegressiva .matchmaking-loading-progress > span {
          display:block; width:34%; height:100%; border-radius:inherit;
          background:linear-gradient(90deg,transparent,#dfbf67,transparent);
          animation:matchmakingProgress 1.65s ease-in-out infinite;
        }
        #contagemRegressiva .matchmaking-loading-status {
          margin-top:13px; width:100%; display:flex; align-items:center; justify-content:center;
          gap:7px; color:rgba(255,255,255,.34); font-size:10px; letter-spacing:.02em;
        }
        #contagemRegressiva .matchmaking-loading-status i {
          width:6px; height:6px; border-radius:50%; background:#76d36b;
          box-shadow:0 0 9px rgba(118,211,107,.5); animation:matchmakingBlink 1.2s ease-in-out infinite;
        }
        #contagemRegressiva .matchmaking-loading-status b { font-weight:800; letter-spacing:2px; color:rgba(255,255,255,.25); animation:matchmakingDots 1.2s steps(4,end) infinite; }
        #contagemRegressiva .matchmaking-hidden-number { display:none !important; }
        #contagemRegressiva #contagemNumero { display:none !important; }
        @keyframes matchmakingSpin { to { transform:rotate(360deg); } }
        @keyframes matchmakingPulse { 0%,100% { transform:scale(.75); opacity:.55; } 50% { transform:scale(1); opacity:1; } }
        @keyframes matchmakingProgress { 0% { transform:translateX(-180%); } 100% { transform:translateX(390%); } }
        @keyframes matchmakingBlink { 0%,100% { opacity:.45; } 50% { opacity:1; } }
        @keyframes matchmakingDots { 0% { opacity:.2; } 70% { opacity:1; } 100% { opacity:.2; } }
        @media (max-width:560px) {
          #contagemRegressiva .matchmaking-loading-shell { width:min(350px,calc(100vw - 28px)); padding:28px 24px 24px; }
          #contagemRegressiva .matchmaking-loading-title { font-size:22px; }
          #contagemRegressiva .matchmaking-loader { width:64px; height:64px; margin:24px 0 19px; }
        }
      `;
      document.head.appendChild(loadingStyle);
    }

    const sync = () => {
      const hidden = overlay.classList.contains('oculto');
      const text = number.textContent.trim();
      const value = Number.parseInt(text, 10);
      const active = !hidden && Number.isFinite(value) && value > 0;
      overlay.classList.toggle('matchmaking-active', active);
    };

    const observer = new MutationObserver(sync);
    observer.observe(overlay, { attributes:true, attributeFilter:['class'] });
    observer.observe(number, { childList:true, characterData:true, subtree:true });
    sync();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();

window.authTransitions = new AuthTransitions();
