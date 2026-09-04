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
// Reaproveita o elemento do game.js e o coloca diretamente no body para escapar do layout da mesa.
(function initMatchmakingLoading() {
  const boot = () => {
    const overlay = document.getElementById('contagemRegressiva');
    const number = document.getElementById('contagemNumero');
    if (!overlay || !number || !document.body) return;

    if (overlay.parentElement !== document.body) document.body.appendChild(overlay);

    const shell = document.createElement('section');
    shell.className = 'matchmaking-loading-shell';
    shell.setAttribute('role', 'status');
    shell.setAttribute('aria-live', 'polite');
    shell.innerHTML = `
      <div class="matchmaking-loading-head">
        <span class="matchmaking-brand-mark" aria-hidden="true">🃏</span>
        <div class="matchmaking-brand-copy">
          <span class="matchmaking-brand-name">TRUCO MANIA</span>
          <span class="matchmaking-brand-kicker">MATCHMAKING</span>
        </div>
      </div>

      <div class="matchmaking-loading-main">
        <div class="matchmaking-loader" aria-hidden="true">
          <span class="matchmaking-loader-core"></span>
        </div>
        <div class="matchmaking-loading-copy">
          <h2>Preparando sua partida</h2>
          <p>Aguardando jogadores para completar a mesa.</p>
          <div class="matchmaking-loading-status">
            <i aria-hidden="true"></i>
            <span>Conectando aos jogadores</span>
            <b aria-hidden="true">•••</b>
          </div>
        </div>
      </div>

      <div class="matchmaking-loading-progress" aria-hidden="true"><span></span></div>
      <span class="matchmaking-hidden-number" aria-hidden="true"></span>
    `;

    shell.querySelector('.matchmaking-hidden-number').appendChild(number);
    overlay.replaceChildren(shell);

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
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
      background: '#020305',
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
          display:grid !important;
        }

        #contagemRegressiva.matchmaking-active::before,
        #contagemRegressiva.matchmaking-active::after {
          content:'';
          position:absolute;
          inset:0;
          pointer-events:none;
        }

        #contagemRegressiva.matchmaking-active::before {
          background:
            radial-gradient(circle at 50% 46%, rgba(215,180,84,.09), transparent 25%),
            radial-gradient(circle at 50% 0%, rgba(53,67,92,.08), transparent 38%),
            linear-gradient(180deg,#06080c 0%,#020305 100%);
        }

        #contagemRegressiva.matchmaking-active::after {
          box-shadow: inset 0 0 140px rgba(0,0,0,.62);
        }

        #contagemRegressiva .matchmaking-loading-shell {
          position:relative;
          z-index:2;
          width:min(500px,calc(100vw - 36px));
          box-sizing:border-box;
          padding:24px 28px 20px;
          border:1px solid rgba(214,177,71,.20);
          border-radius:16px;
          background:linear-gradient(145deg,rgba(13,16,22,.995),rgba(6,8,12,.995));
          box-shadow:0 24px 80px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.035);
        }

        #contagemRegressiva .matchmaking-loading-head {
          display:flex;
          align-items:center;
          gap:11px;
          padding-bottom:18px;
          border-bottom:1px solid rgba(255,255,255,.055);
        }

        #contagemRegressiva .matchmaking-brand-mark {
          display:grid !important;
          place-items:center;
          flex:0 0 36px;
          width:36px !important;
          height:36px !important;
          padding:0 !important;
          margin:0 !important;
          border-radius:10px;
          background:rgba(214,177,71,.10);
          border:1px solid rgba(214,177,71,.20);
          color:#f1d57d !important;
          font-size:17px !important;
          line-height:1 !important;
          box-shadow:0 0 24px rgba(214,177,71,.06);
        }

        #contagemRegressiva .matchmaking-brand-copy {
          display:flex;
          flex-direction:column;
          gap:3px;
          min-width:0;
        }

        #contagemRegressiva .matchmaking-brand-name {
          display:block !important;
          margin:0 !important;
          padding:0 !important;
          color:#dbc06d !important;
          font-size:10px !important;
          line-height:1 !important;
          font-weight:900 !important;
          letter-spacing:.28em !important;
        }

        #contagemRegressiva .matchmaking-brand-kicker {
          display:block !important;
          margin:0 !important;
          padding:0 !important;
          color:rgba(255,255,255,.30) !important;
          font-size:9px !important;
          line-height:1 !important;
          font-weight:700 !important;
          letter-spacing:.16em !important;
        }

        #contagemRegressiva .matchmaking-loading-main {
          display:flex;
          align-items:center;
          gap:20px;
          padding:22px 2px 20px;
        }

        #contagemRegressiva .matchmaking-loader {
          position:relative;
          flex:0 0 66px;
          width:66px !important;
          height:66px !important;
          margin:0 !important;
          padding:0 !important;
          border-radius:50%;
          border:1px solid rgba(214,177,71,.18) !important;
          display:grid !important;
          place-items:center;
          background:radial-gradient(circle,rgba(214,177,71,.08),rgba(8,10,14,.99) 67%) !important;
          box-shadow:inset 0 0 22px rgba(214,177,71,.05),0 0 24px rgba(0,0,0,.32);
        }

        #contagemRegressiva .matchmaking-loader::before {
          content:'';
          position:absolute;
          inset:6px;
          border-radius:50%;
          border:2px solid transparent;
          border-top-color:#e0c16a;
          border-right-color:rgba(224,193,106,.24);
          animation:matchmakingSpin 1.1s linear infinite;
        }

        #contagemRegressiva .matchmaking-loader::after {
          content:'';
          position:absolute;
          inset:17px;
          border-radius:50%;
          border:1px solid rgba(255,255,255,.055);
        }

        #contagemRegressiva .matchmaking-loader-core {
          display:block !important;
          width:7px !important;
          height:7px !important;
          padding:0 !important;
          margin:0 !important;
          border:0 !important;
          border-radius:50%;
          background:#f2d781 !important;
          box-shadow:0 0 17px rgba(242,215,129,.58);
          animation:matchmakingPulse 1.5s ease-in-out infinite;
        }

        #contagemRegressiva .matchmaking-loading-copy {
          min-width:0;
          text-align:left;
        }

        #contagemRegressiva .matchmaking-loading-copy h2 {
          margin:0 !important;
          padding:0 !important;
          color:#f5f5f2 !important;
          font-size:24px !important;
          line-height:1.15 !important;
          font-weight:800 !important;
          letter-spacing:-.025em !important;
        }

        #contagemRegressiva .matchmaking-loading-copy p {
          margin:7px 0 0 !important;
          padding:0 !important;
          color:rgba(255,255,255,.43) !important;
          font-size:12px !important;
          line-height:1.45 !important;
          font-weight:400 !important;
        }

        #contagemRegressiva .matchmaking-loading-status {
          display:flex !important;
          align-items:center;
          gap:7px;
          width:auto !important;
          margin:13px 0 0 !important;
          padding:0 !important;
          color:rgba(255,255,255,.32) !important;
          font-size:10px !important;
          line-height:1 !important;
          letter-spacing:.01em !important;
          font-weight:500 !important;
          background:transparent !important;
          border:0 !important;
          box-shadow:none !important;
        }

        #contagemRegressiva .matchmaking-loading-status > span {
          display:inline !important;
          width:auto !important;
          height:auto !important;
          margin:0 !important;
          padding:0 !important;
          color:rgba(255,255,255,.32) !important;
          font-size:10px !important;
          line-height:1 !important;
          font-weight:500 !important;
        }

        #contagemRegressiva .matchmaking-loading-status i {
          display:block !important;
          flex:0 0 6px;
          width:6px !important;
          height:6px !important;
          margin:0 !important;
          padding:0 !important;
          border:0 !important;
          border-radius:50%;
          background:#70cf68 !important;
          box-shadow:0 0 9px rgba(112,207,104,.45);
          animation:matchmakingBlink 1.2s ease-in-out infinite;
        }

        #contagemRegressiva .matchmaking-loading-status b {
          display:inline !important;
          margin:0 !important;
          padding:0 !important;
          color:rgba(255,255,255,.20) !important;
          font-size:9px !important;
          line-height:1 !important;
          font-weight:800 !important;
          letter-spacing:2px !important;
          animation:matchmakingDots 1.2s steps(4,end) infinite;
        }

        #contagemRegressiva .matchmaking-loading-progress {
          width:100% !important;
          height:3px !important;
          margin:0 !important;
          padding:0 !important;
          overflow:hidden;
          border:0 !important;
          border-radius:999px;
          background:rgba(255,255,255,.055) !important;
          box-shadow:none !important;
        }

        #contagemRegressiva .matchmaking-loading-progress > span {
          display:block !important;
          width:32% !important;
          height:100% !important;
          margin:0 !important;
          padding:0 !important;
          border:0 !important;
          border-radius:inherit;
          background:linear-gradient(90deg,transparent,#ddbd64,transparent) !important;
          box-shadow:0 0 12px rgba(221,189,100,.18);
          animation:matchmakingProgress 1.55s ease-in-out infinite;
        }

        #contagemRegressiva .matchmaking-hidden-number,
        #contagemRegressiva #contagemNumero {
          display:none !important;
          width:0 !important;
          height:0 !important;
          margin:0 !important;
          padding:0 !important;
          overflow:hidden !important;
        }

        @keyframes matchmakingSpin {
          to { transform:rotate(360deg); }
        }

        @keyframes matchmakingPulse {
          0%,100% { transform:scale(.75); opacity:.55; }
          50% { transform:scale(1); opacity:1; }
        }

        @keyframes matchmakingProgress {
          0% { transform:translateX(-210%); }
          100% { transform:translateX(420%); }
        }

        @keyframes matchmakingBlink {
          0%,100% { opacity:.4; }
          50% { opacity:1; }
        }

        @keyframes matchmakingDots {
          0% { opacity:.2; }
          70% { opacity:1; }
          100% { opacity:.2; }
        }

        @media (max-width:560px) {
          #contagemRegressiva .matchmaking-loading-shell {
            width:min(360px,calc(100vw - 28px));
            padding:20px 20px 17px;
            border-radius:14px;
          }
          #contagemRegressiva .matchmaking-loading-main {
            gap:15px;
            padding:18px 0 16px;
          }
          #contagemRegressiva .matchmaking-loader {
            flex-basis:54px;
            width:54px !important;
            height:54px !important;
          }
          #contagemRegressiva .matchmaking-loading-copy h2 {
            font-size:20px !important;
          }
          #contagemRegressiva .matchmaking-loading-copy p {
            font-size:11px !important;
          }
          #contagemRegressiva .matchmaking-loading-status,
          #contagemRegressiva .matchmaking-loading-status > span {
            font-size:9px !important;
          }
        }
      `;
      document.head.appendChild(loadingStyle);
    }

    const sync = () => {
      const hidden = overlay.classList.contains('oculto');
      const value = Number.parseInt(number.textContent.trim(), 10);
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