(() => {
  const createExitButton = () => {
    if (document.getElementById('btnSairSala')) return;

    const gameWrapper = document.getElementById('gameWrapper');
    if (!gameWrapper || typeof socket === 'undefined') return;

    const button = document.createElement('button');
    button.id = 'btnSairSala';
    button.type = 'button';
    button.textContent = '↩️ Sair da sala';
    button.style.cssText = 'position:fixed;top:12px;left:12px;z-index:10000;padding:9px 14px;border:1px solid rgba(255,255,255,.25);border-radius:10px;background:rgba(0,0,0,.45);color:#fff;font-weight:700;cursor:pointer;backdrop-filter:blur(6px);display:none;';
    document.body.appendChild(button);

    const updateVisibility = () => {
      button.style.display = gameWrapper.classList.contains('game-hidden') ? 'none' : 'block';
    };

    new MutationObserver(updateVisibility).observe(gameWrapper, { attributes: true, attributeFilter: ['class'] });
    updateVisibility();

    button.addEventListener('click', () => {
      if (!window.confirm('Sair da sala e voltar ao Hub?')) return;

      button.disabled = true;
      button.textContent = 'Saindo...';

      socket.emit('leaveRoom', (result) => {
        if (result?.error) {
          button.disabled = false;
          button.textContent = '↩️ Sair da sala';
          alert(result.error);
          return;
        }
        location.reload();
      });
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createExitButton);
  else createExitButton();
})();
