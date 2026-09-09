/**
 * The one derivation both `virtual:site-*` stubs read.
 *
 * The two virtual modules are two CHUNKS in the build, which is the whole point
 * of the split, but they are one derivation from one commit log -- so the stubs
 * share this rather than each calling `buildSiteVersions` on their own fixture
 * and drifting into describing two different histories.
 */
import { buildSiteVersions, FIELD, REC } from '../../src/lib/site-versions';

const LOG = [
	`${REC}9f3c1aa${FIELD}Aug 18, 2026${FIELD}2026-08-18T16:52:25-07:00${FIELD}Give the class page a gutter`,
	'src/lib/classroom/ClassView.svelte',
	`${REC}1b2c3d4${FIELD}Aug 17, 2026${FIELD}2026-08-17T09:10:00-07:00${FIELD}Fix the notebook's second scrollbar`,
	'src/lib/notebook/NotebookView.svelte',
	`${REC}5e6f7a8${FIELD}Aug 16, 2026${FIELD}2026-08-16T09:10:00-07:00${FIELD}Add a classroom reference viewer`,
	'src/routes/reference/[itemId]/+page.svelte',
	'README.md'
].join('\n');

export const site = buildSiteVersions(LOG, { complete: true, envSha: null });
export const entries = site.entries;
