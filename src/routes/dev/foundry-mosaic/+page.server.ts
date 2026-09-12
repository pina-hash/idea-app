import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE MOSAIC HARNESS. Dev only: 404 in production, no auth, no Supabase.
 *
 * It mounts the REAL `FoundryGallery` against a fixture built for ONE
 * question the older `/dev/foundry-gallery` harness cannot ask: what the
 * gallery looks like when the cards are actual pictures of different shapes.
 * Every app in that fixture carries `cover_path: null`, so it renders three
 * identical generated covers and the mosaic never appears -- which is exactly
 * how a uniform grid survived being looked at.
 *
 * WHAT THE FIXTURE IS FOR, row by row: the four ordinary shapes a student
 * uploads, the two pathological ones the clamp exists for, one modern tall
 * phone (clamped, and the only clamped shape that is a real photograph), one
 * cover whose stored path is NOT A KEY (`.fg-cover-bad`, judged locally with
 * no request made), one whose request will fail (`[data-cover-failed]`), and
 * two with no cover at all, which is an ordinary published state because
 * `foundryPublishBlockers` requires a description and never a picture.
 */

function app(over: Partial<FoundryAppSummary> & { id: string; slug: string; title: string }) {
	return {
		tagline: null,
		cover_path: null,
		owner_display_name: null,
		owner_full_name: null,
		owner_class: null,
		published_version_id: '20000000-0000-4000-8000-000000000001',
		published_ordinal: 1,
		version_count: 1,
		submitted_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		updated_at: '2026-09-01T12:00:00Z',
		...over
	} satisfies FoundryAppSummary;
}

/**
 * A fixture cover path. The harness's own `coverUrl` maps it onto the byte
 * route beside this file -- the component never learns the layout, exactly as
 * it does not on the real route.
 */
const shot = (shape: string) => `fixture/${shape}`;

export const load: PageServerLoad = () => {
	if (!dev) error(404);

	const apps: FoundryAppSummary[] = [
		app({
			id: '10000000-0000-4000-8000-000000000001',
			slug: 'orbit-lander',
			title: 'Orbit Lander',
			cover_path: shot('wide-169'),
			owner_full_name: 'Ana Reyes',
			owner_class: 'Engineering I Honors'
		}),
		app({
			id: '10000000-0000-4000-8000-000000000002',
			slug: 'pocket-synth',
			title: 'Pocket Synth',
			cover_path: shot('tall-916'),
			owner_full_name: 'Sam Cruz'
		}),
		app({
			id: '10000000-0000-4000-8000-000000000003',
			slug: 'tile-forge',
			title: 'Tile Forge',
			cover_path: shot('square'),
			owner_full_name: 'Wren Alvarez',
			owner_class: 'Engineering II'
		}),
		app({
			id: '10000000-0000-4000-8000-000000000004',
			slug: 'bench-timer',
			title: 'Bench Timer',
			cover_path: shot('classic-43'),
			owner_full_name: 'Dev Patel'
		}),
		app({
			id: '10000000-0000-4000-8000-000000000005',
			slug: 'ribbon-runner',
			title: 'Ribbon Runner (9:1, clamped to 2:1)',
			cover_path: shot('ribbon'),
			owner_full_name: 'Kai Moreau'
		}),
		app({
			id: '10000000-0000-4000-8000-000000000006',
			slug: 'sliver-stack',
			title: 'Sliver Stack (1:9, clamped to 9:16)',
			cover_path: shot('sliver'),
			owner_full_name: 'Robin Diaz'
		}),
		app({
			id: '10000000-0000-4000-8000-000000000007',
			slug: 'pocket-dungeon',
			title: 'Pocket Dungeon',
			cover_path: shot('phone-tall'),
			owner_full_name: 'Iris Kwan',
			owner_class: 'Engineering I Honors'
		}),
		/* A stored path that is not a storage key. `foundryCoverObjectKey`
		   answers null for it in the browser, with no request made. */
		app({
			id: '10000000-0000-4000-8000-000000000008',
			slug: 'bad-key',
			title: 'Cover path is not a key',
			cover_path: 'not/a/real/key.png'
		}),
		/* A key-shaped path whose request will not produce a picture. */
		app({
			id: '10000000-0000-4000-8000-000000000009',
			slug: 'gone-cover',
			title: 'Cover request fails',
			cover_path: shot('does-not-exist')
		}),
		app({
			id: '10000000-0000-4000-8000-00000000000a',
			slug: 'no-cover-one',
			title: 'Signal Garden',
			owner_full_name: 'Noor Haddad',
			owner_class: 'Engineering II'
		}),
		app({
			id: '10000000-0000-4000-8000-00000000000b',
			slug: 'no-cover-two',
			title: 'Latch',
			owner_full_name: 'Theo Bright'
		})
	];

	return { apps };
};
