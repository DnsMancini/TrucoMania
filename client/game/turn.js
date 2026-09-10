(function () {
  const TURN_SECONDS = 25;
  let turnTimerInterval = null;
  let timeLeft = TURN_SECONDS;

  function startTurnTimer() {
    if (turnTimerInterval) clearInterval(turnTimerInterval);
    timeLeft = TURN_SECONDS;

    const cronometroEl = document.getElementById('cronometro');
    const cronometroNum = document.getElementById('cronometroNum');
    if (!cronometroEl || !cronometroNum) return;

    cronometroEl.classList.remove('oculto');
    cronometroNum.textContent = timeLeft;
    turnTimerInterval = setInterval(() => {
      timeLeft--;
      cronometroNum.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearTurnTimer();
        window.autoPlayRandomCard?.();
      }
    }, 1000);
  }

  function clearTurnTimer() {
    if (turnTimerInterval) {
      clearInterval(turnTimerInterval);
      turnTimerInterval = null;
    }
    document.getElementById('cronometro')?.classList.add('oculto');
  }

  window.gameTurn = {
    startTurnTimer,
    clearTurnTimer
  };

  window.startTurnTimer = startTurnTimer;
  window.clearTurnTimer = clearTurnTimer;

  // Recuperação do áudio de aposta: mantém a reprodução ligada ao gesto do
  // jogador e tenta novamente apenas se o navegador tiver deixado o elemento
  // parado. Isso cobre especialmente Seis/Nove/Doze em navegadores móveis.
  (() => {
    const audioByLevel = {
      truco: () => document.getElementById('audioTruco'),
      retruco: () => document.getElementById('audioSeis'),
      valenove: () => document.getElementById('audioNove'),
      valedoze: () => document.getElementById('audioDoze')
    };
    const levelFromButton = button => {
      if (!button) return null;
      if (button.id === 'betRaiseBtn') {
        const text = button.textContent || '';
        if (/12/.test(text)) return 'valedoze';
        if (/9/.test(text)) return 'valenove';
        if (/6/.test(text)) return 'retruco';
        return null;
      }
      if (button.id !== 'btnTruco') return null;
      const text = (button.textContent || '').toUpperCase();
      if (text.includes('DOZE')) return 'valedoze';
      if (text.includes('NOVE')) return 'valenove';
      if (text.includes('RETRUCO')) return 'retruco';
      if (text.includes('TRUCO')) return 'truco';
      return null;
    };
    const retry = level => {
      const getAudio = audioByLevel[level];
      const audio = getAudio?.();
      if (!audio || !audio.paused || audio.ended) return;
      audio.preload = 'auto';
      audio.volume = 1;
      try { audio.currentTime = 0; } catch (_) {}
      audio.play().catch(() => {});
    };
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('#btnTruco, #betRaiseBtn');
      const level = levelFromButton(button);
      if (!level) return;
      // O game.js já tenta tocar imediatamente. As tentativas abaixo são
      // apenas recuperação quando o elemento permaneceu pausado.
      setTimeout(() => retry(level), 120);
      setTimeout(() => retry(level), 450);
    }, true);

    const socket = window.trucoSocket;
    if (!socket || typeof socket.onevent !== 'function') return;
    const originalOnevent = socket.onevent.bind(socket);
    socket.onevent = function (packet) {
      const eventName = packet?.data?.[0];
      if (eventName === 'handEnd') {
        const audios = Object.values(audioByLevel).map(get => get()).filter(Boolean);
        const originals = new Map();
        audios.forEach(audio => {
          originals.set(audio, audio.play);
          audio.play = () => Promise.resolve();
          try { audio.pause(); } catch (_) {}
        });
        try {
          return originalOnevent(packet);
        } finally {
          audios.forEach(audio => {
            const play = originals.get(audio);
            if (play) audio.play = play;
          });
        }
      }
      const result = originalOnevent(packet);
      if (eventName === 'betCalled' || eventName === 'betRaised') {
        const level = packet?.data?.[1]?.level;
        if (audioByLevel[level]) {
          setTimeout(() => retry(level), 60);
          setTimeout(() => retry(level), 300);
        }
      }
      return result;
    };
  })();
})();