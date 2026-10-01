import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { FoundryBundleEntry } from '$lib/server/foundry-bundle';
import type { FoundryApp, FoundryAppSummary } from '$lib/foundry/transports';
import { load as galleryHarnessLoad } from '../foundry-gallery/+page.server';
import type { PageServerLoad } from './$types';

/**
 * THE FOUNDRY ROOM AS THE ROUTES MOUNT IT (ledger 0360, reports 162057f0,
 * 94e312c4 and 647d1201). Dev only: 404 in production, no auth, no Supabase.
 *
 * WHY A SECOND HARNESS. `/dev/foundry-gallery` puts each surface in a
 * `.fdy-shell` with `width: 100%` and never puts `.cr-app` on the room, which
 * is exactly why it never showed the shrink-to-fit gallery the reports were
 * about: the defect lived in the column flexbox the layout builds above
 * 1024px. This page builds that column -- the REAL `FoundryShell`, the REAL
 * `FoundryPage`, `.cr-app` decided by the REAL `foundryIsApplication` -- around
 * the real gallery, the real review queue and the real author page.
 *
 * THE FIXTURE IS THE GALLERY HARNESS'S OWN, read through its load rather than
 * copied, plus synthesized cards so a 2560px window has enough apps to fill
 * eight columns. The synthesized cards carry no cover and no published build;
 * a card needs neither to render.
 */
export const load: PageServerLoad = async (event) => {
	if (!dev) error(404, 'Not found');
	type GalleryHarness = {
		apps: FoundryAppSummary[];
		details: Record<string, FoundryApp>;
		files: Record<string, FoundryBundleEntry[]>;
		sources: Record<string, Record<string, string>>;
	};
	const base = (await galleryHarnessLoad(event as never)) as unknown as GalleryHarness;

	const extra: FoundryAppSummary[] = Array.from({ length: 13 }, (_, i) => ({
		...base.apps[1]!,
		id: `room-extra-${i}`,
		slug: `room-extra-${i}`,
		title: ['Orbit Lab', 'Frog Frenzy', 'Sprout Sim', 'Bolt Run', 'Tide Pool', 'Gear Ratio', 'Quiet Quest', 'Cookie Press', 'Run Dude', 'Balloon Pop', 'Block Front', 'Brick Breaker', 'Snake'][i]!,
		tagline: null,
		owner_full_name: 'Sam Cruz',
		updated_at: `2026-08-${String(10 + i).padStart(2, '0')}T09:00:00Z`
	}));

	return {
		apps: [...base.apps, ...extra],
		details: base.details,
		files: base.files,
		sources: base.sources
	};
};
