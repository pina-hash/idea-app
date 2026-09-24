/**
 * YOUTUBE LINKS, CLIENT-SAFE AND SHARED (ledger 0297, package ITEM; report 20).
 *
 * `normalizeYouTubeId` was GAUNTLET's (`$lib/gauntlet/authoring.ts`), where a
 * challenge author pastes a tutorial link. The classroom needs the same answer
 * for a link inside an item's body, and importing GAUNTLET's authoring module
 * into the item page would carry its form builders along with one function.
 * So the function lives here and `authoring.ts` RE-EXPORTS it, byte for byte:
 * GAUNTLET's callers and its tests are unchanged, and there is one copy of the
 * five URL shapes.
 *
 * NO FETCH, AND THAT IS THE WHOLE DESIGN. Decision 23 accepted a gap in the
 * server-side link-preview fetcher and said to leave it alone, and a thumbnail
 * needs no fetcher at all: YouTube's still for a video is a fixed public URL
 * (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`), so the reader's own browser
 * asks for it -- with `referrerpolicy="no-referrer"`, so it carries no page
 * address -- and our server makes no request to anybody.
 */

/**
 * Extract a bare YouTube video id from a URL or an already-bare id (feature 4).
 * Returns '' when nothing valid is found, so the form can flag bad input and
 * `buildPayload` simply omits an empty tutorial. Accepts watch, youtu.be, embed,
 * shorts, and live URL shapes.
 */
export function normalizeYouTubeId(input: string): string {
	const s = (input ?? '').trim();
	if (!s) return '';
	if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
	const patterns = [
		/[?&]v=([A-Za-z0-9_-]{11})/,
		/youtu\.be\/([A-Za-z0-9_-]{11})/,
		/\/embed\/([A-Za-z0-9_-]{11})/,
		/\/shorts\/([A-Za-z0-9_-]{11})/,
		/\/live\/([A-Za-z0-9_-]{11})/
	];
	for (const re of patterns) {
		const m = s.match(re);
		if (m) return m[1];
	}
	return '';
}

/**
 * The hosts a video link may name. `normalizeYouTubeId` alone would answer for
 * ANY url carrying `?v=<11 characters>` -- a news site's article id, a shop's
 * variant parameter -- which is right for a form that says "paste a YouTube
 * link" and wrong for a body where any link at all can appear. So a body link
 * becomes a video card only when its HOST is YouTube's.
 */
const YOUTUBE_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
	'www.youtu.be',
	'youtube-nocookie.com',
	'www.youtube-nocookie.com'
]);

/**
 * THE VIDEO A LINK POINTS AT, or null. Only an http(s) URL on a YouTube host,
 * and only when one of the five shapes yields an id: a channel page, a
 * playlist with no video or a search result stays an ordinary link.
 */
export function youtubeVideoId(href: string | null | undefined): string | null {
	if (!href) return null;
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
	const id = normalizeYouTubeId(url.href);
	return id || null;
}

/**
 * THE STILL FOR A VIDEO: a fixed public image URL, fetched by the reader's
 * browser, never by our server. `hqdefault` exists for every public video
 * (480x360, letterboxed for a wide one); the larger sizes do not always.
 */
export function youtubeThumbnailUrl(id: string): string {
	return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

/** The two fields of an inline run this reads; the classroom's `ItemInline`
 *  and the notebook's run both satisfy it. */
export interface VideoRunLike {
	text: string;
	href?: string | null;
}

/**
 * A VIDEO LINK THAT EARNS A CARD, read off one paragraph's runs.
 *
 * Two shapes, and only two, because they are the two a teacher writes: a
 * paragraph that IS the link (`alone`), where the card replaces the bare
 * underlined URL, and a sentence that ENDS on the link ("Watch this before
 * class: <link>"), where the sentence stays and the card follows it. A video
 * link in the middle of a sentence stays an ordinary link: a card dropped
 * into the middle of somebody's prose breaks the sentence it sits in.
 *
 * `hrefOf` is the caller's own safety check (ItemBody passes `safeHref`), so a
 * link that would not survive rendering can never become a card either, and
 * this module holds no second copy of that rule. Consecutive runs sharing one
 * href are ONE link (a bold word inside it splits the run), and their text is
 * the card's label.
 */
export interface ParagraphVideo {
	id: string;
	href: string;
	label: string;
	alone: boolean;
}

export function paragraphVideo(
	runs: readonly VideoRunLike[],
	hrefOf: (run: VideoRunLike) => string | null
): ParagraphVideo | null {
	const meaningful = runs.filter((r) => hrefOf(r) !== null || r.text.trim() !== '');
	if (!meaningful.length) return null;
	const last = meaningful[meaningful.length - 1];
	const href = hrefOf(last);
	if (!href) return null;
	const id = youtubeVideoId(href);
	if (!id) return null;
	let label = '';
	let start = meaningful.length;
	for (let i = meaningful.length - 1; i >= 0; i--) {
		if (hrefOf(meaningful[i]) !== href) break;
		label = meaningful[i].text + label;
		start = i;
	}
	return { id, href, label: label.trim() || href, alone: start === 0 };
}
