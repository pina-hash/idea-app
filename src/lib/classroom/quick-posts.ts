/**
 * QUICK POSTS: a short notice a teacher puts at the top of one, several or
 * all of their classes for a while (ledger 0360, report R22).
 *
 * WHAT MR. PINA ASKED FOR, AND IT IS THE SPEC. "I need a better way of sharing
 * quick things with the class like ... a special class schedule ... or a link
 * to a quick thing. The amount of steps it takes me to do that should be
 * absolutely minimal" -- and, on 2026-09-30, "temporary presets like by the
 * end of the school day, week, and such, then control over a specific preset
 * date and time then option to be up until i take it down", with "global
 * posts" to all of his classes or several at once. A student sees it at the
 * top of the class, unmistakably, and an expired notice disappears on its own.
 *
 * SO THE SHORTEST PATH IS THREE ACTIONS: press Quick post, type, press Post.
 * The default target is this class and the default end is the end of the
 * school day; "All my classes" is one more press.
 *
 * WHAT THE DATABASE KEEPS IS ONE CANONICAL POST AND A POSTINGS JOIN (0230),
 * the classroom's own one-thing-in-N-classes shape, written and read only
 * through three SECURITY DEFINER functions. It stores the END AS AN INSTANT
 * (`expires_at`, null for "until I take it down") and nothing about which
 * preset produced it: a preset is a way of choosing an instant, decided here,
 * in the school's zone, against an injected clock, so every one is assertable
 * at a pinned moment. A notice is taken down by a stamp and never deleted.
 *
 * WHY NOT AN ANNOUNCEMENT WITH AN END DATE. Every reader of `classroom_items`
 * (the stream, the home feed, the to-do, the palette, the exports, the GitHub
 * export into `materials/`) would need to learn to filter on it, which is the
 * soft-delete-is-not-a-boundary trap, and every notice about a fire drill
 * would be pushed into the materials archive. A notice is not course content.
 *
 * PURE: no Svelte, no `$app`. The Supabase client is only a type here, and the
 * transports and the page load at the bottom take it as an argument.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { safeHref } from '$lib/rich-text';
import { formatDue, sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
import {
	SCHOOL_DAY_END_MINUTES,
	SCHOOL_LOCALE,
	SCHOOL_TIME_ZONE,
	daysBetween,
	laCalendarDay,
	schoolDayEnd,
	schoolDayPlus,
	schoolWallInstant,
	schoolWeekday
} from '$lib/classroom/school-calendar';
import { PollSignedOut, isSignedOutFailure } from '$lib/classroom/poll';

/* ========================================================================== */
/* Limits and cadence                                                         */
/* ========================================================================== */

/** The longest notice the database will take (0230's body check). */
export const QUICK_POST_MAX_CHARS = 1000;
/** The most classes one notice may go to in one call (0230 raises past it). */
export const QUICK_POST_MAX_CLASSES = 50;
/** How far ahead a notice may end (0230 refuses past it). */
export const QUICK_POST_MAX_AHEAD_DAYS = 366;
/** How many notices show before the rest fold under "N more". */
export const QUICK_POST_SHOWN = 3;

/**
 * HOW OFTEN AN OPEN CLASS PAGE RE-ASKS FOR NOTICES: TEN MINUTES, AND THAT IS A
 * BUDGET, NOT A FEEL (ledger 0357). The section layout wraps the item page as
 * well as the class page, and `tests/classroom-poll.test.ts` holds a student's
 * steady-state calls on the item page at no more than half the figure the
 * database stalled under (5.0 a minute). 0357 left that page at 2.4, so the
 * headroom is 0.1 a minute, which is exactly one read every 600 seconds. A
 * 300-second poll would put the item page at 2.6 and over the line.
 *
 * THE POLL IS THE FLOOR, NOT THE SPEED. A teacher's post announces itself on
 * the class's live channel, and every open page re-reads within a few seconds
 * of hearing it (`QUICK_POST_NOTICE_JITTER_MS`). A return to the tab re-reads
 * too, at most once per quarter interval (the shared poller's poke gap). And an
 * EXPIRY needs no network at all: each page hides a notice the moment its end
 * passes, from the end the read already carried.
 */
export const QUICK_POSTS_POLL_MS = 600_000;

/**
 * A notice heard on the live channel is re-read after a random wait in
 * [0, this), so a class of twenty-one does not ask in the same second -- the
 * in-step burst the 2026-09-29 stall was made of.
 */
export const QUICK_POST_NOTICE_JITTER_MS = 8_000;

/**
 * THE SERVER'S CLOCK IS TRUSTED OVER A DEVICE'S ONLY WITHIN THIS. A read
 * carries the database's `now`, and the difference from the device clock
 * corrects a phone that is a few minutes off; a difference larger than this is
 * not a wrong clock but an OLD read (a page restored from the back-forward
 * cache), and is ignored. The server's own filter is the backstop either way.
 */
export const QUICK_POST_MAX_SKEW_MS = 15 * 60_000;

/* ========================================================================== */
/* The payload                                                                */
/* ========================================================================== */

export interface QuickPost {
	id: string;
	/** Plain text, line breaks kept; links are found by `quickPostRuns`. */
	body: string;
	created_at: string;
	/** Null: up until a teacher takes it down. */
	expires_at: string | null;
	/** The caller's MANAGED targets, for a manager; null for a student. */
	section_ids: string[] | null;
	/** May this caller take it down (the author, or a teacher of every target). */
	can_take_down: boolean;
}

export interface QuickPostBoard {
	/** Whether the caller manages this section (the read's own answer). */
	manages: boolean;
	/** The database's clock at the read. */
	now: string;
	/** Live notices, newest first, at most 20 (0230). */
	posts: QuickPost[];
}

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/**
 * The board, from `classroom_quick_posts`' jsonb, or null for anything that is
 * not one. A row that does not parse is DROPPED rather than coerced, so a
 * malformed row can never reach the page as a notice with a broken end.
 */
export function parseQuickPostBoard(raw: unknown): QuickPostBoard | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (r.ok !== true || !Array.isArray(r.posts)) return null;
	const posts: QuickPost[] = [];
	for (const p of r.posts) {
		if (!p || typeof p !== 'object') continue;
		const row = p as Record<string, unknown>;
		if (typeof row.id !== 'string' || row.id === '') continue;
		if (typeof row.body !== 'string' || row.body.trim() === '') continue;
		if (!isIso(row.created_at)) continue;
		if (row.expires_at !== null && row.expires_at !== undefined && !isIso(row.expires_at)) continue;
		const ids = Array.isArray(row.section_ids)
			? row.section_ids.filter((x): x is string => typeof x === 'string' && x !== '')
			: null;
		posts.push({
			id: row.id,
			body: row.body,
			created_at: row.created_at,
			expires_at: (row.expires_at as string | null | undefined) ?? null,
			section_ids: ids,
			can_take_down: row.can_take_down === true
		});
	}
	return {
		manages: r.manages === true,
		now: isIso(r.now) ? r.now : new Date(0).toISOString(),
		posts
	};
}

/* ========================================================================== */
/* When a notice ends                                                         */
/* ========================================================================== */

export type QuickPostPresetId =
	| 'school-day'
	| 'hour'
	| 'next-school-day'
	| 'week'
	| 'next-week'
	| 'forever'
	| 'custom';

export interface QuickPostPreset {
	id: QuickPostPresetId;
	label: string;
}

/**
 * THE ENDS A TEACHER CAN PICK, in the order the composer offers them. Each one
 * shows the time it resolves to beside its label (`quickPostPresetHint`), so a
 * teacher never has to work out what "the end of the week" means on a Friday
 * afternoon. The school day ends at `SCHOOL_DAY_END_MINUTES` (3:00 PM; there
 * is no bell schedule in this tree, and `school-calendar.ts` says so).
 */
export const QUICK_POST_PRESETS: readonly QuickPostPreset[] = [
	{ id: 'school-day', label: 'End of the school day' },
	{ id: 'hour', label: 'One hour' },
	{ id: 'next-school-day', label: 'End of the next school day' },
	{ id: 'week', label: 'End of the week' },
	{ id: 'next-week', label: 'End of next week' },
	{ id: 'forever', label: 'Until I take it down' },
	{ id: 'custom', label: 'Pick a date and time' }
];

export const QUICK_POST_DEFAULT_PRESET: QuickPostPresetId = 'school-day';

export function isQuickPostPreset(v: unknown): v is QuickPostPresetId {
	return typeof v === 'string' && QUICK_POST_PRESETS.some((p) => p.id === v);
}

export type QuickPostExpiry = { ok: true; expiresAt: string | null } | { ok: false; refusal: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** 3:00 PM on a school day, as an instant in ms. */
function endOfSchoolDay(day: string): number {
	return Date.parse(schoolWallInstant(day, SCHOOL_DAY_END_MINUTES) ?? '');
}

const isWeekday = (day: string) => {
	const w = schoolWeekday(day);
	return w !== null && w >= 1 && w <= 5;
};

/** The first weekday strictly after `day`. */
function nextWeekday(day: string): string {
	let d = day;
	for (let i = 0; i < 7; i++) {
		d = schoolDayPlus(d, 1) ?? d;
		if (isWeekday(d)) return d;
	}
	return d;
}

/** The school day a notice "until the end of the school day" ends on, at `now`. */
function currentSchoolDay(nowMs: number): string {
	const today = laCalendarDay(new Date(nowMs));
	if (isWeekday(today) && nowMs < endOfSchoolDay(today)) return today;
	return nextWeekday(today);
}

/** The Friday "the end of the week" means at `now`: this week's, or next week's once it has passed. */
function currentFriday(nowMs: number): string {
	const today = laCalendarDay(new Date(nowMs));
	const w = schoolWeekday(today) ?? 0;
	// Sunday to Friday look ahead to this Friday; Saturday is next week's.
	let friday = schoolDayPlus(today, w === 6 ? 6 : 5 - w) ?? today;
	if (nowMs >= endOfSchoolDay(friday)) friday = schoolDayPlus(friday, 7) ?? friday;
	return friday;
}

/**
 * A `datetime-local` value (`2026-10-03T14:30`, seconds optional) read as the
 * SCHOOL'S wall clock, never the device's: a teacher typing 2:30 means 2:30 at
 * school whatever zone their laptop is set to. Null when it does not parse.
 */
export function quickPostCustomInstant(local: string | null | undefined): string | null {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec((local ?? '').trim());
	if (!m) return null;
	const h = Number(m[2]);
	const min = Number(m[3]);
	if (h > 23 || min > 59) return null;
	return schoolWallInstant(m[1], h * 60 + min + Number(m[4] ?? 0) / 60);
}

/**
 * THE END A PRESET CHOOSES AT `nowMs`, or the sentence that refuses it.
 *
 *   - `school-day`: 3:00 PM today, or the next weekday's once today's has
 *     passed (and on a weekend), because a notice posted at 4 PM about
 *     "today" is about tomorrow.
 *   - `next-school-day`: 3:00 PM on the weekday after that one.
 *   - `week`: 3:00 PM this Friday, or next Friday once this one has passed.
 *   - `next-week`: the Friday after that.
 *   - `hour`: sixty minutes from now.
 *   - `forever`: null, up until a teacher takes it down.
 *   - `custom`: the picked date and time, read as school time.
 *
 * The refusals mirror 0230's own: an end that has passed, and one more than
 * `QUICK_POST_MAX_AHEAD_DAYS` away. They are checked here first so a teacher
 * reads the sentence before pressing Post, not after.
 */
export function quickPostExpiry(
	preset: QuickPostPresetId,
	nowMs: number,
	customLocal?: string | null
): QuickPostExpiry {
	let at: number;
	switch (preset) {
		case 'forever':
			return { ok: true, expiresAt: null };
		case 'hour':
			at = nowMs + 60 * 60_000;
			break;
		case 'school-day':
			at = endOfSchoolDay(currentSchoolDay(nowMs));
			break;
		case 'next-school-day':
			at = endOfSchoolDay(nextWeekday(currentSchoolDay(nowMs)));
			break;
		case 'week':
			at = endOfSchoolDay(currentFriday(nowMs));
			break;
		case 'next-week':
			at = endOfSchoolDay(schoolDayPlus(currentFriday(nowMs), 7) ?? '');
			break;
		case 'custom': {
			const iso = quickPostCustomInstant(customLocal);
			if (!iso) return { ok: false, refusal: 'Pick the date and time this notice should come down.' };
			at = Date.parse(iso);
			break;
		}
		default:
			return { ok: false, refusal: 'Pick when this notice should come down.' };
	}
	if (!Number.isFinite(at)) return { ok: false, refusal: 'Pick when this notice should come down.' };
	if (at <= nowMs) return { ok: false, refusal: quickPostRefusalWords('expiry_passed') };
	if (at > nowMs + QUICK_POST_MAX_AHEAD_DAYS * DAY_MS) {
		return { ok: false, refusal: quickPostRefusalWords('expiry_too_far') };
	}
	return { ok: true, expiresAt: new Date(at).toISOString() };
}

/** "3:00 PM", in the school's zone and locale. */
function clockWords(at: Date): string {
	return at.toLocaleTimeString(SCHOOL_LOCALE, { hour: 'numeric', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE });
}

/**
 * WHEN AN END FALLS, IN WORDS A STUDENT READS AT A GLANCE: "3:00 PM today",
 * "3:00 PM tomorrow", or `formatDue`'s "Oct 3, 3:00 PM" further out. In the
 * school's zone, and naming no weekday (classroom copy never does). Null for
 * an end that does not parse.
 */
export function quickPostWhenWords(expiresAt: string | null, nowMs: number): string | null {
	if (!expiresAt) return null;
	const at = Date.parse(expiresAt);
	if (!Number.isFinite(at)) return null;
	const today = laCalendarDay(new Date(nowMs));
	const day = laCalendarDay(new Date(at));
	const gap = daysBetween(today, day);
	if (gap === 0) return `${clockWords(new Date(at))} today`;
	if (gap === 1) return `${clockWords(new Date(at))} tomorrow`;
	return formatDue(expiresAt, today);
}

/** The line every notice carries: "Until 3:00 PM today", or "Until taken down". */
export function quickPostUntilWords(expiresAt: string | null, nowMs: number): string {
	const when = quickPostWhenWords(expiresAt, nowMs);
	return when ? `Until ${when}` : 'Until taken down';
}

/** What a preset resolves to right now, for the composer's key: "3:00 PM today". */
export function quickPostPresetHint(preset: QuickPostPresetId, nowMs: number): string {
	if (preset === 'custom') return 'Any date and time';
	const e = quickPostExpiry(preset, nowMs);
	if (!e.ok) return '';
	return e.expiresAt ? (quickPostWhenWords(e.expiresAt, nowMs) ?? '') : 'No end';
}

/** Is a notice still up at `nowMs`? The read already left out the expired and the taken down. */
export function quickPostShowing(post: Pick<QuickPost, 'expires_at'>, nowMs: number): boolean {
	if (!post.expires_at) return true;
	const at = Date.parse(post.expires_at);
	return !Number.isFinite(at) || at > nowMs;
}

/**
 * THE NEXT MOMENT A BOARD ON SCREEN CHANGES BY ITSELF, as an instant in ms, or
 * null when nothing ever will: the soonest end still ahead (the notice goes),
 * or the next midnight at school (an end that read "tomorrow" now reads
 * "today"). The page waits for exactly that and asks no server.
 */
export function quickPostNextChange(posts: readonly Pick<QuickPost, 'expires_at'>[], nowMs: number): number | null {
	if (posts.length === 0) return null;
	let next: number | null = null;
	for (const p of posts) {
		if (!p.expires_at) continue;
		const at = Date.parse(p.expires_at);
		if (Number.isFinite(at) && at > nowMs && (next === null || at < next)) next = at;
	}
	const midnight = Date.parse(schoolDayEnd(laCalendarDay(new Date(nowMs))) ?? '') + 1;
	if (Number.isFinite(midnight) && midnight > nowMs && (next === null || midnight < next)) next = midnight;
	return next;
}

/**
 * The correction from the device clock to the server's, from a read that has
 * just arrived: zero for a difference beyond `QUICK_POST_MAX_SKEW_MS`, which
 * means an old read rather than a wrong clock.
 */
export function quickPostSkewMs(serverNow: string, deviceNowMs: number): number {
	const at = Date.parse(serverNow);
	if (!Number.isFinite(at) || at <= 0) return 0;
	const skew = at - deviceNowMs;
	return Math.abs(skew) > QUICK_POST_MAX_SKEW_MS ? 0 : skew;
}

/* ========================================================================== */
/* The body                                                                   */
/* ========================================================================== */

export interface QuickPostRun {
	text: string;
	/** Set only on a run that is a link `safeHref` accepted. */
	href?: string;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING = /[.,;:!?'"]+$/;

/** Trim what a sentence put after a link: a full stop, a comma, an unbalanced bracket. */
function trimTrailing(url: string): string {
	let u = url.replace(TRAILING, '');
	for (const [open, close] of [
		['(', ')'],
		['[', ']'],
		['{', '}']
	]) {
		while (u.endsWith(close) && u.split(open).length < u.split(close).length) {
			u = u.slice(0, -1).replace(TRAILING, '');
		}
	}
	return u;
}

/**
 * A NOTICE'S BODY AS RUNS OF TEXT AND LINKS. Only `http` and `https` are ever
 * recognized, and every one goes through `safeHref`, the one implementation,
 * so a `javascript:` or a `data:` stays text. The renderer walks these into
 * real elements; there is no `{@html}` anywhere on this path. Line breaks stay
 * in the text, and the card keeps them with `white-space: pre-line`.
 */
export function quickPostRuns(body: string): QuickPostRun[] {
	const runs: QuickPostRun[] = [];
	let last = 0;
	for (const m of body.matchAll(URL_PATTERN)) {
		const start = m.index ?? 0;
		const url = trimTrailing(m[0]);
		const href = safeHref(url);
		if (!href || url.length === 0) continue;
		if (start > last) runs.push({ text: body.slice(last, start) });
		runs.push({ text: url, href });
		last = start + url.length;
	}
	if (last < body.length) runs.push({ text: body.slice(last) });
	return runs.length ? runs : [{ text: body }];
}

export interface QuickPostLink {
	href: string;
	/** The host a student recognizes: "docs.google.com", never the whole URL. */
	host: string;
}

/**
 * THE LINKS A NOTICE CARRIES, ONE EACH, for the 44px "Open" keys under it. A
 * link inside a sentence is prose-sized and is left that way (CLAUDE.md's
 * inline-link exemption); the key is the target a phone can hit. Past
 * `max` links the card offers no keys at all, because a row of eight keys is a
 * second copy of the notice rather than a shortcut.
 */
export function quickPostLinks(body: string, max = 3): QuickPostLink[] {
	const out: QuickPostLink[] = [];
	for (const run of quickPostRuns(body)) {
		if (!run.href || out.some((l) => l.href === run.href)) continue;
		let host = '';
		try {
			host = new URL(run.href).hostname.replace(/^www\./, '');
		} catch {
			continue;
		}
		out.push({ href: run.href, host });
	}
	return out.length > max ? [] : out;
}

/* ========================================================================== */
/* Who it goes to                                                             */
/* ========================================================================== */

export interface QuickPostTarget {
	id: string;
	label: string;
}

export interface QuickPostTargets {
	/** The class on screen, or null when the viewer does not manage it. */
	current: QuickPostTarget | null;
	/** "All my classes": the viewer's OWN active classes, by `teacher_email`. */
	mine: QuickPostTarget[];
	/** What "Choose classes" lists: the viewer's own, else everything they manage. */
	choices: QuickPostTarget[];
}

/**
 * WHERE A NOTICE CAN GO, from the sections the page already loaded.
 *
 * "ALL MY CLASSES" IS THE VIEWER'S OWN CLASSES, BY `teacher_email`, NEVER
 * EVERY CLASS THEY MANAGE. An admin manages every section in the school (0138),
 * so the managed list for Mr. Pina is the whole school, and one press would
 * post to all of it. Archived classes are left out. When the viewer teaches no
 * class of their own, "All my classes" is not offered and "Choose classes"
 * lists what they manage. The class on screen is always in the choices.
 */
export function quickPostTargets(
	sections: readonly ClassroomSection[],
	viewerEmail: string | null | undefined,
	currentId: string
): QuickPostTargets {
	const me = (viewerEmail ?? '').trim().toLowerCase();
	const live = sections.filter((s) => s.active !== false);
	const toTarget = (s: ClassroomSection): QuickPostTarget => ({ id: s.id, label: sectionTitle(s) });
	const sorted = (list: readonly ClassroomSection[]) =>
		[...list].sort((a, b) => sectionTitle(a).localeCompare(sectionTitle(b), undefined, { numeric: true }));
	const mineSections = me ? sorted(live.filter((s) => s.teacher_email.trim().toLowerCase() === me)) : [];
	const currentSection = sections.find((s) => s.id === currentId) ?? null;
	const current = currentSection ? toTarget(currentSection) : null;
	const base = mineSections.length ? mineSections : sorted(live);
	const choices = base.map(toTarget);
	if (current && !choices.some((c) => c.id === current.id)) choices.unshift(current);
	return { current, mine: mineSections.map(toTarget), choices };
}

/* ========================================================================== */
/* Sending                                                                    */
/* ========================================================================== */

export type QuickPostTargetMode = 'this' | 'mine' | 'choose';

export interface QuickPostDraft {
	body: string;
	preset: QuickPostPresetId;
	/** The `datetime-local` value, read only for `custom`. */
	custom: string;
	/** The classes it goes to, already resolved from the target mode. */
	sectionIds: string[];
}

export type QuickPostSendCheck =
	| { ok: true; body: string; expiresAt: string | null; sectionIds: string[] }
	| { ok: false; reason: string };

/**
 * IS THIS DRAFT READY TO POST, AND IF NOT, WHY. One predicate, read by the
 * Post control's `aria-disabled` and again as the first line of its handler,
 * so the control and the press cannot disagree (the `reviewCanSend` rule).
 * The body is trimmed the way 0230 trims it (`\s` at both ends, never btrim).
 */
export function quickPostSendCheck(draft: QuickPostDraft, nowMs: number): QuickPostSendCheck {
	const body = draft.body.replace(/^\s+|\s+$/g, '');
	if (body === '') return { ok: false, reason: quickPostRefusalWords('empty') };
	if (body.length > QUICK_POST_MAX_CHARS) return { ok: false, reason: quickPostRefusalWords('too_long') };
	const ids = [...new Set(draft.sectionIds.filter((x) => typeof x === 'string' && x !== ''))].sort();
	if (ids.length === 0) return { ok: false, reason: quickPostRefusalWords('no_classes') };
	if (ids.length > QUICK_POST_MAX_CLASSES) return { ok: false, reason: quickPostRefusalWords('too_many') };
	const e = quickPostExpiry(draft.preset, nowMs, draft.custom);
	if (!e.ok) return { ok: false, reason: e.refusal };
	return { ok: true, body, expiresAt: e.expiresAt, sectionIds: ids };
}

/** "Post to 1 class", "Post to 5 classes". */
export function quickPostSendLabel(n: number): string {
	return `Post to ${n} class${n === 1 ? '' : 'es'}`;
}

/** "this class", "5 classes". */
export function quickPostClassWords(n: number): string {
	return n === 1 ? '1 class' : `${n} classes`;
}

/** The acknowledgement that stays on the board after the composer closes. */
export function quickPostPostedWords(n: number, expiresAt: string | null, nowMs: number): string {
	const until = quickPostUntilWords(expiresAt, nowMs);
	// Only the leading "Until" drops its capital: "Oct" and "PM" keep theirs.
	return `Posted to ${quickPostClassWords(n)}, ${until.charAt(0).toLowerCase()}${until.slice(1)}.`;
}

export type QuickPostRefusal =
	| 'no_classes'
	| 'empty'
	| 'too_long'
	| 'too_many'
	| 'expiry_passed'
	| 'expiry_too_far'
	| 'unavailable';

/**
 * ONE SENTENCE PER REFUSAL, in a teacher's terms (no table, no function, no
 * em dash). 0230's structured reasons and this module's own pre-checks share
 * it, so a refusal reads the same before Post is pressed and after.
 */
export function quickPostRefusalWords(reason: QuickPostRefusal | string): string {
	switch (reason) {
		case 'no_classes':
			return 'Choose at least one class to post to.';
		case 'empty':
			return 'Write something to post first.';
		case 'too_long':
			return `A quick post holds up to ${QUICK_POST_MAX_CHARS.toLocaleString(SCHOOL_LOCALE)} characters. Shorten it and post again.`;
		case 'too_many':
			return `A quick post can go to at most ${QUICK_POST_MAX_CLASSES} classes at a time.`;
		case 'expiry_passed':
			return 'That end time has already passed. Pick a later one.';
		case 'expiry_too_far':
			return 'A quick post can stay up for at most a year. Pick an earlier end, or Until I take it down.';
		case 'unavailable':
			return 'Quick posts are not switched on for this site yet.';
		default:
			return 'The notice could not be posted. Try again.';
	}
}

/* ========================================================================== */
/* Transports                                                                 */
/* ========================================================================== */

export type QuickPostReadResult =
	| { ok: true; board: QuickPostBoard }
	| { ok: false; reason: 'unavailable' | 'failed' };

export type QuickPostCreateResult =
	| { ok: true; id: string; section_ids: string[]; created_at: string; expires_at: string | null }
	| { ok: false; reason: QuickPostRefusal | 'error'; message: string };

export type QuickPostTakeDownResult =
	| { ok: true; already: boolean; section_ids: string[] }
	| { ok: false; reason: 'unavailable' | 'error'; message: string };

export interface QuickPostTransports {
	/** Re-read one section's notices. Throws `PollSignedOut` when the session is gone. */
	read(sectionId: string): Promise<QuickPostReadResult>;
	/** Post one notice to every class in `sectionIds`, in one call. */
	create(sectionIds: string[], body: string, expiresAt: string | null): Promise<QuickPostCreateResult>;
	/** Take a notice down. A stamp, never a delete. */
	takeDown(postId: string): Promise<QuickPostTakeDownResult>;
}

type RpcError = { code?: string | null; message?: string | null; status?: number | null } | null;

/** The function is not on this database yet (0230 unapplied): PGRST202, and nothing else. */
const missing = (e: RpcError) => (e?.code ?? '') === 'PGRST202';

const UNREACHABLE = 'Could not reach the class. Check your connection and try again.';

/**
 * A refusal the database raised is shown in its own words: it is a decision
 * about this request ("Only a teacher of every chosen class can post to it."),
 * never rewritten into something vaguer.
 */
function raised(e: RpcError, fallback: string): string {
	const m = (e?.message ?? '').trim();
	return m && !/fetch|network/i.test(m) ? m : fallback;
}

/**
 * THE THREE CALLS, over the caller's own client: every one is re-authorized
 * inside 0230's functions, so this is plumbing, never a boundary. Each
 * degrades on PGRST202 ALONE (the function is not there), and a read refused
 * for want of a session is THROWN, so the shared poller stops instead of
 * asking again as anon (ledger 0357).
 */
export function createQuickPostTransports(supabase: SupabaseClient): QuickPostTransports {
	return {
		async read(sectionId) {
			const { data, error, status } = await supabase.rpc('classroom_quick_posts', { p_section_id: sectionId });
			if (error) {
				if (isSignedOutFailure(error, status)) throw new PollSignedOut();
				return { ok: false, reason: missing(error) ? 'unavailable' : 'failed' };
			}
			const board = parseQuickPostBoard(data);
			return board ? { ok: true, board } : { ok: false, reason: 'failed' };
		},
		async create(sectionIds, body, expiresAt) {
			let res;
			try {
				res = await supabase.rpc('classroom_quick_post_create', {
					p_section_ids: sectionIds,
					p_body: body,
					p_expires_at: expiresAt
				});
			} catch {
				return { ok: false, reason: 'error', message: UNREACHABLE };
			}
			const { data, error } = res;
			if (error) {
				if (missing(error)) return { ok: false, reason: 'unavailable', message: quickPostRefusalWords('unavailable') };
				return { ok: false, reason: 'error', message: raised(error, UNREACHABLE) };
			}
			const r = (data ?? {}) as Record<string, unknown>;
			if (r.ok === true && typeof r.id === 'string' && isIso(r.created_at)) {
				return {
					ok: true,
					id: r.id,
					section_ids: Array.isArray(r.section_ids) ? r.section_ids.filter((x): x is string => typeof x === 'string') : [],
					created_at: r.created_at,
					expires_at: isIso(r.expires_at) ? r.expires_at : null
				};
			}
			const reason = typeof r.reason === 'string' ? r.reason : 'error';
			const known: QuickPostRefusal[] = ['no_classes', 'empty', 'too_long', 'expiry_passed', 'expiry_too_far'];
			return (known as string[]).includes(reason)
				? { ok: false, reason: reason as QuickPostRefusal, message: quickPostRefusalWords(reason) }
				: { ok: false, reason: 'error', message: quickPostRefusalWords('error') };
		},
		async takeDown(postId) {
			let res;
			try {
				res = await supabase.rpc('classroom_quick_post_take_down', { p_post_id: postId });
			} catch {
				return { ok: false, reason: 'error', message: UNREACHABLE };
			}
			const { data, error } = res;
			if (error) {
				if (missing(error)) return { ok: false, reason: 'unavailable', message: quickPostRefusalWords('unavailable') };
				return { ok: false, reason: 'error', message: raised(error, UNREACHABLE) };
			}
			const r = (data ?? {}) as Record<string, unknown>;
			if (r.ok !== true) return { ok: false, reason: 'error', message: 'The notice could not be taken down. Try again.' };
			return {
				ok: true,
				already: r.already === true,
				section_ids: Array.isArray(r.section_ids) ? r.section_ids.filter((x): x is string => typeof x === 'string') : []
			};
		}
	};
}

/**
 * THE CLASS PAGE'S READ, FOR THE SECTION LAYOUT'S LOAD: the board, or NULL for
 * any failure at all -- the function missing (0230 unapplied), a refusal, the
 * network. Null removes the notices region AND the Quick post control (the
 * hall pass's fail-soft shape): one strip of notices must never take the class
 * page down, and a control whose only answer is "not switched on" is not
 * offered. It rides in the load's existing parallel round, so it costs no
 * extra round trip.
 */
export async function loadQuickPosts(supabase: SupabaseClient, sectionId: string): Promise<QuickPostBoard | null> {
	try {
		const { data, error } = await supabase.rpc('classroom_quick_posts', { p_section_id: sectionId });
		if (error) return null;
		return parseQuickPostBoard(data);
	} catch {
		return null;
	}
}

/** The megaphone every notice wears beside the word "Notice" (24x24 stroke, the repo's mark convention). */
export const QUICK_POST_GLYPH = 'M3.5 9.5v5h3l8 4.5V5l-8 4.5zM6.5 14.5l1.5 5h2.5l-1-4.4M18 9a3.5 3.5 0 0 1 0 6M20 6.5a7 7 0 0 1 0 11';
