import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the LINES-OF-CODE readout and its breakdown panel.
 * Mounts the REAL `CodeCounter` against the REAL `virtual:site-code` census,
 * with the panel open. No auth, no Supabase, no network. 404s in production.
 *
 * WHY A ROUTE OF ITS OWN, WHEN `/dev/home-order` MOUNTS THE REAL BANNER. The
 * readout is HIDDEN below 768px -- there is no width of chip that fits in the
 * signed-out banner at 375px, which has 13px of slack, so shipping one there
 * costs a second row on a sticky header (measured: 75.5px to 115.1px). The
 * browser pass runs every spec at 375 AND 1440, so on the home harness the
 * panel simply does not exist at one of the two widths and its contrast, tap
 * targets and row structure cannot be measured there at all.
 *
 * `/dev/home-order?...admin=1` still measures what belongs to the banner: that
 * the readout is shown exactly where there is room, that it costs the header
 * nothing at either width, and that a finger reaches it where it is shown.
 * This route measures what belongs to the PANEL.
 *
 * `?census=empty` is the negative control: a zeroed census, which is what a
 * checkout with no tracked file list produces. The component must render
 * NOTHING -- a code count that can silently come out low is worse than no
 * count -- and a spec that only ever saw the chip present could not tell that
 * from a chip that is always drawn.
 *
 * `?updates=` picks what the recent-updates section is handed (report R10):
 * `real` (the default) is the REAL `virtual:site-changelog`, line counts and
 * all, exactly as the home page lazy-loads it; `shallow` is a small log run
 * through the real `buildSiteVersions` as a shallow clone, so it carries no
 * counts; `fail` is a transport that rejects; `none` hands no transport, which
 * removes the section.
 */
export const prerender = false;

const UPDATES = ['real', 'shallow', 'fail', 'none'] as const;
export type HarnessUpdates = (typeof UPDATES)[number];

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const asked = url.searchParams.get('updates');
	const updates: HarnessUpdates = (UPDATES as readonly string[]).includes(asked ?? '')
		? (asked as HarnessUpdates)
		: 'real';
	return { harness: { empty: url.searchParams.get('census') === 'empty', updates } };
};
