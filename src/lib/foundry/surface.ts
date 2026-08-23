/**
 * The pure arithmetic behind the Foundry student surfaces.
 *
 * Plain data and pure functions, no Svelte and no transports, so the rules
 * about which version can be rolled back to and what a status word means are
 * assertable without a browser -- and, more to the point, are stated ONCE
 * rather than re-derived inline in two components that will stop agreeing.
 */

import type { FoundryApp, FoundryVersion, FoundryVersionStatus } from './transports.ts';

/**
 * THE ADDRESS, DERIVED FROM THE TITLE, AND IT IS A SUGGESTION RATHER THAN A
 * DERIVATION.
 *
 * `/foundry/<slug>` is a printed, shared, QR-coded address and
 * `foundry_update_app_metadata` refuses to change it BY NAME, so the value
 * chosen at creation is permanent. That is why the field is editable and
 * pre-filled rather than computed and hidden: a student who is going to live
 * with a name forever should see it before it is fixed.
 *
 * The shape mirrors `_foundry_slug_ok` -- 2 to 64 characters of lowercase
 * letters, digits and single hyphens, starting and ending with a letter or
 * digit -- but this is a CONVENIENCE, not the check. The database refuses what
 * it refuses; this only tries to produce something that will pass.
 */
export function suggestSlug(title: string): string {
	const base = title
		.toLowerCase()
		.normalize('NFKD')
		// Strip the combining marks NFKD just separated, so "Café" becomes
		// "cafe" rather than losing the whole letter to the class below.
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
	return base.slice(0, 64).replace(/-+$/, '');
}

/** Mirrors `_foundry_slug_ok`, for the field's own inline hint only. */
export function slugLooksOk(slug: string): boolean {
	return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$/.test(slug) && slug.length >= 2 && slug.length <= 64;
}

/**
 * The word a student reads for a version's state.
 *
 * `published` is not a status on the row -- it is the app's
 * `published_version_id` pointing here -- and that distinction matters enough
 * to show: an approved version that is not the live one is a rollback target,
 * and an approved version that IS the live one is the app.
 */
export function versionLabel(
	version: FoundryVersion,
	publishedVersionId: string | null
): { word: string; tone: 'live' | 'waiting' | 'ok' | 'refused' | 'quiet' } {
	if (version.id === publishedVersionId) return { word: 'Live', tone: 'live' };
	switch (version.status) {
		case 'submitted':
			return { word: 'Waiting for review', tone: 'waiting' };
		case 'approved':
			return { word: 'Approved', tone: 'ok' };
		case 'rejected':
			return { word: 'Sent back', tone: 'refused' };
		default:
			return { word: 'Draft', tone: 'quiet' };
	}
}

/**
 * WHICH VERSIONS CAN BE ROLLED BACK TO, AND WHY THAT NEEDS NO RE-REVIEW.
 *
 * Publishing is a pointer move: `foundry_set_published_version` writes one
 * column. A version that has already been APPROVED has already had its files
 * extracted into the bundle bucket and has already been read by staff, so
 * pointing at it again puts back something that was live before. Nothing about
 * the build changed, so there is nothing new to review.
 *
 * The version that is ALREADY live is not a rollback target -- it is the
 * current state, and offering it as a choice is offering to do nothing.
 */
export function rollbackTargets(app: FoundryApp): FoundryVersion[] {
	return app.versions.filter((v) => v.status === 'approved' && v.id !== app.published_version_id);
}

/** The one submitted version, if any. The schema allows at most one per app. */
export function submittedVersion(app: FoundryApp): FoundryVersion | null {
	return app.versions.find((v) => v.status === 'submitted') ?? null;
}

/** Drafts, newest first, which are the versions that can still be submitted. */
export function draftVersions(app: FoundryApp): FoundryVersion[] {
	return app.versions.filter((v) => v.status === 'draft');
}

/**
 * A draft can only be submitted once it has been through ingest.
 *
 * A version row exists from the moment `foundry_create_version` returns, which
 * is BEFORE the zip has been unpacked -- so a draft with no files is a version
 * whose upload failed partway. Submitting one would put an empty bundle in the
 * review queue, and the reviewer's only possible answer would be a rejection
 * about something the student never saw.
 */
export function draftIsSubmittable(version: FoundryVersion): boolean {
	return version.status === 'draft' && version.file_count > 0;
}

/**
 * WHICH METADATA FIELDS GO LIVE IMMEDIATELY, stated as data rather than as a
 * branch in the markup.
 *
 * After first approval the app is on the gallery, so an edit to any of these is
 * visible the moment it is saved -- and `foundry_update_app_metadata` stamps
 * `metadata_flagged_at` so staff can see that what is on the page is no longer
 * what they approved. The surface has to SAY that before the edit, not after.
 */
export const FOUNDRY_METADATA_FIELDS = [
	{ field: 'title', label: 'Name', kind: 'line' as const, max: 120 },
	{ field: 'tagline', label: 'Tagline', kind: 'line' as const, max: 200 },
	{ field: 'description', label: 'Description', kind: 'text' as const, max: 4000 },
	{ field: 'build_notes', label: 'How this was built', kind: 'text' as const, max: 8000 }
];

/** True once an edit to metadata would be visible to anyone but the owner. */
export function metadataIsLive(app: { published_version_id: string | null }): boolean {
	return app.published_version_id !== null;
}

/** Status counts for a list row's summary line. */
export function statusSummary(versions: FoundryVersion[]): Record<FoundryVersionStatus, number> {
	const out: Record<FoundryVersionStatus, number> = {
		draft: 0,
		submitted: 0,
		approved: 0,
		rejected: 0
	};
	for (const v of versions) out[v.status] += 1;
	return out;
}
