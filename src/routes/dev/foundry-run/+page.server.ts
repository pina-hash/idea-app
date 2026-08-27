import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
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
 * the signed-in tier and its gallery needs a real roster. Point this at a real
 * app and version from a Supabase project that has ingested something, or at
 * one of the in-memory fixtures in `$lib/server/foundry-dev-fixture` -- the
 * three acceptance bundles are registered there under fixed ids, so the route,
 * its publication gate, its headers and its shim injection can all be driven
 * with no database and no Storage.
 *
 * `origin` IS AN OVERRIDE. Passing `?origin=` points the pure URL builder at
 * another host without the component reaching for a second mechanism to be
 * pointed anywhere.
 *
 * THE DEV DEFAULT IS THIS SERVER'S OWN ORIGIN rather than `AppStage`'s. That
 * component deliberately renders NO launch control when
 * PUBLIC_FOUNDRY_APPS_ORIGIN is unset, because serving bundles off the main,
 * cookie-carrying host silently is the one failure nobody would notice -- so a
 * harness with nothing configured would show an empty box and prove nothing.
 * Locally the two hosts are the same host anyway.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	const configured = (env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? '').trim() || url.origin;

	return {
		appId: url.searchParams.get('app') ?? '',
		versionId: url.searchParams.get('version') ?? '',
		title: url.searchParams.get('title') ?? 'Published bundle',
		origin: url.searchParams.get('origin') ?? configured,
		defaultOrigin: configured
	};
};
