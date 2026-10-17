/**
 * The Install app key and its card under the space-white theme (ledger 0396). The
 * factory in ./_install-key.mjs is the spec; this file names the state it
 * measures.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';
import { reach } from './_home-theme.mjs';
import { installThemeSpec } from './_install-key.mjs';

export default installThemeSpec('space-white', reach, SETTLE_ENTRANCE);
