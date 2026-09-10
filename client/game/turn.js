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
})();
