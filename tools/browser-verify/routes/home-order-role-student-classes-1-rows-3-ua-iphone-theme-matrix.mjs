/**
 * The Install app key and its card under the matrix theme (ledger 0396). The
 * factory in ./_install-key.mjs is the spec; this file names the state it
 * measures.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import { reach } from './_home-theme.mjs';
import { installThemeSpec } from './_install-key.mjs';

export default installThemeSpec('matrix', reach, SETTLE_ENTRANCE);
