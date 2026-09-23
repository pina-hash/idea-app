/**
 * TODAY'S AGENDA FOR ONE CLASS (ledger 0297, package LIVE): the pure half.
 *
 * Two sources, one list. What the class already has for today is DERIVED from
 * the class's own items and check-ins -- what went live today, what is due
 * today, which notebook check-in is today's -- so the teacher never retypes a
 * title the class page already carries. What only the teacher knows ("Warm-up:
 * sketch the truss from memory", "Clean up at 10:40") is TYPED, and kept on
 * this device.
 *
 * WHY THE TYPED LINES LIVE IN `localStorage` AND THAT IS ENOUGH. An agenda is
 * typed and projected from the one machine at the front of the room, for one
 * period, and read off the wall by the class; nobody else reads it later and
 * nothing is graded from it. Losing it costs retyping two or three lines. So it
 * is kept per device, per viewer, per class and per school day, which is
 * exactly the span it is true for -- tomorrow's page starts from tomorrow's
 * derived lines and an empty typed list. If Mr. Pina ever wants an agenda
 * planned from home the night before, or one Mr. Cosso can see for Block 4,
 * that is a per-section row and a migration, and it is written up as such
 * rather than faked here.
 *
 * WHAT MAY REACH THE WALL. Only what the class can already see: an item that is
 * live now, or one scheduled to open later today that the teacher chose to
 * show. A draft never appears in the derived list at all, and a scheduled item
 * starts hidden, because a projected title is a published title.
 *
 * No Svelte, no DOM, no clock: `now` and `today` arrive as arguments, the same
 * way every other surface in the classroom takes the loader's one clock read.
 * The storage helpers take the Storage object, so a test hands them a map.
 */

import { itemTitle, type ClassroomItem } from '$lib/classroom/classroom';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import { SCHOOL_LOCALE, SCHOOL_TIME_ZONE, schoolDayOf } from '$lib/classroom/school-calendar';

/** One line of the agenda, derived or typed. */
export interface AgendaLine {
	/** Stable across reloads: `item:<id>`, `checkin:<id>` or `typed:<n>`. */
	key: string;
	/** The words on the wall. */
	text: string;
	/** A short time note ("Due 11:59 PM", "Opens 1:15 PM"), or null. */
	when: string | null;
	source: 'item' | 'check-in' | 'typed';
	/** Whether the line goes on the wall until the teacher says otherwise. */
	shownByDefault: boolean;
}

/** What this device keeps for one class on one day. */
export interface AgendaStore {
	/** The teacher's own lines, in the order they were written. */
	typed: { key: string; text: string }[];
	/** Derived lines the teacher took off the wall. */
	hidden: string[];
	/** Scheduled lines the teacher put ON the wall (they start hidden). */
	shown: string[];
}

/** The most lines a teacher may type, and the longest one: what a wall can hold. */
export const AGENDA_MAX_TYPED = 12;
export const AGENDA_MAX_CHARS = 140;

export const EMPTY_AGENDA: AgendaStore = { typed: [], hidden: [], shown: [] };

function timeLabel(iso: string): string {
	return new Date(iso).toLocaleTimeString(SCHOOL_LOCALE, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: SCHOOL_TIME_ZONE
	});
}

function stamp(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : null;
}

/**
 * THE DERIVED HALF. In reading order: today's notebook check-ins first (the
 * notebook page is a routine every period starts from), then items by the time
 * that makes them today's -- due time for work due today, go-live time for
 * what opened today.
 */
export function derivedAgenda(
	items: readonly ClassroomItem[],
	checkIns: readonly ClassCheckIn[],
	today: string,
	now: number
): AgendaLine[] {
	const lines: { line: AgendaLine; order: number }[] = [];
	for (const c of checkIns) {
		if (c.session_date !== today) continue;
		lines.push({
			line: {
				key: `checkin:${c.session_id}`,
				text: `Notebook check-in: ${c.session_label}`,
				when: null,
				source: 'check-in',
				shownByDefault: true
			},
			order: -1
		});
	}
	for (const item of items) {
		if (!item.published) continue;
		const opens = stamp(item.publish_at ?? null);
		const live = opens === null || opens <= now;
		const dueToday = !!item.due_at && schoolDayOf(item.due_at) === today;
		const opensToday = !live && opens !== null && schoolDayOf(item.publish_at ?? null) === today;
		const postedToday = live && schoolDayOf(item.first_published_at ?? item.publish_at ?? null) === today;
		if (!(dueToday && live) && !opensToday && !postedToday) continue;
		const when =
			dueToday && item.due_at
				? `Due ${timeLabel(item.due_at)}`
				: opensToday && item.publish_at
					? `Opens ${timeLabel(item.publish_at)}`
					: null;
		const order = dueToday
			? (stamp(item.due_at) ?? 0)
			: (stamp(opensToday ? (item.publish_at ?? null) : item.first_published_at) ?? 0);
		lines.push({
			line: {
				key: `item:${item.id}`,
				text: itemTitle(item),
				when,
				source: 'item',
				shownByDefault: live
			},
			order
		});
	}
	return lines.sort((a, b) => a.order - b.order).map((l) => l.line);
}

/** The whole agenda: derived lines, then the teacher's own, each with whether it is on the wall. */
export function agendaLines(
	derived: readonly AgendaLine[],
	store: AgendaStore
): (AgendaLine & { onWall: boolean })[] {
	const hidden = new Set(store.hidden);
	const shown = new Set(store.shown);
	return [
		...derived.map((l) => ({
			...l,
			onWall: l.shownByDefault ? !hidden.has(l.key) : shown.has(l.key)
		})),
		...store.typed.map((t) => ({
			key: t.key,
			text: t.text,
			when: null,
			source: 'typed' as const,
			shownByDefault: true,
			onWall: !hidden.has(t.key)
		}))
	];
}

/** The strings the projector shows, in order. Nothing else about a line crosses to the wall. */
export function wallAgenda(lines: readonly (AgendaLine & { onWall: boolean })[]): string[] {
	return lines.filter((l) => l.onWall).map((l) => (l.when ? `${l.text} · ${l.when}` : l.text));
}

/** Flip one line on or off the wall. */
export function toggleAgendaLine(store: AgendaStore, line: Pick<AgendaLine, 'key' | 'shownByDefault'>): AgendaStore {
	if (line.shownByDefault) {
		const hidden = store.hidden.includes(line.key)
			? store.hidden.filter((k) => k !== line.key)
			: [...store.hidden, line.key];
		return { ...store, hidden };
	}
	const shown = store.shown.includes(line.key)
		? store.shown.filter((k) => k !== line.key)
		: [...store.shown, line.key];
	return { ...store, shown };
}

/** Add a typed line, trimmed and capped. Unchanged when the text is empty or the list is full. */
export function addAgendaLine(store: AgendaStore, text: string): AgendaStore {
	const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, AGENDA_MAX_CHARS);
	if (!clean || store.typed.length >= AGENDA_MAX_TYPED) return store;
	const used = new Set(store.typed.map((t) => t.key));
	let n = store.typed.length + 1;
	while (used.has(`typed:${n}`)) n += 1;
	return { ...store, typed: [...store.typed, { key: `typed:${n}`, text: clean }] };
}

/** Remove a typed line (and forget whether it was hidden). */
export function removeAgendaLine(store: AgendaStore, key: string): AgendaStore {
	return {
		...store,
		typed: store.typed.filter((t) => t.key !== key),
		hidden: store.hidden.filter((k) => k !== key)
	};
}

/** Move a typed line one place up or down. */
export function moveAgendaLine(store: AgendaStore, key: string, by: -1 | 1): AgendaStore {
	const i = store.typed.findIndex((t) => t.key === key);
	const j = i + by;
	if (i < 0 || j < 0 || j >= store.typed.length) return store;
	const typed = store.typed.slice();
	[typed[i], typed[j]] = [typed[j], typed[i]];
	return { ...store, typed };
}

// ---------------------------------------------------------------------------
// This device's copy
// ---------------------------------------------------------------------------

const PREFIX = 'idea_live_agenda';

/** One slot per viewer, per class, per school day. */
export function agendaStorageKey(viewer: string, sectionId: string, day: string): string {
	return `${PREFIX}:${viewer}:${sectionId}:${day}`;
}

/** The value if it is an agenda this build can read; the empty agenda otherwise. Never coerced. */
export function parseAgendaStore(value: unknown): AgendaStore {
	if (!value || typeof value !== 'object') return EMPTY_AGENDA;
	const v = value as Record<string, unknown>;
	const strings = (x: unknown) =>
		Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, 64) : [];
	const typed = Array.isArray(v.typed)
		? v.typed
				.filter(
					(t): t is { key: string; text: string } =>
						!!t &&
						typeof t === 'object' &&
						typeof (t as { key?: unknown }).key === 'string' &&
						typeof (t as { text?: unknown }).text === 'string'
				)
				.map((t) => ({ key: t.key, text: t.text.slice(0, AGENDA_MAX_CHARS) }))
				.slice(0, AGENDA_MAX_TYPED)
		: [];
	return { typed, hidden: strings(v.hidden), shown: strings(v.shown) };
}

/** Read this device's agenda. Storage can throw (blocked site data); that reads as empty. */
export function readAgendaStore(storage: Pick<Storage, 'getItem'> | null, key: string): AgendaStore {
	try {
		const raw = storage?.getItem(key);
		return raw ? parseAgendaStore(JSON.parse(raw)) : EMPTY_AGENDA;
	} catch {
		return EMPTY_AGENDA;
	}
}

/**
 * Write this device's agenda, and drop the same viewer's slots for this class
 * on other days, so a term of periods does not pile up. False when storage
 * refused: the caller says so rather than pretending the lines will survive a
 * reload.
 */
export function writeAgendaStore(
	storage: Pick<Storage, 'setItem' | 'removeItem' | 'key' | 'length'> | null,
	key: string,
	value: AgendaStore
): boolean {
	if (!storage) return false;
	try {
		const stem = key.slice(0, key.lastIndexOf(':') + 1);
		const stale: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const k = storage.key(i);
			if (k && k !== key && k.startsWith(stem)) stale.push(k);
		}
		for (const k of stale) storage.removeItem(k);
		storage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}
