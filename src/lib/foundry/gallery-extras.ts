/**
 * THE GALLERY'S CURATION LAYERS (ledger 0380, migration 0237): an admin's
 * replacement details for a release (report c5f811e4), collections (report
 * 762bb647), the featured row (report 415af89e) and the viewer's own votes
 * (report 8274b260).
 *
 * Pure and client-safe: no DOM, no Svelte. Every surface that asks "what does
 * this card say", "which cards are in this collection" or "who fills the
 * featured row" asks this module, so the gallery, the admin editor and the
 * tests cannot disagree.
 *
 * ===========================================================================
 * A SUBJECT IS HOW EVERY LAYER NAMES A CARD
 * ===========================================================================
 *
 * `app:<uuid>` for a Foundry app and `house:<id>` for one of IDEA's own games.
 * It is the same string in the database (`foundry_gallery_overrides`,
 * `foundry_collection_members`, `foundry_featured`), so there is no mapping to
 * get wrong.
 *
 * "CANNOT TELL" IS NOT "NONE". Every layer arrives through a read that fails
 * on a database without 0237, and the route turns that failure into `null`.
 * `null` means the gallery draws exactly what it drew before; an EMPTY list
 * means 0237 is there and nothing is configured, which also draws nothing. The
 * difference matters only to the admin editor, which says "not available yet"
 * for the first.
 */

import { sortGallery, type FoundryPlayCounts } from './telemetry.ts';
import type { FoundryHouseRelease } from './major.ts';

export const FOUNDRY_FEATURED_TITLE = 'Featured';
export const FOUNDRY_FEATURED_NOTE =
	'Picked by IDEA staff, with the most played and most talked about filling any space left over.';
export const FOUNDRY_COLLECTIONS_TITLE = 'Collections';
export const FOUNDRY_COLLECTIONS_NOTE = 'Sets of games picked out by IDEA staff. Open one to see what is in it.';
export const FOUNDRY_GALLERY_ADMIN_NOT_READY =
	'Gallery curation is not available yet. It arrives with the next database update.';

/** How many cards the featured row holds, picks and fill together. */
export const FOUNDRY_FEATURED_SLOTS = 6;
/** The most picks an admin can make, which the database enforces too. */
export const FOUNDRY_FEATURED_MAX_PICKS = 12;

export type FoundrySubject = `app:${string}` | `house:${string}`;

export const appSubject = (id: string): FoundrySubject => `app:${id}`;
export const houseSubject = (id: string): FoundrySubject => `house:${id}`;

/** One row of `foundry_gallery_overrides_read`. A null field means "use the default". */
export interface FoundryGalleryOverride {
	subject: string;
	title: string | null;
	description: string | null;
	thumbnail_path: string | null;
}

export type FoundryOverrideMap = Record<string, FoundryGalleryOverride>;

/** The rows as the map the surfaces read. Anything that is not a row is dropped. */
export function foundryOverrideMap(rows: unknown): FoundryOverrideMap {
	const out: FoundryOverrideMap = {};
	if (!Array.isArray(rows)) return out;
	for (const r of rows) {
		if (!r || typeof r !== 'object') continue;
		const row = r as Record<string, unknown>;
		if (typeof row.subject !== 'string' || row.subject === '') continue;
		out[row.subject] = {
			subject: row.subject,
			title: typeof row.title === 'string' && row.title !== '' ? row.title : null,
			description: typeof row.description === 'string' && row.description !== '' ? row.description : null,
			thumbnail_path:
				typeof row.thumbnail_path === 'string' && row.thumbnail_path !== '' ? row.thumbnail_path : null
		};
	}
	return out;
}

/**
 * A card's details after an admin's overrides: each field the admin set
 * replaces the default and each field left null keeps it. The student's own
 * app record is never the thing changed; this is the gallery's presentation.
 */
export function applyAppOverride<
	T extends { id: string; title: string; tagline: string | null; cover_path: string | null }
>(app: T, overrides: FoundryOverrideMap): T {
	const o = overrides[appSubject(app.id)];
	if (!o) return app;
	return {
		...app,
		title: o.title ?? app.title,
		tagline: o.description ?? app.tagline,
		cover_path: o.thumbnail_path ?? app.cover_path
	};
}

/** The house release with its overrides. `thumb` is a storage path the gallery turns into a URL. */
export function applyHouseOverride(
	release: FoundryHouseRelease,
	overrides: FoundryOverrideMap
): FoundryHouseRelease {
	const o = overrides[houseSubject(release.id)];
	if (!o) return release;
	return {
		...release,
		title: o.title ?? release.title,
		sub: o.description ?? release.sub,
		thumb: o.thumbnail_path ?? release.thumb ?? null
	};
}

/** One collection as `foundry_collections_read` returns it. */
export interface FoundryCollection {
	id: string;
	title: string;
	description: string | null;
	published: boolean;
	members: { subject: string; live?: boolean }[];
}

/** The read's answer as collections, or [] for anything that is not an array of them. */
export function foundryCollections(rows: unknown): FoundryCollection[] {
	if (!Array.isArray(rows)) return [];
	const out: FoundryCollection[] = [];
	for (const r of rows) {
		if (!r || typeof r !== 'object') continue;
		const row = r as Record<string, unknown>;
		if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
		const members = Array.isArray(row.members)
			? row.members
					.filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
					.filter((m) => typeof m.subject === 'string')
					.map((m) => ({ subject: m.subject as string, live: m.live !== false }))
			: [];
		out.push({
			id: row.id,
			title: row.title,
			description: typeof row.description === 'string' ? row.description : null,
			published: row.published === true,
			members
		});
	}
	return out;
}

/** What a subject resolved to on this gallery. */
export type FoundryResolved<A> =
	| { kind: 'app'; subject: string; app: A }
	| { kind: 'house'; subject: string; release: FoundryHouseRelease };

/**
 * Subjects as cards, IN THE ORDER GIVEN. A subject the gallery does not hold
 * (an app that is hidden or unpublished, a house release the registry no
 * longer lists) is dropped rather than drawn as a hole: the database already
 * refuses to hand one over, and this is the second layer.
 */
export function resolveSubjects<A extends { id: string }>(
	subjects: readonly string[],
	apps: readonly A[],
	houses: readonly FoundryHouseRelease[]
): FoundryResolved<A>[] {
	const byApp = new Map(apps.map((a) => [a.id, a]));
	const byHouse = new Map(houses.map((h) => [h.id as string, h]));
	const out: FoundryResolved<A>[] = [];
	const seen = new Set<string>();
	for (const subject of subjects) {
		if (seen.has(subject)) continue;
		seen.add(subject);
		if (subject.startsWith('app:')) {
			const app = byApp.get(subject.slice(4));
			if (app) out.push({ kind: 'app', subject, app });
		} else if (subject.startsWith('house:')) {
			const release = byHouse.get(subject.slice(6));
			if (release) out.push({ kind: 'house', subject, release });
		}
	}
	return out;
}

/**
 * THE FEATURED ROW: the admin's picks first, in their order, then any slots
 * left filled from the top of the leaderboards. The fill takes the best of
 * Most played and Trending alternately (a game people are playing, then a game
 * that is climbing), skipping what is already in the row.
 *
 * WITH NO PICKS THE ROW IS EMPTY, NOT ALL FILL. A row drawn from the
 * leaderboards alone would repeat the top of the list directly under the major
 * releases, so a gallery nobody has curated renders exactly as it did.
 */
export function foundryFeaturedRow<A extends { id: string; created_at?: string | null; version_count?: number | null }>(
	picks: readonly string[],
	apps: readonly A[],
	houses: readonly FoundryHouseRelease[],
	counts: FoundryPlayCounts,
	slots = FOUNDRY_FEATURED_SLOTS
): FoundryResolved<A>[] {
	const chosen = resolveSubjects(picks, apps, houses);
	if (chosen.length === 0) return [];
	const row = chosen.slice(0, Math.max(slots, chosen.length));
	if (row.length >= slots) return row;
	const have = new Set(row.map((r) => r.subject));
	const played = sortGallery(apps, counts, 'played');
	const rising = sortGallery(apps, counts, 'trending');
	for (let i = 0; row.length < slots && (i < played.length || i < rising.length); i++) {
		for (const list of [played, rising]) {
			const app = list[i];
			if (!app || row.length >= slots) continue;
			// Nothing that has not earned a place: an app with no plays and no votes
			// is not "the top of a leaderboard", it is just the first on a tied list.
			const c = counts[app.id];
			if (!c || (c.plays <= 0 && (c.netVotes ?? 0) <= 0)) continue;
			const subject = appSubject(app.id);
			if (have.has(subject)) continue;
			have.add(subject);
			row.push({ kind: 'app', subject, app });
		}
	}
	return row;
}

/** What pressing up or down does to a vote already held: the same direction takes it back. */
export function nextVote(current: -1 | 0 | 1, pressed: -1 | 1): -1 | 0 | 1 {
	return current === pressed ? 0 : pressed;
}

/** The net figure after the viewer's vote moves from `from` to `to`. */
export function netAfterVote(net: number, from: -1 | 0 | 1, to: -1 | 0 | 1): number {
	return net - from + to;
}

/** The sentence for a refused vote. */
export function voteRefusalSentence(reason: string | undefined): string {
	switch (reason) {
		case 'own_app':
			return 'You cannot vote on your own game.';
		case 'not_votable':
			return 'This game cannot be voted on right now.';
		case 'unavailable':
			return 'Voting is not available yet. It arrives with the next database update.';
		default:
			return 'That vote did not go through. Try again.';
	}
}

/** The admin editor's write outcome: a landed write, or the sentence to show. */
export type FoundryAdminOutcome = { ok: true; id?: string } | { ok: false; message: string };

/**
 * The admin curation page's transports, injected by the route. Every one is an
 * admin-only RPC that re-checks `is_admin()` in its own body, so none of this
 * is the boundary.
 */
export interface FoundryGalleryAdminTransports {
	saveOverride: (
		subject: string,
		fields: { title: string | null; description: string | null; thumbnail_path: string | null }
	) => Promise<FoundryAdminOutcome>;
	uploadThumb?: (file: File) => Promise<{ ok: true; path: string } | { ok: false; message: string }>;
	saveCollection: (
		id: string | null,
		title: string,
		description: string,
		members: string[]
	) => Promise<FoundryAdminOutcome>;
	setCollectionPublished: (id: string, published: boolean) => Promise<FoundryAdminOutcome>;
	deleteCollection: (id: string) => Promise<FoundryAdminOutcome>;
	orderCollections: (ids: string[]) => Promise<FoundryAdminOutcome>;
	saveFeatured: (subjects: string[]) => Promise<FoundryAdminOutcome>;
}

/** The sentence for a refused admin curation write, by the database's reason. */
export function adminRefusalSentence(reason: unknown, fallback?: string): string {
	switch (reason) {
		case 'title':
			return 'A collection needs a name of 60 characters or fewer.';
		case 'title_length':
			return 'That title is too long (80 characters at most).';
		case 'description_length':
			return 'That description is too long.';
		case 'thumbnail':
			return 'That picture could not be used. Choose it again.';
		case 'member':
		case 'subject':
			return 'One of those games is not something the gallery can hold.';
		case 'member_not_found':
		case 'not_found':
			return 'One of those games no longer exists. Reload the page and try again.';
		case 'too_many_members':
			return 'A collection holds at most 60 games.';
		case 'too_many_collections':
			return 'There are already 30 collections, the most the gallery holds.';
		case 'too_many':
			return 'That is more than the list holds.';
		default:
			return fallback ?? 'That did not go through. Try again.';
	}
}
