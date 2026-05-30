// Per-test Foundry global wiring. Runs (setupFilesAfterEnv) before each test file.
//
// A baseline set of mocked globals is installed before every test so that simply
// importing a bridge module — which may reference Hooks/game/canvas at module load
// or in registered handlers — never throws. Individual tests overwrite global.game
// / global.canvas (or re-call installFoundryGlobals) to shape the world they need.

import { installFoundryGlobals, clearFoundryGlobals } from './foundryMock.js';

beforeEach(() => {
  installFoundryGlobals();
});

afterEach(() => {
  clearFoundryGlobals();
  jest.clearAllMocks();
});
