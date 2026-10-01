/**
 * THE GAME REQUEST BOARD, ON THE CLIENT SIDE OF IT (report b2ba6d74, ledger
 * 0360).
 *
 * WHAT WAS DECIDED. Mr. Pina, 2026-09-30: "this will be done between students
 * for now. transactions off the site." So this is a BOARD and nothing else: a
 * student posts what game they would like somebody to make, with a message,
 * and may state an offer in free text. Nothing here, and nothing in the 0230
 * functions behind it, reads, writes or names a coin table or a coin function.
 * The board says so in words beside every offer, so nobody reads "Offer: 20
 * coins" as something the site will pay out.
 *
 * WHO IS SHOWN IS A CHOSEN NAME, NEVER AN ADDRESS. The requester is named
 * through `foundryAuthorName` over the two profile columns the definer
 * projects, the same ladder every other Foundry surface uses, and the form
 * says before posting that the name is shown.
 *
 * PURE, CLIENT-SAFE, NO SVELTE. The post predicate is what both the button
 * and the handler ask, and every limit is 0230's own number.
 */

export interface FoundryGameRequest {
	id: string;
	title: string;
	body: string;
	offer: string | null;
	status: 'open' | 'closed';
	created_at: string;
	closed_at: string | null;
	/** The requester's uuid. The author-page key; never shown as text. */
	owner: string;
	owner_display_name: string | null;
	owner_full_name: string | null;
	/** The caller posted it. */
	mine: boolean;
	/** The published app that answered it, when this caller may see that app. */
	fulfilled: { slug: string; title: string } | null;
	/** Projected ONLY to an admin and to the requester. Absent for everybody else. */
	hidden?: boolean;
}

export const REQUEST_TITLE_MAX = 80;
export const REQUEST_BODY_MAX = 1000;
export const REQUEST_OFFER_MAX = 120;
export const REQUEST_OPEN_MAX = 3;
export const REQUEST_GAP_SECONDS = 120;

export const FOUNDRY_REQUEST_OFFER_NOTE =
	'Offers are between you and whoever makes the game. The site does not move IDEA Coins for requests.';

export const FOUNDRY_REQUEST_NAME_NOTE =
	'Your name is shown on your request. Nothing else about you is.';

export const FOUNDRY_REQUEST_UNAVAILABLE_NOTE =
	'The request board is not switched on yet on this site. It arrives with the next database update.';

/** `_foundry_norm`, the same mirror `publisher.ts` uses. */
export function requestNorm(value: string | null | undefined): string {
	return (value ?? '').replace(/^\s+|\s+$/g, '');
}

function len(value: string): number {
	return [...value].length;
}

export interface FoundryRequestDraft {
	title: string;
	body: string;
	offer: string;
}

export type RequestPostVerdict =
	| { ok: true }
	| { ok: false; reason: 'blank' | 'too_long'; field: 'title' | 'body' | 'offer'; limit?: number };

/**
 * MAY THIS REQUEST BE POSTED, in 0230's own order: a blank title, a blank
 * message, then each length. The per-person limits (three open, two minutes
 * apart) are the database's alone, because only it can count.
 */
export function requestCanPost(draft: FoundryRequestDraft): RequestPostVerdict {
	const title = requestNorm(draft.title);
	const body = requestNorm(draft.body);
	const offer = requestNorm(draft.offer);
	if (!title) return { ok: false, reason: 'blank', field: 'title' };
	if (!body) return { ok: false, reason: 'blank', field: 'body' };
	if (len(title) > REQUEST_TITLE_MAX) {
		return { ok: false, reason: 'too_long', field: 'title', limit: REQUEST_TITLE_MAX };
	}
	if (len(body) > REQUEST_BODY_MAX) {
		return { ok: false, reason: 'too_long', field: 'body', limit: REQUEST_BODY_MAX };
	}
	if (offer && len(offer) > REQUEST_OFFER_MAX) {
		return { ok: false, reason: 'too_long', field: 'offer', limit: REQUEST_OFFER_MAX };
	}
	return { ok: true };
}

const FIELD_WORD: Record<string, string> = {
	title: 'The game you want',
	body: 'The message',
	offer: 'The offer'
};

/** Every refusal the board's RPCs can give, as a sentence. NO EM DASHES. */
export function requestRefusalSentence(
	reason: string | null | undefined,
	extra: { field?: string | null; limit?: number | null; retryAfterSeconds?: number | null } = {}
): string {
	const field = extra.field ? (FIELD_WORD[extra.field] ?? 'One box') : 'One box';
	switch (reason) {
		case 'blank':
			return `${field} needs some words.`;
		case 'too_long':
			return extra.limit != null
				? `${field} is longer than ${extra.limit} characters. Shorten it and post again.`
				: `${field} is too long. Shorten it and post again.`;
		case 'too_many_open':
			return `You already have ${extra.limit ?? REQUEST_OPEN_MAX} open requests. Close one before posting another.`;
		case 'too_soon': {
			const s = Math.max(1, Math.ceil(extra.retryAfterSeconds ?? REQUEST_GAP_SECONDS));
			const words = s >= 60 ? `${Math.ceil(s / 60)} minute${Math.ceil(s / 60) === 1 ? '' : 's'}` : `${s} seconds`;
			return `You just posted a request. You can post another in about ${words}.`;
		}
		case 'not_eligible':
			return 'Only a Bosco Tech account can post a request.';
		case 'foundry_off':
			return 'The Foundry is turned off right now, so new requests are not being taken.';
		case 'not_found':
			return 'That request is not there any more. Reload the page.';
		case 'no_such_app':
			return 'No published app has that address. Copy it from the gallery, or leave the box empty.';
		case 'unavailable':
			return FOUNDRY_REQUEST_UNAVAILABLE_NOTE;
		default:
			return 'That did not go through. Try again.';
	}
}

/**
 * THE APP ADDRESS A REQUESTER TYPES WHEN CLOSING, as the slug the RPC takes.
 * They may paste the whole gallery link (`.../foundry?app=cookie-press`) or
 * just the slug; both become `cookie-press`. Empty stays empty, which closes
 * the request with no app named.
 */
export function requestSlugFrom(input: string): string | null {
	const raw = requestNorm(input);
	if (!raw) return null;
	const fromQuery = /[?&]app=([^&#]+)/.exec(raw);
	const value = fromQuery ? decodeURIComponent(fromQuery[1]!) : raw.replace(/^.*\//, '');
	const slug = value.trim().toLowerCase();
	return slug || null;
}

/** The board's two lists. Open first; the database already orders each newest first. */
export function splitRequests(rows: readonly FoundryGameRequest[]): {
	open: FoundryGameRequest[];
	closed: FoundryGameRequest[];
} {
	return {
		open: rows.filter((r) => r.status === 'open'),
		closed: rows.filter((r) => r.status !== 'open')
	};
}

/** A date somebody reads, in the school's day, with no weekday. */
export function requestDay(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		timeZone: 'America/Los_Angeles'
	});
}
