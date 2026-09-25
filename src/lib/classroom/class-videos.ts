/**
 * EVERY VIDEO POSTED IN A CLASS, READ OFF THE ITEMS THE PAGE ALREADY HOLDS
 * (ledger 0298, R08: "a section that has all the videos and tutorials on it").
 *
 * A DERIVED VIEW, NOT A LIBRARY. There is no table, no new read and no server
 * fetch: the class page has already loaded every item it can show, with its
 * body document and its Links list, and every YouTube link a teacher posted is
 * sitting in one of those two places. This walks them and answers a list the
 * page can draw as thumbnail cards. A curated tutorial library (ordering a
 * teacher authors, non-YouTube videos, one list across classes) would be a
 * table and a decision, and is not this.
 *
 * THE LINK RULES ARE THE BODY RENDERER'S, CALLED RATHER THAN RESTATED.
 * `safeHref` first -- the same check `ItemBody` runs at render, so a link that
 * would not survive being drawn can never become a card here either -- and
 * then `youtubeVideoId`, which answers only for YouTube's own hosts. So a news
 * site's `?v=<11 characters>` stays a link, and decision 23 (the link-preview
 * fetcher) is untouched: the still is YouTube's fixed public image URL, which
 * the reader's own browser asks for with no referrer.
 *
 * EVERY LINK IN THE BODY, NOT ONLY THE ONES THAT EARN A CARD IN IT. `ItemBody`
 * cards a video only where the link IS the paragraph or ends it, because a
 * card dropped mid-sentence breaks the sentence. That is a rule about where a
 * card may sit inside prose; this is an index, so a video linked in the middle
 * of a sentence, in a list item or in a heading is still a video posted in the
 * class.
 *
 * WHAT A STUDENT CAN SEE, AND NOTHING ELSE, FOR EVERY ROLE:
 *   - `instructorLinks` is NEVER read. Those are answer keys and facilitation
 *     notes, loaded only for a manager, and an index built from them would put
 *     a teacher-only video beside the class's -- in a view the teacher is told
 *     is what the class sees.
 *   - A DRAFT and a SCHEDULED item are held back. A student's read never
 *     carries one; a manager's does, and listing its video would show the
 *     teacher a class index their students do not have. They are COUNTED
 *     (`held`) so the manager is told why a video they just drafted is absent,
 *     rather than left to wonder.
 *
 * ONE CARD PER VIDEO. The same video posted twice (a material and the
 * announcement reminding the class about it, or two links to it at different
 * timestamps) is one card, keyed on the video id: the FIRST item in the order
 * it was handed (the class page hands its own reading order) keeps the card
 * and its link, and every other item that posts it is listed under it.
 */
import {
	ITEM_LIST_MAX_DEPTH,
	itemBodyDoc,
	safeHref,
	type ItemDoc,
	type ItemInline,
	type ItemList
} from './classroom-doc';
import { isScheduled, itemTitle, type ClassroomItem, type ItemLink } from './classroom';
import { itemParts } from '$lib/rich-text-doc';
import { youtubeVideoId } from '$lib/youtube';

/** One YouTube link found in one item, in the order it appears there. */
export interface ItemVideoLink {
	/** The YouTube video id. */
	id: string;
	/** The link exactly as it survived `safeHref`. */
	href: string;
	/**
	 * What the teacher wrote as the link's text, trimmed. EMPTY when the text is
	 * the address itself -- a pasted URL is its own label, and printing it on a
	 * card says less than the card's own fallback does.
	 */
	label: string;
}

/** An item a video was posted in: enough to name it and link back to it. */
export interface ClassVideoSource {
	itemId: string;
	title: string;
}

export interface ClassVideo extends ItemVideoLink {
	/** The first item that posts it, which the card links back to. */
	item: ClassVideoSource;
	/** Every other item that posts the same video, in order, each once. */
	also: ClassVideoSource[];
}

export interface ClassVideoIndex {
	videos: ClassVideo[];
	/**
	 * Distinct videos that appear ONLY in a draft or a scheduled item, so are
	 * not listed. Always 0 for a student, whose read carries neither.
	 */
	held: number;
}

/** The fields this reads. `instructorLinks` is deliberately not one of them. */
export type ClassVideoItem = Pick<
	ClassroomItem,
	'id' | 'title' | 'body' | 'body_doc' | 'links' | 'published' | 'publish_at'
>;

/**
 * A label that is the address itself (or any address) is no label. The body
 * editor makes a pasted URL a link whose text is the URL, and the Links list
 * falls back to the URL when a teacher left the label blank.
 */
function cleanLabel(text: string, href: string): string {
	const t = text.replace(/\s+/g, ' ').trim();
	if (!t || t === href) return '';
	if (/^(https?:\/\/|www\.)/i.test(t)) return '';
	return t;
}

/**
 * The links in a run list. Consecutive runs sharing one href are ONE link --
 * a bold word inside a link splits its run -- exactly as `paragraphVideo`
 * reads them, and their text together is the label.
 */
function runLinks(runs: readonly ItemInline[] | undefined, out: ItemVideoLink[]): void {
	if (!Array.isArray(runs)) return;
	let i = 0;
	while (i < runs.length) {
		const href = safeHref(runs[i]?.href);
		if (!href) {
			i++;
			continue;
		}
		let text = '';
		let j = i;
		while (j < runs.length && safeHref(runs[j]?.href) === href) {
			text += typeof runs[j]?.text === 'string' ? runs[j].text : '';
			j++;
		}
		const id = youtubeVideoId(href);
		if (id) out.push({ id, href, label: cleanLabel(text, href) });
		i = j;
	}
}

/** A list and its sublists, carrying the cap down like every other walk of a body. */
function listLinks(list: ItemList, depth: number, out: ItemVideoLink[]): void {
	if (depth > ITEM_LIST_MAX_DEPTH || !Array.isArray(list?.items)) return;
	for (const entry of list.items) {
		const parts = itemParts(entry);
		runLinks(parts.runs as ItemInline[], out);
		for (const sub of parts.lists) listLinks(sub as ItemList, depth + 1, out);
	}
}

/** Every YouTube link in a body document, in reading order. */
export function docVideoLinks(doc: ItemDoc): ItemVideoLink[] {
	const out: ItemVideoLink[] = [];
	for (const block of Array.isArray(doc) ? doc : []) {
		if (!block || typeof block !== 'object') continue;
		if (block.type === 'p' || block.type === 'h3' || block.type === 'h4') runLinks(block.runs, out);
		else if (block.type === 'ul' || block.type === 'ol') listLinks(block, 1, out);
	}
	return out;
}

/**
 * Every YouTube link one item shows a student: its body first (what the
 * teacher wrote), then its Links list. Never `instructorLinks`.
 */
export function itemVideoLinks(item: ClassVideoItem): ItemVideoLink[] {
	const out = docVideoLinks(itemBodyDoc(item));
	for (const link of (Array.isArray(item.links) ? item.links : []) as ItemLink[]) {
		const href = safeHref(link?.url);
		const id = href ? youtubeVideoId(href) : null;
		if (href && id) out.push({ id, href, label: cleanLabel(link.label ?? '', href) });
	}
	return out;
}

/** Can the class see this item right now? The same two facts the row's chips read. */
function studentVisible(item: ClassVideoItem, now: Date): boolean {
	return item.published && !isScheduled(item, now);
}

/**
 * THE CLASS'S VIDEOS, one per video id, in the order `items` is handed.
 *
 * `now` is the caller's clock (the class page's loader clock), because a
 * scheduled item is one whose go-live is after it, and a helper reading its
 * own clock silently disagrees with the Scheduled chip on the row.
 */
export function classVideos(items: readonly ClassVideoItem[], now: Date): ClassVideoIndex {
	const byId = new Map<string, ClassVideo>();
	const heldIds = new Set<string>();
	for (const item of items) {
		const links = itemVideoLinks(item);
		if (!links.length) continue;
		if (!studentVisible(item, now)) {
			for (const l of links) heldIds.add(l.id);
			continue;
		}
		const source: ClassVideoSource = { itemId: item.id, title: itemTitle(item as ClassroomItem) };
		for (const link of links) {
			const seen = byId.get(link.id);
			if (!seen) {
				byId.set(link.id, { ...link, item: source, also: [] });
				continue;
			}
			// The same item linking one video twice is still one posting.
			if (seen.item.itemId === item.id || seen.also.some((a) => a.itemId === item.id)) continue;
			seen.also.push(source);
		}
	}
	let held = 0;
	for (const id of heldIds) if (!byId.has(id)) held++;
	return { videos: [...byId.values()], held };
}

/** "1 video", "4 videos": the count on the section's trigger. */
export function videoCountLabel(n: number): string {
	return `${n} video${n === 1 ? '' : 's'}`;
}

/** The manager's line about what is held back, or null when nothing is. */
export function heldVideosNote(held: number): string | null {
	if (held <= 0) return null;
	return held === 1
		? '1 more video is in a draft or scheduled post, and is listed here once students can see it.'
		: `${held} more videos are in drafts or scheduled posts, and are listed here once students can see them.`;
}
