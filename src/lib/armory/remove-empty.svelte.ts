/**
 * REMOVE A FILE THAT HAS NO FIRST VERSION (Armory 0.3.3 item 2, 0236
 * `armory_remove_empty_file`), the same two presses as Force check in: the
 * first arms and says what it does, the second sends. Only one file is armed
 * at a time on a page. Offered only to a caller the server's own
 * `armory_can_take_back` admits (a mentor, a CAD lead, an instructor or a site
 * admin): the route hands the transport in only then, and an absent transport
 * is no control.
 */
import { removeEmptyWords } from './view';

export type RemoveEmptyOutcome = { ok: true } | { ok: false; message: string; code?: string };

export class RemoveEmptyFile {
	/** The armed file id, or null. */
	armed = $state<string | null>(null);
	busy = $state(false);
	message = $state('');
	bad = $state(false);

	readonly #remove: (fileId: string) => Promise<RemoveEmptyOutcome>;

	constructor(remove: (fileId: string) => Promise<RemoveEmptyOutcome>) {
		this.#remove = remove;
	}

	async press(fileId: string, fileName: string): Promise<void> {
		if (this.busy) return;
		if (this.armed !== fileId) {
			this.armed = fileId;
			this.message = '';
			return;
		}
		this.busy = true;
		try {
			const r = await this.#remove(fileId);
			this.bad = !r.ok;
			this.message = r.ok ? `Removed ${fileName}. Its name is free in the project again.` : removeEmptyWords(r.message, r.code);
			this.armed = null;
		} finally {
			this.busy = false;
		}
	}

	disarm(): void {
		this.armed = null;
	}
}
