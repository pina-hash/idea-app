import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { FOUNDRY_PROXY_PREFIX, normalizeHost } from '$lib/foundry/host';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_B,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_B_LIVE,
	FIXTURE_VIEWER
} from '$lib/server/foundry-dev-fixture';
import {
	listBundleFiles,
	readBundleFileText,
	type FoundryBundleEntry
} from '$lib/server/foundry-bundle';
import { mintFoundryToken } from '$lib/server/foundry-token';
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
 *   MIRRORED  the components themselves; the tokens (real HMAC over the real
 *             payload layout, real expiry in the signed bytes, verified by the
 *             real `verifyFoundryToken` on the way back in); the REVIEW kind,
 *             minted here for a version that is NOT published, which is the
 *             whole reason that kind exists; the proxy, the CSP, the shim, the
 *             MIME allowlist and the iframe sandbox, all of which the frame's
 *             src goes through untouched; the file list and the source bytes,
 *             read through the same `$lib/server/foundry-bundle` functions the
 *             real source route calls.
 *
 *   NOT       the ADMIN GATE. `/foundry/review` 404s a non-admin in its load
 *             and `/api/foundry/source` 404s one in its handler; both need a
 *             real session, so neither runs here. The review surface below is
 *             reachable in dev by anybody, which is true of every `/dev` route
 *             and is why they all 404 in production.
 *   NOT       the mint ROUTE. Its session read and its row read need a real
 *             project, so the tokens here are minted directly. Its own
 *             refusals -- hidden app, nothing published, a non-admin asking for
 *             a review token -- are unexercised locally and are called out in
 *             the report.
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

	const appsHost = normalizeHost(publicEnv.PUBLIC_FOUNDRY_APPS_HOST);
	const nowSeconds = Math.floor(Date.now() / 1000);

	const srcFor = (appId: string, versionId: string, kind: 'published' | 'review') => {
		const token = mintFoundryToken(
			{ appId, versionId, viewerId: FIXTURE_VIEWER, kind, nowSeconds },
			true
		);
		return token && appsHost ? `http://${appsHost}${FOUNDRY_PROXY_PREFIX}/${token}/` : '';
	};

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
		configured: Boolean(appsHost),
		appsHost,
		apps,
		details,
		files: {
			[FIXTURE_VERSION_A_LIVE]: liveFiles,
			[FIXTURE_VERSION_A_STALE]: staleFiles,
			[FIXTURE_VERSION_B_LIVE]: bFiles
		} as Record<string, FoundryBundleEntry[]>,
		sources,
		/**
		 * The frame sources, minted per (app, version). The REVIEW one names
		 * A_STALE, which is not the app's published version -- a `published`
		 * token for it resolves to `not_published` and 404s, which is exactly the
		 * refusal the review kind exists to lift and is worth driving both ways.
		 */
		srcs: ({
			[`${FIXTURE_APP_A}:${FIXTURE_VERSION_A_LIVE}`]: srcFor(
				FIXTURE_APP_A,
				FIXTURE_VERSION_A_LIVE,
				'published'
			),
			[`${FIXTURE_APP_B}:${FIXTURE_VERSION_B_LIVE}`]: srcFor(
				FIXTURE_APP_B,
				FIXTURE_VERSION_B_LIVE,
				'published'
			),
			[`${FIXTURE_APP_A}:${FIXTURE_VERSION_A_STALE}`]: srcFor(
				FIXTURE_APP_A,
				FIXTURE_VERSION_A_STALE,
				'review'
			)
		}) as Record<string, string>,
		/** The same unpublished version with a PUBLISHED token: must 404. */
		staleWithPublishedToken: srcFor(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, 'published')
	};
};
