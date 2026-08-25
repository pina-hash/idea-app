import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { PageServerLoad } from './$types';

/**
 * RUN ONE REAL PUBLISHED BUNDLE. Dev only: 404 in production, no auth, no
 * fixture.
 *
 * WHY IT EXISTS SEPARATELY FROM `/dev/foundry-gallery`. That harness mounts the
 * gallery and the review queue against an in-memory fixture, which is the right
 * shape for driving their layout and their controls -- but the fixture's app and
 * version ids exist nowhere, so its frame can never load real bytes. This one is
 * the other half: no layout, no fixture, one `AppStage` pointed at an app and
 * version that have actually been through `foundry_create_version`, the ingest
 * function, review and publication.
 *
 * IT IS THE ONLY WAY TO SEE A BUNDLE RUN WITHOUT A SESSION. `/foundry` is behind
 * the signed-in tier and its gallery needs a real roster; this needs a Supabase
 * project that has ingested something, which the local stack can be
 * (`supabase start`, then publish through the real RPCs).
 *
 * `origin` IS AN OVERRIDE AND `AppStage`'s own default is the shipping path.
 * Passing `?origin=` points the pure URL builder at a different project --
 * the local stack while `.env` still names the placeholder one -- without the
 * component reaching for a second mechanism to be pointed anywhere.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	return {
		appId: url.searchParams.get('app') ?? '',
		versionId: url.searchParams.get('version') ?? '',
		title: url.searchParams.get('title') ?? 'Published bundle',
		origin: url.searchParams.get('origin') ?? PUBLIC_SUPABASE_URL,
		defaultOrigin: PUBLIC_SUPABASE_URL
	};
};
