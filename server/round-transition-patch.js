// Garante que a rodada encerrada permaneça visível antes de liberar a próxima jogada.
// O Game4P original emitia `turn` imediatamente após `roundResult`, permitindo que
// um bot jogasse 700ms depois enquanto o cliente ainda estava exibindo a rodada anterior.
const Module = require('module');

const originalLoad = Module._load;
const ROUND_DISPLAY_MS = 2500;
let patched = false;

Module._load = function patchedModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);

  if (!patched && (request === './game' || request.endsWith('/game')) && loaded && loaded.Game4P) {
    patched = true;
    const OriginalGame4P = loaded.Game4P;
    const originalScheduleOfflineTurn = OriginalGame4P.prototype.scheduleOfflineTurn;

    class Game4PWithRoundTransition extends OriginalGame4P {
      constructor(...args) {
        super(...args);

        const originalEmit = this.emit;
        this.emit = (event, ...eventArgs) => {
          if (event === 'roundResult') {
            this._roundDisplayUntil = Date.now() + ROUND_DISPLAY_MS;
            return originalEmit(event, ...eventArgs);
          }

          if (event === 'turn' && this._roundDisplayUntil) {
            const remaining = this._roundDisplayUntil - Date.now();
            if (remaining > 0) {
              const targetPlayer = this.currentPlayer;
              setTimeout(() => {
                if (this.turnStage !== 'play' || this.currentPlayer !== targetPlayer) return;
                originalEmit('turn', ...eventArgs);
              }, remaining);
              return;
            }
          }

          return originalEmit(event, ...eventArgs);
        };
      }

      scheduleOfflineTurn() {
        const remaining = (this._roundDisplayUntil || 0) - Date.now();
        if (remaining > 0) {
          if (this.offlineActionTimer) clearTimeout(this.offlineActionTimer);
          const targetPlayer = this.currentPlayer;
          this.offlineActionTimer = setTimeout(() => {
            this.offlineActionTimer = null;
            if (this.turnStage !== 'play' || this.currentPlayer !== targetPlayer) return;
            originalScheduleOfflineTurn.call(this);
          }, remaining);
          return;
        }

        return originalScheduleOfflineTurn.call(this);
      }
    }

    loaded.Game4P = Game4PWithRoundTransition;
  }

  return loaded;
};
