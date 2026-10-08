/**
 * MAJOR RELEASES: an administrator's curation of ONE APP (report 927b1c69,
 * Mr. Pina, 2026-10-07).
 *
 * A major release is an original game a student built from scratch and put
 * serious work into, as opposed to a port of an existing one. An admin marks
 * it from the review console's inspector (`foundry_set_app_major`, 0233), and
 * the gallery shows it in a "Major releases" section above the full list. It
 * is a property of an APP and never of a person; the trusted-publisher roster
 * (0173, decision 06) is the per-student thing and is unrelated.
 *
 * Pure and client-safe: no DOM, no Svelte. Every surface that asks "is this a
 * major release", "can the control be offered" or "what does the console say"
 * asks this module, so the badge, the section, the inspector and the route's
 * refusal sentence cannot disagree.
 *
 * ===========================================================================
 * "CANNOT TELL" IS NOT "NO"
 * ===========================================================================
 *
 * 0233 is applied by hand, so a deployment running this client against a
 * database without it is a real state. There the payload carries NO
 * `major_release_at` key at all: `isMajorRelease` reads that as not major
 * (nothing is drawn, which is also the truth), and `majorReleaseReady` reads it
 * as "this deployment cannot tell", which offers no control. A control offered
 * there would only ever answer "not switched on yet".
 */

import { PORTAL_APPS, type PortalApp } from '../portal-apps.ts';

/** The one word for the mark, on a card, in a detail pane and in the console. */
export const FOUNDRY_MAJOR_WORD = 'Major release';

/** The gallery section's heading. */
export const FOUNDRY_MAJOR_SECTION_TITLE = 'Major releases';

/** One line under that heading, saying what the section is and who chose it. */
export const FOUNDRY_MAJOR_SECTION_NOTE =
	'Original games their makers built from scratch and put serious work into, picked out by IDEA staff.';

/** The heading over the full list, which is drawn only while the section is. */
export const FOUNDRY_ALL_APPS_TITLE = 'All apps';

/** What a house card says it is. */
export const FOUNDRY_HOUSE_KICKER = 'IDEA original';

/** The console's sentence on a deployment the migration has not reached. */
export const FOUNDRY_MAJOR_NOT_READY = 'This deployment cannot show major releases yet.';

/** What marking does, said before the press. */
export const FOUNDRY_MAJOR_OFFER =
	'Marking it puts it in the Major releases section at the top of the gallery, as well as in the full list. Nothing about the app itself changes.';

/** Whether this app is a major release. Absent, null and empty are all "no". */
export function isMajorRelease(app: { major_release_at?: string | null }): boolean {
	return typeof app.major_release_at === 'string' && app.major_release_at.length > 0;
}

/**
 * Whether this payload can SAY whether the app is a major release: the key is
 * present, null included. The capability reports itself, from the row that
 * arrived, rather than from a flag somebody has to remember to set.
 */
export function majorReleaseReady(app: object): boolean {
	return 'major_release_at' in app;
}

/**
 * The structured reason `foundry_set_app_major` would refuse a MARK with, in
 * the order it checks, or null when a mark would land. Unmarking is never
 * refused, so there is no counterpart for it.
 */
export function majorMarkBlocker(app: {
	published_version_id: string | null;
	hidden_at: string | null;
}): 'hidden' | 'not_published' | null {
	if (app.hidden_at) return 'hidden';
	if (!app.published_version_id) return 'not_published';
	return null;
}

/** The mirror of the RPC's own mark rule, so no control is offered whose only answer is a refusal. */
export function majorCanMark(app: {
	published_version_id: string | null;
	hidden_at: string | null;
}): boolean {
	return majorMarkBlocker(app) === null;
}

/**
 * A refusal as a person reads it. The structured reasons get a sentence each;
 * anything else is the database's own message, verbatim, because it is
 * already written for a person and a rewrite would say less.
 */
export function majorRefusalSentence(r: { reason?: string; message?: string }): string {
	switch (r.reason) {
		case 'not_found':
			return 'That app no longer exists.';
		case 'hidden':
			return 'This app is hidden. Restore it before making it a major release.';
		case 'not_published':
			return 'Nothing is published for this app yet, so it cannot be a major release.';
		case 'unavailable':
			return 'Major releases are not switched on for this deployment yet.';
		default:
			return r.message ?? 'That did not go through. Try again.';
	}
}

/**
 * The acknowledgement of a LANDED write, which says whether anything changed:
 * a double click or a second tab answers ok with nothing to do, and claiming a
 * write there would be a false sentence.
 */
export function majorAckSentence(major: boolean, changed: boolean): string {
	if (major) {
		return changed
			? 'Marked as a major release. It is in the Major releases section at the top of the gallery.'
			: 'It was already a major release.';
	}
	return changed
		? 'No longer a major release. It is still on the gallery with every other app.'
		: 'It was not a major release.';
}

/* -------------------------------------------------------------------------
 * THE HOUSE RELEASES: IDEA GREENLINE AND IDEA VANGUARD.
 *
 * Mr. Pina named them as the examples of what the section is for. They are
 * not Foundry apps -- GREENLINE is a route of this site and VANGUARD a page
 * with serve-time injection a sandboxed bundle would never get -- so they
 * cannot be marked. They appear as LINK CARDS at the end of the section, built
 * from `PORTAL_APPS` (title, line and address READ, never retyped), outside
 * the sort, the search and every count, because they have no Foundry data.
 *
 * THEY REACH THE GALLERY ONLY THROUGH A PROP THE /foundry ROUTE PASSES. The
 * gallery defaults it to none, so every harness and test that mounts it
 * without the prop is unchanged, and taking them off the real page is
 * deleting one prop.
 * ---------------------------------------------------------------------- */

export const FOUNDRY_HOUSE_RELEASE_IDS = ['greenline', 'vanguard'] as const;
export type FoundryHouseReleaseId = (typeof FOUNDRY_HOUSE_RELEASE_IDS)[number];

export interface FoundryHouseRelease {
	id: FoundryHouseReleaseId;
	title: string;
	sub: string;
	href: string;
}

/**
 * The house cards, in `FOUNDRY_HOUSE_RELEASE_IDS` order. An id that is not in
 * the portal registry, or is an admin-only app, is LEFT OUT rather than
 * invented: a student gallery must never surface an admin-only door, and a
 * card with no registry entry would be an address somebody typed.
 */
export function foundryHouseReleases(apps: readonly PortalApp[] = PORTAL_APPS): FoundryHouseRelease[] {
	const out: FoundryHouseRelease[] = [];
	for (const id of FOUNDRY_HOUSE_RELEASE_IDS) {
		const entry = apps.find((a) => a.id === id);
		if (!entry || entry.adminOnly) continue;
		out.push({ id, title: entry.title, sub: entry.sub, href: entry.href });
	}
	return out;
}
