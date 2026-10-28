// Write-ahead persistence of a rotated X refresh token. X refresh tokens are
// single-use: the moment we refresh, the old secret is dead and the live token
// exists only where we put it. Persist it to state first (a crash between
// refresh and the final save must not lose it) and to a marker file the CI
// workflow reads to update the GitHub secret.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { saveState } from './state.mjs';

export const ROTATED_TOKEN_FILE = '.rotated-token';

export function rotatedTokenPath(statePath) {
  return join(dirname(statePath), ROTATED_TOKEN_FILE);
}

export function saveRotatedToken(statePath, state, refreshToken) {
  state.refreshToken = refreshToken;
  saveState(statePath, state);
  writeFileSync(rotatedTokenPath(statePath), refreshToken + '\n', 'utf8');
}
