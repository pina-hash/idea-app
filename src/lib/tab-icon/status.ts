/**
 * THE TAB ICON'S STATUS REGISTRY: who has raised what, and which one shows
 * (ledger 0396). Pure: no DOM, and the timer is injected, so every rule here
 * is assertable in node with a fake clock.
 *
 * A caller RAISES a status and gets a handle back; it CLEARS the handle when
 * the thing is over. Several callers can hold statuses at once (two autosaving
 * fields, an upload and an unread count), so the registry holds them all and
 * answers one question: what should the tab show now?
 *
 * PRIORITY, highest first: error, live, unread, attention, progress, saving,
 * done, offline, then the resting icon. Between two statuses of the same kind
 * the one raised LAST shows, except unread, whose counts ADD UP: two sources
 * of unread things are more unread things, and the title prints the total.
 *
 * DONE CLEARS ITSELF after `DONE_CLEAR_MS`; a saved mark that lingered would
 * read as a claim about a save that happened long ago. ERROR NEVER DOES: an
 * error is over when the thing that raised it says so (a retry landed, the
 * work was discarded, the surface went away), not when a timer guesses.
 */

import type { TabIconKind, TabIconStatus } from './geometry';

/** A status a caller can raise: every kind but the resting one. */
export type TabStatusKind = Exclude<TabIconKind, 'none'>;

/** Highest first. The order the design decided; the README carries it in words. */
export const TAB_STATUS_PRIORITY: readonly TabStatusKind[] = [
	'error',
	'live',
	'unread',
	'attention',
	'progress',
	'saving',
	'done',
	'offline'
];

/** How long a done mark stays before it clears itself. */
export const DONE_CLEAR_MS = 4000;

export interface TabStatusOptions {
	/** Unread count. A count of 0 or less shows nothing. */
	n?: number;
	/** Progress from 0 to 1. Clamped; anything not a number reads as 0. */
	p?: number;
}

export interface TabStatusHandle {
	readonly kind: TabStatusKind;
	/** False once cleared (by the caller, or by the done timer). */
	readonly active: boolean;
	/** Change the count or the fraction without re-raising. */
	update(opts: TabStatusOptions): void;
	/** End this status. Safe to call twice. */
	clear(): void;
}

export interface TabStatusTimers {
	set: (fn: () => void, ms: number) => unknown;
	clear: (id: unknown) => void;
}

interface Entry {
	kind: TabStatusKind;
	seq: number;
	n: number;
	p: number;
	timer: unknown;
}

const clamp01 = (p: unknown): number => {
	const v = typeof p === 'number' && Number.isFinite(p) ? p : 0;
	return v < 0 ? 0 : v > 1 ? 1 : v;
};
const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0);

/** A handle that does nothing, for a caller with no tab to paint (the server). */
export const INERT_HANDLE: TabStatusHandle = Object.freeze({
	kind: 'done' as const,
	active: false,
	update() {},
	clear() {}
});

export interface TabStatusRegistry {
	raise(kind: TabStatusKind, opts?: TabStatusOptions): TabStatusHandle;
	clear(handle: TabStatusHandle | null | undefined): void;
	/** The winning status, as the drawing reads it. */
	current(): TabIconStatus;
	/** The total unread count across every unread status (0 when none). */
	unread(): number;
	/** Called after every change. Returns the unsubscribe. */
	subscribe(fn: () => void): () => void;
	/** Clear everything (tests and teardown). */
	reset(): void;
}

export function createTabStatusRegistry(
	timers: TabStatusTimers = {
		set: (fn, ms) => setTimeout(fn, ms),
		clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
	}
): TabStatusRegistry {
	const entries = new Map<number, Entry>();
	const listeners = new Set<() => void>();
	let seq = 0;

	const notify = () => {
		for (const fn of [...listeners]) fn();
	};

	function drop(id: number): void {
		const e = entries.get(id);
		if (!e) return;
		if (e.timer !== undefined) timers.clear(e.timer);
		entries.delete(id);
		notify();
	}

	function raise(kind: TabStatusKind, opts: TabStatusOptions = {}): TabStatusHandle {
		const id = ++seq;
		const entry: Entry = { kind, seq: id, n: count(opts.n), p: clamp01(opts.p), timer: undefined };
		if (kind === 'done') entry.timer = timers.set(() => drop(id), DONE_CLEAR_MS);
		entries.set(id, entry);
		notify();
		return {
			kind,
			get active() {
				return entries.has(id);
			},
			update(next: TabStatusOptions) {
				const e = entries.get(id);
				if (!e) return;
				const n = next.n === undefined ? e.n : count(next.n);
				const p = next.p === undefined ? e.p : clamp01(next.p);
				if (n === e.n && p === e.p) return;
				e.n = n;
				e.p = p;
				notify();
			},
			clear() {
				drop(id);
			}
		};
	}

	function unread(): number {
		let total = 0;
		for (const e of entries.values()) if (e.kind === 'unread' && e.n > 0) total += e.n;
		return total;
	}

	function current(): TabIconStatus {
		for (const kind of TAB_STATUS_PRIORITY) {
			if (kind === 'unread') {
				const n = unread();
				if (n > 0) return { kind, n };
				continue;
			}
			let latest: Entry | null = null;
			for (const e of entries.values()) if (e.kind === kind && (!latest || e.seq > latest.seq)) latest = e;
			if (latest) return kind === 'progress' ? { kind, p: latest.p } : { kind };
		}
		return { kind: 'none' };
	}

	return {
		raise,
		clear: (handle) => handle?.clear(),
		current,
		unread,
		subscribe(fn) {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
		reset() {
			for (const e of entries.values()) if (e.timer !== undefined) timers.clear(e.timer);
			entries.clear();
			notify();
		}
	};
}
