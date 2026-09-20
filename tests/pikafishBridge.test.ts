import { pikafishMoveToPosition, gameStateToPikafishFen } from '../src/ai/pikafishBridge';
import { newGame } from '../src/game/gameState';

const startFen = 'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w R2A2C2P5N2B2r2a2c2p5n2b2 0 1';

if (gameStateToPikafishFen(newGame()) !== startFen) {
  throw new Error(`unexpected start FEN: ${gameStateToPikafishFen(newGame())}`);
}

const converted = pikafishMoveToPosition('a9a0');
if (converted?.from.row !== 0 || converted?.from.col !== 0 || converted?.to.row !== 9 || converted?.to.col !== 0) {
  throw new Error('unexpected UCI square conversion');
}

if (pikafishMoveToPosition('z9a0') !== null) {
  throw new Error('invalid UCI move was accepted');
}

console.log('ok - pikafish bridge state conversion');
