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
