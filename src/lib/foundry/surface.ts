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
 * WHETHER A VERSION CAN BE DELETED ON ITS OWN, as one predicate the control's
 * presence and the sentence beside it both read.
 *
 * The rule is the RPC's (`foundry_delete_version`, 0136) and it is one clause:
 * NOT the version the app currently publishes. Everything else -- a draft that
 * was a mistake, a rejected build, a superseded approved one, even a
 * submission still in the queue -- is the student's clutter and goes.
 *
 * THE LIVE ONE IS REFUSED BECAUSE OF WHAT IT WOULD LEAVE BEHIND, not because
 * of who is asking: an app still listed, still on the gallery, still resolved
 * by the serving route, and pointing at a version that no longer exists. An
 * ADMIN is refused it too. The way to remove a live build is to make another
 * approved version live first, or to delete the whole app -- which is allowed,
 * and takes the live build with it, because the thing being removed is the app.
 *
 * MIRRORING THE RPC RATHER THAN REPLACING IT. The database refuses what it
 * refuses; this decides whether to offer the control at all, so a student is
 * never shown a button whose only possible answer is a refusal.
 */
export function versionIsDeletable(
	version: Pick<FoundryVersion, 'id'>,
	publishedVersionId: string | null
): boolean {
	return version.id !== publishedVersionId;
}

/**
 * WHAT DELETING A WHOLE APP COSTS, in the numbers a student needs in front of
 * them before they press a button with no undo.
 *
 * A destructive action names what it costs with the REAL counts, and these
 * come off the payload the surface is already rendering rather than a second
 * read. `live` and `submitted` are called out separately from the count
 * because they are the two facts that change the answer: one means the thing
 * on the gallery goes with it, the other means a review somebody is part-way
 * through goes with it.
 */
export function deleteAppCost(app: FoundryApp): {
	versions: number;
	live: boolean;
	submitted: boolean;
} {
	return {
		versions: app.versions.length,
		live: app.published_version_id !== null,
		submitted: app.versions.some((v) => v.status === 'submitted')
	};
}

/**
 * That cost as the one sentence both surfaces show, so /foundry/mine and
 * /foundry/review cannot end up describing the same act differently.
 *
 * No em dashes, and the numbers are real rather than "everything".
 */
export function deleteAppCostLine(app: FoundryApp): string {
	const cost = deleteAppCost(app);
	// An app with no versions is an ordinary state (created, never uploaded to),
	// and "0 versions and every file stored for them" is not a sentence.
	let line =
		cost.versions === 0
			? 'This removes the app. Nothing has been uploaded to it yet.'
			: cost.versions === 1
				? 'This removes the app, its 1 version, and every file stored for it.'
				: `This removes the app, all ${cost.versions} versions, and every file stored for them.`;
	if (cost.live) line += ' The build that is live on the gallery goes with it.';
	if (cost.submitted) line += ' A build waiting for review goes with it.';
	return `${line} There is no undo.`;
}

/**
 * WHAT A PREVIEW DOES NOT PROVE, AS THE ONE SENTENCE EVERY SURFACE THAT OFFERS
 * A PREVIEW SHOWS.
 *
 * A preview answers on the PORTAL origin, and `foundryPreviewResponse` hands
 * the header builder the same origin twice -- so `allow-same-origin` cannot be
 * granted there in any configuration and the document is on an OPAQUE origin.
 * An opaque origin has no storage area, so the injected shim is the only
 * `localStorage` a preview has and nothing in it survives a reload. A PUBLISHED
 * app is served from the apps origin, which is a real origin and does get the
 * grant, so its saves persist.
 *
 * IT SAYS WHICH DIRECTION THE DIFFERENCE RUNS, which is the half that actually
 * helps: everything else about a preview is the published response, byte for
 * byte and header for header, minus that one sandbox flag. So a preview that
 * works is a published app that works, and only the reverse can surprise
 * anybody.
 *
 * ONE STRING, TWO SURFACES, for `deleteAppCostLine`'s reason. /foundry/mine
 * offers a preview per version and /foundry/submit offers one the moment an
 * upload unpacks; a student reads whichever they reach first, and two copies of
 * a sentence about storage are two copies that can stop agreeing about what
 * storage does. That is exactly the failure this bundle was written to fix.
 */
export const FOUNDRY_PREVIEW_STORAGE_NOTE =
	'A preview runs your app exactly as it will run published, with one difference: ' +
	'saved data does not survive a reload in a preview, and it does once the app is ' +
	'live. Anything that works in a preview works published.';

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

/**
 * THE AUTHOR'S NAME ON A PUBLIC FOUNDRY SURFACE: two rungs, never three.
 *
 * `display_name` when the student has chosen one, `full_name` otherwise, and
 * NOTHING after that. `displayName()` in `$lib/profile` is the portal's own
 * three-rung helper and its third rung is the EMAIL ADDRESS -- correct for a
 * profile menu the account holder is looking at, and a disclosure on a gallery
 * card every signed-in student can read. The two must not be confused, which is
 * why this is a separate function with a Foundry-specific name rather than a
 * call to that one with a flag.
 *
 * NULL IS THE ANSWER WHEN THERE IS NO NAME, and the surfaces render nothing for
 * it. An empty string would be a rendered blank where a name goes; a fallback
 * like "Unknown" would be a label invented for a row whose profile has simply
 * not been filled in yet.
 *
 * SAMPLED AGAINST PRODUCTION: of ten students checked, none had chosen a
 * display name, so `full_name` is the NORMAL path here and not an exceptional
 * fallback. That is the reason this is pinned by a test rather than by a
 * comment -- the rung that runs every time is the rung a refactor is most
 * likely to "simplify" away, and its regression is a name that quietly becomes
 * an email address in front of the whole school.
 */
export function foundryAuthorName(owner: {
	owner_display_name?: string | null;
	owner_full_name?: string | null;
}): string | null {
	const chosen = (owner.owner_display_name ?? '').trim();
	if (chosen) return chosen;
	const full = (owner.owner_full_name ?? '').trim();
	return full || null;
}

/**
 * The author's class, or null. A pass-through with the trimming done once.
 *
 * It exists so that no surface writes `owner_class ?? ''` and then renders a
 * label beside an empty string. `owner_class` is null for an app that outlives
 * its author's enrollment, for a roster import that lags a term, for a
 * transfer, and for an alumnus -- all normal states (0132), none of which is a
 * reason to render a placeholder, a colon, or an empty chip.
 */
export function foundryAuthorClass(owner: { owner_class?: string | null }): string | null {
	const label = (owner.owner_class ?? '').trim();
	return label || null;
}

/**
 * The one line under a gallery card's title: the name, then the class, joined
 * only when BOTH are there.
 *
 * Returning the assembled string rather than leaving each surface to write
 * `{name}{cls ? ' · ' + cls : ''}` is the point: that expression is where a
 * stray separator survives a null and a card reads "Ana Reyes ·".
 */
export function foundryAuthorLine(owner: {
	owner_display_name?: string | null;
	owner_full_name?: string | null;
	owner_class?: string | null;
}): string {
	const name = foundryAuthorName(owner);
	const cls = foundryAuthorClass(owner);
	if (name && cls) return `${name} · ${cls}`;
	return name ?? cls ?? '';
}
