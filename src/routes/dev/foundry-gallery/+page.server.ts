import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_B,
	FIXTURE_APP_PLAYFIELD,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_B_LIVE,
	FIXTURE_VERSION_PLAYFIELD,
	FIXTURE_VIEWER
} from '$lib/server/foundry-dev-fixture';
import {
	listBundleFiles,
	readBundleFileText,
	type FoundryBundleEntry
} from '$lib/server/foundry-bundle';
import type { FoundryApp, FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE GALLERY / DETAIL / REVIEW HARNESS. Dev only: 404 in production, no auth,
 * no Supabase.
 *
 * It mounts the REAL `FoundryGallery` and the REAL `ReviewQueue` -- the same
 * components `/foundry` and `/foundry/review` mount, not copies -- against the
 * in-memory fixture in `$lib/server/foundry-dev-fixture`, whose app A is the
 * deliberately hostile probe bundle. So the sandbox, the stop control and the
 * side-by-side review layout can all be driven for real with the local `.env`'s
 * placeholder Supabase project.
 *
 * WHAT IS MIRRORED AND WHAT IS NOT, said plainly, because a harness missing a
 * guard the real page has makes a passing drive prove nothing:
 *
 *   MIRRORED  the components themselves; the launch and stop lifecycle; the
 *             iframe sandbox attribute; the split geometry; the file list and
 *             the source bytes, read through the same
 *             `$lib/server/foundry-bundle` functions the real source route
 *             calls.
 *
 *   MIRRORED  A RUNNING BUNDLE, WHICH IT DID NOT USED TO BE. `AppStage` builds
 *             its frame src from `PUBLIC_FOUNDRY_APPS_ORIGIN` and the two ids,
 *             and the fixture bundles are served by the REAL `/b/` route out of
 *             `$lib/server/foundry-dev-fixture` -- so pointing that variable at
 *             this dev server (a second spelling of its own address, so the
 *             frame is genuinely cross-origin) runs the fixture bundles for
 *             real, through the real route, with the real headers. Leaving it
 *             unset removes the launch control entirely, which is the shipping
 *             behaviour and not a harness quirk.
 *   NOT       the ADMIN GATE. `/foundry/review` 404s a non-admin in its load
 *             and `/api/foundry/source` 404s one in its handler; both need a
 *             real session, so neither runs here. The review surface below is
 *             reachable in dev by anybody, which is true of every `/dev` route
 *             and is why they all 404 in production.
 *   NOT       `foundry_review_version`. The decision transport below records
 *             the call and answers ok; no row moves, because there is no row.
 */

/** The fixture's own metadata, shaped as the two definers project it (0132). */
function summary(over: Partial<FoundryAppSummary> & { id: string; slug: string; title: string }) {
	return {
		tagline: null,
		cover_path: null,
		owner_display_name: null,
		owner_full_name: null,
		owner_class: null,
		published_version_id: null,
		published_ordinal: 1,
		version_count: 1,
		submitted_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		updated_at: '2026-08-20T09:00:00Z',
		...over
	} as FoundryAppSummary;
}

export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');

	/**
	 * THE THREE AUTHOR SHAPES THE SURFACES HAVE TO RENDER, and the null one is
	 * the case worth having a fixture for at all: `owner_class` null must render
	 * as NOTHING -- no placeholder, no label, no stranded separator.
	 *
	 *   A  a display name AND a class
	 *   B  full name only, NO class      <- the null case
	 *   C  a chosen display name over a full name, which is the rung that wins
	 */
	const apps: FoundryAppSummary[] = [
		summary({
			id: FIXTURE_APP_A,
			slug: 'hostile-probe',
			title: 'Foundry hostile probe',
			tagline: 'Every escape the origin split is supposed to stop, reporting its own result.',
			owner_display_name: null,
			owner_full_name: 'Ana Reyes',
			owner_class: 'Engineering I Honors',
			published_version_id: FIXTURE_VERSION_A_LIVE,
			// In the queue: a second build waiting, and the text changed after
			// the live one was approved.
			submitted_version_id: FIXTURE_VERSION_A_STALE,
			metadata_flagged_at: '2026-08-22T14:10:00Z',
			version_count: 2,
			updated_at: '2026-08-18T09:00:00Z'
		}),
		summary({
			id: FIXTURE_APP_B,
			slug: 'app-b',
			title: 'App B',
			tagline: 'A second bundle, so a cross-app request is a real one.',
			owner_display_name: null,
			owner_full_name: 'Sam Cruz',
			owner_class: null,
			published_version_id: FIXTURE_VERSION_B_LIVE,
			updated_at: '2026-08-21T09:00:00Z'
		}),
		/**
		 * THE ROOM-TO-RUN CASE, and the reason it is in this harness rather than
		 * only in the run harness: how much room an app gets is a property of the
		 * SURFACE around it -- a frame, in a detail pane, in a two-pane split, in
		 * the portal shell -- so measuring it anywhere else measures a different
		 * page. The bundle reports the scale it was given on `<html data-scale>`,
		 * which makes the gallery frame, full screen and the direct page three
		 * readings of one number instead of three screenshots.
		 */
		summary({
			id: FIXTURE_APP_PLAYFIELD,
			slug: 'wide-playfield',
			title: 'Wide playfield',
			tagline: 'A fixed 960x640 game that reports how much room it was given.',
			owner_display_name: null,
			owner_full_name: 'Wren Alvarez',
			owner_class: 'Engineering II',
			published_version_id: FIXTURE_VERSION_PLAYFIELD,
			updated_at: '2026-08-23T09:00:00Z'
		})
	];

	const version = (
		id: string,
		ordinal: number,
		status: 'approved' | 'submitted',
		fileCount: number,
		bytes: number,
		reviewedAt: string | null
	) => ({
		id,
		ordinal,
		status,
		byte_size: bytes,
		file_count: fileCount,
		created_at: '2026-08-18T08:40:00Z',
		reviewed_at: reviewedAt,
		review_note: null,
		reject_reason: null,
		manifest: {}
	});

	const liveFiles = (await listBundleFiles(FIXTURE_VERSION_A_LIVE)) ?? [];
	const staleFiles = (await listBundleFiles(FIXTURE_VERSION_A_STALE)) ?? [];
	const bFiles = (await listBundleFiles(FIXTURE_VERSION_B_LIVE)) ?? [];
	const playfieldFiles = (await listBundleFiles(FIXTURE_VERSION_PLAYFIELD)) ?? [];

	const bytesOf = (files: { byteSize: number }[]) =>
		files.reduce((n, f) => n + f.byteSize, 0);

	const detail = (
		row: FoundryAppSummary,
		versions: ReturnType<typeof version>[],
		description: string,
		buildNotes: string
	): FoundryApp => ({
		id: row.id,
		slug: row.slug,
		title: row.title,
		tagline: row.tagline,
		description,
		cover_path: null,
		build_notes: buildNotes,
		owner: FIXTURE_VIEWER,
		owner_display_name: row.owner_display_name,
		owner_full_name: row.owner_full_name,
		owner_class: row.owner_class,
		published_version_id: row.published_version_id,
		metadata_flagged_at: row.metadata_flagged_at,
		hidden_at: null,
		created_at: '2026-08-10T09:00:00Z',
		updated_at: row.updated_at,
		versions
	});

	const details: Record<string, FoundryApp> = {
		'hostile-probe': detail(
			apps[0],
			[
				version(FIXTURE_VERSION_A_STALE, 2, 'submitted', staleFiles.length, bytesOf(staleFiles), null),
				version(
					FIXTURE_VERSION_A_LIVE,
					1,
					'approved',
					liveFiles.length,
					bytesOf(liveFiles),
					'2026-08-18T10:00:00Z'
				)
			],
			'A page that tries, on load, to read its parent, navigate the top frame, open a window, fetch across origins and reach the portal API. Each attempt reports its own result on the page.',
			'Written by hand for this harness. Nothing generated, nothing borrowed.'
		),
		'wide-playfield': detail(
			apps[2],
			[
				version(
					FIXTURE_VERSION_PLAYFIELD,
					1,
					'approved',
					playfieldFiles.length,
					bytesOf(playfieldFiles),
					'2026-08-23T10:00:00Z'
				)
			],
			'A brick game on a fixed 960x640 playfield that scales to whatever box it is given, and writes the scale it got onto the document so three surfaces can be compared as numbers rather than described.',
			'Written by hand for this harness, as a stand-in for the published app this feature was asked for.'
		),
		'app-b': detail(
			apps[1],
			[version(FIXTURE_VERSION_B_LIVE, 1, 'approved', bFiles.length, bytesOf(bFiles), '2026-08-19T10:00:00Z')],
			'A second bundle with one file that app A does not have, so a cross-app request is a real request for a real file rather than a request for a missing one.',
			'Written by hand for this harness.'
		)
	};

	/**
	 * THE SOURCE BYTES, read here through the same two functions the real route
	 * calls, so the harness is exercising `$lib/server/foundry-bundle` rather
	 * than a second copy of it. Read eagerly because the page has no session and
	 * therefore cannot call `/api/foundry/source`, which is admin-gated.
	 */
	const sources: Record<string, Record<string, string>> = {};
	for (const versionId of [FIXTURE_VERSION_A_LIVE, FIXTURE_VERSION_A_STALE, FIXTURE_VERSION_B_LIVE]) {
		const files = (await listBundleFiles(versionId)) ?? [];
		sources[versionId] = {};
		for (const f of files) {
			const read = await readBundleFileText(
				versionId === FIXTURE_VERSION_B_LIVE ? FIXTURE_APP_B : FIXTURE_APP_A,
				versionId,
				f.path
			);
			sources[versionId][f.path] = read.ok ? read.text : `(${read.reason})`;
		}
	}

	return {
		/**
		 * The origin `AppStage` and `FoundryDetail` will build from, echoed so a
		 * drive can read what they are pointed at rather than inferring it from a
		 * 404 or a missing control. EMPTY IS A REAL ANSWER and is what the shipping
		 * default does when nothing is configured: no launch control and no share
		 * link.
		 */
		bundleOrigin: env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? '',
		/** So the harness's delete transport can key its partial-sweep answer. */
		appBId: FIXTURE_APP_B,
		apps,
		details,
		files: {
			[FIXTURE_VERSION_A_LIVE]: liveFiles,
			[FIXTURE_VERSION_A_STALE]: staleFiles,
			[FIXTURE_VERSION_B_LIVE]: bFiles,
			[FIXTURE_VERSION_PLAYFIELD]: playfieldFiles
		} as Record<string, FoundryBundleEntry[]>,
		sources
	};
};
