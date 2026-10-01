/**
 * LINKS IN A STUDENT'S ANSWERS, FOUND WHERE A GRADER READS THEM (ledger 0360).
 *
 * Mr. Pina, 2026-09-30: students hand in a presentation share link (Google
 * Slides, Canva and the like) inside an HTML assignment, and he had to find it
 * in one line of the document, copy it and paste it into the address bar. "A
 * quick button I can click on." This module is the whole of how a grading
 * surface finds those links: the work head, the answers list, the Q&A view and
 * presentation mode all read it, so they cannot disagree about which answers
 * are links or where each one goes.
 *
 * IT IS PURE AND IT READS ONLY STORED ANSWERS. No document, no network, no
 * clock: the answers are the rows the console already holds, walked through
 * the stored manifest by `htmlAnswerSheet` (the one walk), so no new read
 * exists anywhere because of this.
 *
 * AN `href` THAT LEAVES HERE IS http OR https AND NOTHING ELSE. Every candidate
 * goes through `safeHref` (the one scheme and control-character check, which
 * also admits `mailto:`) AND through `new URL`, whose parsed protocol must be
 * `http:` or `https:` with a host and no credentials. A `javascript:` or
 * `data:` answer is therefore TEXT on every surface and never an anchor, which
 * `tests/answer-links.test.ts` proves with a mutation. A link a student typed
 * is still a page the teacher chooses to open; every anchor is
 * `target="_blank" rel="noopener noreferrer"` and names the host beside it.
 */

import { safeHref } from '$lib/rich-text';
import type { ResponseValue, StudentWork } from './assignment-spec';
import type { BlockLabel } from './bulk-download';
import { hxImagesFromFiles, hxValuesFromResponses } from './html-assignment/answers';
import type { HtmlAnswerCell } from './html-assignment/mount';
import { htmlAnswerSheet } from './html-assignment/mount';
import type { HtmlAssignmentManifest } from './html-assignment/manifest';

/** At most this many links are kept per answer and per student. */
export const ANSWER_LINK_CAP = 10;

/** One link a grader can open, or a declared link field that holds no working link. */
export interface AnswerLink {
	/** The block the answer is stored under (the permanent join key). */
	blockId: string;
	/** The question it answers: the block's `prompt`, else `<module>: <field>`. */
	label: string;
	/** The address to open, http(s) only, or null for a declared link that is not one. */
	url: string | null;
	/** What the address is, in words ("Google Slides", "canva.com"), or '' with no url. */
	host: string;
	/** True when the block declares `link: "presentation"`. */
	declared: boolean;
	/** What the student typed, for a declared link that is not a working link. */
	raw?: string;
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>`]+/gi;

/** Trailing punctuation a sentence puts after a link, and an unbalanced bracket. */
function trimTrailing(candidate: string): string {
	let out = candidate;
	for (;;) {
		const last = out.slice(-1);
		if ('.,;:!?'.includes(last) && last !== '') {
			out = out.slice(0, -1);
			continue;
		}
		if (last === ')' && (out.match(/\(/g) ?? []).length < (out.match(/\)/g) ?? []).length) {
			out = out.slice(0, -1);
			continue;
		}
		if (last === ']' && (out.match(/\[/g) ?? []).length < (out.match(/\]/g) ?? []).length) {
			out = out.slice(0, -1);
			continue;
		}
		return out;
	}
}

/**
 * THE ONE GATE AN ADDRESS PASSES TO BECOME AN `href`: `safeHref`, then a parse
 * whose protocol is http or https, with a host and no user name or password (a
 * `https://trusted.example@elsewhere.test` link reads as one host and opens
 * another). Answers the normalised address, or null.
 */
export function openableUrl(candidate: string | null | undefined): string | null {
	const safe = safeHref(candidate);
	if (!safe) return null;
	let parsed: URL;
	try {
		parsed = new URL(safe);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
	if (!parsed.hostname) return null;
	if (parsed.username || parsed.password) return null;
	return parsed.href;
}

/** Every http(s) link written anywhere in a piece of text, deduped, in order, capped. */
export function linksInText(text: string | null | undefined): string[] {
	if (typeof text !== 'string' || text === '') return [];
	const out: string[] = [];
	for (const m of text.matchAll(URL_IN_TEXT)) {
		const url = openableUrl(trimTrailing(m[0]));
		if (url && !out.includes(url)) out.push(url);
		if (out.length >= ANSWER_LINK_CAP) break;
	}
	return out;
}

/**
 * Every link in one stored answer: its text, and every cell of a spec table's
 * rows (the v1 presentation hand-in collects its link in a table column).
 */
export function linksInValue(value: ResponseValue | null | undefined): string[] {
	if (!value || typeof value !== 'object') return [];
	const out: string[] = [];
	const add = (urls: string[]) => {
		for (const u of urls) if (!out.includes(u) && out.length < ANSWER_LINK_CAP) out.push(u);
	};
	add(linksInText(value.text));
	for (const row of Array.isArray(value.rows) ? value.rows : []) {
		if (!row || typeof row !== 'object') continue;
		for (const cell of Object.values(row)) if (typeof cell === 'string') add(linksInText(cell));
	}
	return out;
}

const BARE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;

/**
 * THE ADDRESS A DECLARED LINK FIELD HOLDS, read forgivingly because the student
 * meant one: the first http(s) link written anywhere in it, or a whole value
 * shaped like `host.tld/path` with the scheme left off (what a phone's share
 * sheet often copies), completed to https. Anything else is null, and the
 * surfaces say "not a working link" rather than guessing further.
 */
export function presentationUrl(text: string | null | undefined): string | null {
	if (typeof text !== 'string') return null;
	const trimmed = text.replace(/^\s+|\s+$/g, '');
	if (!trimmed) return null;
	const written = linksInText(trimmed);
	if (written.length) return written[0];
	if (/\s/.test(trimmed) || !BARE_HOST.test(trimmed)) return null;
	return openableUrl(`https://${trimmed}`);
}

/** What an address is, in a grader's words. */
export function linkHostLabel(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return '';
	}
	const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
	const path = parsed.pathname.toLowerCase();
	if (host === 'docs.google.com') {
		if (path.startsWith('/presentation')) return 'Google Slides';
		if (path.startsWith('/document')) return 'Google Docs';
		if (path.startsWith('/spreadsheets')) return 'Google Sheets';
		if (path.startsWith('/forms')) return 'Google Forms';
		return 'Google Docs';
	}
	if (host === 'slides.google.com') return 'Google Slides';
	if (host === 'drive.google.com') return 'Google Drive';
	if (host === 'canva.com' || host.endsWith('.canva.com') || host === 'canva.link') return 'Canva';
	if (host === '1drv.ms' || host === 'onedrive.live.com' || host.endsWith('.sharepoint.com')) {
		return 'OneDrive';
	}
	if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'YouTube';
	if (host === 'prezi.com') return 'Prezi';
	if (host === 'pitch.com') return 'Pitch';
	return host;
}

/** A cell's question as a grader reads it: `<prompt>`, else `<module>: <field>`. */
function cellLabel(groupTitle: string, cell: HtmlAnswerCell): string {
	if (cell.prompt) return cell.prompt;
	return groupTitle ? `${groupTitle}: ${cell.field}` : cell.field;
}

/**
 * THE LINKS IN ONE WORKSHEET ANSWER. A declared link field (`link:
 * "presentation"`) answers exactly one entry whenever it holds anything, a
 * working link or the words "not a working link"; any other text or table
 * answer answers one entry per link written in it. A checkbox, a radio and a
 * photograph hold no link.
 */
export function cellLinks(cell: HtmlAnswerCell, groupTitle: string): AnswerLink[] {
	const label = cellLabel(groupTitle, cell);
	const value = typeof cell.value === 'string' ? cell.value : '';
	if (cell.link) {
		if (!value.trim()) return [];
		const url = presentationUrl(value);
		return url
			? [{ blockId: cell.blockId, label, url, host: linkHostLabel(url), declared: true }]
			: [{ blockId: cell.blockId, label, url: null, host: '', declared: true, raw: value }];
	}
	if (cell.type !== 'text' && cell.type !== 'longText' && cell.type !== 'table') return [];
	return linksInText(value).map((url) => ({
		blockId: cell.blockId,
		label,
		url,
		host: linkHostLabel(url),
		declared: false
	}));
}

/** Does this manifest declare a presentation link field anywhere. */
export function manifestDeclaresLink(manifest: unknown): boolean {
	return htmlAnswerSheet(manifest, {}, {}).some((g) => g.cells.some((c) => c.link !== null));
}

export interface StudentLinksOptions {
	/** The ported worksheet's stored manifest, or null for a spec assignment. */
	manifest?: HtmlAssignmentManifest | null;
	/** A spec assignment's block names (`blockLabelsFromSpec`). Unused with a manifest. */
	labels?: ReadonlyMap<string, BlockLabel>;
}

/**
 * EVERY LINK IN ONE STUDENT'S ANSWERS: declared link fields first, in manifest
 * order, then links written in any other answer, deduped by address and capped.
 * A worksheet is walked through its stored manifest; a spec assignment through
 * its stored rows, named by the module each block sits in.
 */
export function studentLinks(work: StudentWork, options: StudentLinksOptions = {}): AnswerLink[] {
	const manifest = options.manifest ?? null;
	const declared: AnswerLink[] = [];
	const found: AnswerLink[] = [];
	// `htmlAnswerSheet` answers [] for a manifest it cannot walk, which is the
	// one structural check the projections below need before they run.
	if (manifest && htmlAnswerSheet(manifest, {}, {}).length) {
		const values = hxValuesFromResponses(manifest, work.responses);
		const images = hxImagesFromFiles(manifest, work.files);
		for (const group of htmlAnswerSheet(manifest, values, images)) {
			for (const cell of group.cells) {
				for (const link of cellLinks(cell, group.title)) (link.declared ? declared : found).push(link);
			}
		}
	} else {
		for (const row of work.responses) {
			const named = options.labels?.get(row.block_id);
			const label = named?.prompt ?? (named?.module || row.block_id);
			for (const url of linksInValue(row.value)) {
				found.push({ blockId: row.block_id, label, url, host: linkHostLabel(url), declared: false });
			}
		}
	}
	const out: AnswerLink[] = [];
	const seen = new Set<string>();
	for (const link of [...declared, ...found]) {
		if (link.url) {
			if (seen.has(link.url)) continue;
			seen.add(link.url);
		}
		out.push(link);
		if (out.length >= ANSWER_LINK_CAP) break;
	}
	return out;
}

/** One presenter in presentation mode: a name and the links to open. No address. */
export interface PresentationEntry {
	email: string;
	displayName: string;
	links: AnswerLink[];
}

export interface PresentationQueue {
	/** Everybody with at least one link that opens, in the order given. */
	queue: PresentationEntry[];
	/** Students with no link that opens. */
	missing: number;
	/** Of those, how many filled a declared link field with something that is not a link. */
	notWorking: number;
	/** Does the assignment declare a presentation link field. */
	declared: boolean;
}

/**
 * WHO PRESENTS, IN ROSTER ORDER. On an assignment that declares a presentation
 * link field only that field counts, so a link to a reference in some other
 * answer never puts somebody up on the projector; on one that declares none,
 * any link in any answer does. A student with no link that opens is counted and
 * is never in the queue, so the projector never shows a name with nothing to
 * open under it.
 */
export function presentationQueue(
	students: readonly StudentWork[],
	options: StudentLinksOptions = {}
): PresentationQueue {
	const declared = !!options.manifest && manifestDeclaresLink(options.manifest);
	const queue: PresentationEntry[] = [];
	let missing = 0;
	let notWorking = 0;
	for (const s of students) {
		const all = studentLinks(s, options);
		const pool = declared ? all.filter((l) => l.declared) : all;
		const openable = pool.filter((l) => l.url !== null);
		if (openable.length) {
			queue.push({ email: s.email, displayName: s.displayName, links: openable });
		} else {
			missing += 1;
			if (pool.some((l) => l.url === null)) notWorking += 1;
		}
	}
	return { queue, missing, notWorking, declared };
}
