// TrucoMania - proteção de transição entre rodadas
// Corrige estado visual/client-side preso em "Aguardando oponente" após a 1ª rodada.
(function () {
  'use strict';

  if (typeof socket === 'undefined') return;

  socket.on('turn', function (data) {
    // O evento "turn" só é emitido pelo servidor quando a partida está
    // efetivamente em modo de jogo. Portanto, qualquer estado antigo de
    // resposta a Truco não pode bloquear a nova rodada.
    aguardandoResposta = false;
    isRespondingToBet = false;
    isMyTurn = data && data.currentPlayer === myPlayerIndex;

    if (typeof atualizarInfoLive === 'function') atualizarInfoLive();

    if (isMyTurn) {
      if (typeof btnCorrer !== 'undefined' && btnCorrer) btnCorrer.classList.remove('oculto');
      if (typeof atualizarBotaoTruco === 'function') atualizarBotaoTruco();
      if (typeof startTurnTimer === 'function') startTurnTimer();
    } else {
      if (typeof btnTruco !== 'undefined' && btnTruco) btnTruco.classList.add('oculto');
      if (typeof btnCorrer !== 'undefined' && btnCorrer) btnCorrer.classList.add('oculto');
      if (typeof clearTurnTimer === 'function') clearTurnTimer();
    }
  });
})();
