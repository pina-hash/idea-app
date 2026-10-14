/**
 * FORCE CHECK IN, ONE BEHAVIOUR WHEREVER IT IS OFFERED (Armory v0.3 item 2).
 * The Files view's rows and the Checked out table both offer it, so the arming,
 * the busy flag and the words for each answer live here once: a second copy of
 * "press once to arm, again to act" is two keys that disagree about what is
 * armed. Only one file is armed at a time on a page.
 *
 * The transport is `armory_break_lock`, the same RPC the app's own button
 * calls. Its refusals are matched by text in `breakLockWords`.
 */
import { bulkForceWords, type BulkTally } from './checkouts';
import { breakLockWords } from './view';

export type ForceOutcome = { ok: true } | { ok: false; message: string };

export class ForceCheckIn {
	/** The armed file id, or null. */
	armed = $state<string | null>(null);
	busy = $state(false);
	message = $state('');
	bad = $state(false);

	readonly #take: (fileId: string) => Promise<ForceOutcome>;

	constructor(take: (fileId: string) => Promise<ForceOutcome>) {
		this.#take = take;
	}

	/** The first press arms and says what it costs; the second acts. */
	async press(fileId: string, fileName: string): Promise<void> {
		if (this.busy) return;
		if (this.armed !== fileId) {
			this.armed = fileId;
			this.message = '';
			return;
		}
		this.busy = true;
		try {
			const r = await this.#take(fileId);
			this.bad = !r.ok;
			this.message = r.ok ? `Checked in. ${fileName} is available again.` : breakLockWords(r.message);
			this.armed = null;
		} finally {
			this.busy = false;
		}
	}

	disarm(): void {
		this.armed = null;
	}
}

export type BulkForceOutcome = ({ ok: true } & BulkTally) | { ok: false; message: string };

/** One spelling of "this set of files", whatever order or repeats it arrives in. */
export function bulkArmKey(ids: readonly string[]): string {
	return [...new Set(ids)].sort().join('\n');
}

/**
 * FORCE CHECK IN, MANY AT ONCE (ledger 0380, report f62ce574). The same
 * "press once to arm, again to act" as the single key, over a SELECTION, and
 * the same `armory_break_lock` rule per file through `armory_break_locks`.
 * Any change to the selection disarms, because the second press must act on
 * exactly the files the first one named. The arming is the SET, not its count:
 * keyed on the count, a filter that swapped the files shown for as many others
 * kept the key armed, and the next press checked in files nobody had been
 * warned about. A set the arming does not name reads unarmed (`armedFor`) and
 * a press on it arms afresh. Files that were refused stay ticked, so pressing
 * again retries those and nothing else.
 */
export class BulkForceCheckIn {
	selected = $state<Set<string>>(new Set());
	/** The exact set the first press armed (`bulkArmKey`), or null. */
	armed = $state<string | null>(null);
	busy = $state(false);
	message = $state('');
	bad = $state(false);

	readonly #take: (fileIds: string[]) => Promise<BulkForceOutcome>;

	constructor(take: (fileIds: string[]) => Promise<BulkForceOutcome>) {
		this.#take = take;
	}

	toggle(id: string, on: boolean): void {
		const next = new Set(this.selected);
		if (on) next.add(id);
		else next.delete(id);
		this.selected = next;
		this.armed = null;
	}

	set(ids: Iterable<string>): void {
		this.selected = new Set(ids);
		this.armed = null;
	}

	clear(): void {
		this.set([]);
	}

	/** Whether the first press armed exactly these files. */
	armedFor(ids: readonly string[]): boolean {
		return ids.length > 0 && this.armed === bulkArmKey(ids);
	}

	/** `ids` is what the surface shows ticked now (the selection intersected with the view). */
	async press(ids: string[]): Promise<void> {
		if (this.busy || ids.length === 0) return;
		if (!this.armedFor(ids)) {
			this.armed = bulkArmKey(ids);
			this.message = '';
			return;
		}
		this.busy = true;
		try {
			const r = await this.#take(ids);
			if (!r.ok) {
				this.bad = true;
				this.message = breakLockWords(r.message);
			} else {
				this.bad = r.refused > 0;
				this.message = bulkForceWords(r, breakLockWords);
				this.selected = new Set(r.refusedIds);
			}
			this.armed = null;
		} finally {
			this.busy = false;
		}
	}

	disarm(): void {
		this.armed = null;
	}
}
