/**
 * THE UPLOAD SEQUENCE BEHIND ONE-STEP CAPTURE (ledger 0297, package F4b).
 *
 * A photo is uploaded THE MOMENT IT IS TAKEN, as a draft, and nothing about
 * it is ever held only in memory:
 *
 *   1. its bytes are written to this device (`CaptureStore`) first;
 *   2. the FIRST photo of a filing with no draft yet POSTs
 *      `/api/notebook/upload` with `submitted=false` and gets the entry id
 *      back; every later photo POSTs `/api/notebook/add-photo` on that id;
 *   3. the device copy is deleted only when the server has acknowledged it.
 *
 * Turn in is one RPC afterwards, and it is the component's, not this
 * module's: this module never decides that the work is finished.
 *
 * ONE AT A TIME, IN THE ORDER THEY WERE TAKEN, AND A FAILURE HOLDS THE LINE.
 * `notebook_add_photo` appends at max+1, so the order photos LAND is the page
 * order, and a corrected version pairs with the page immediately before it
 * (`straightenTarget`). Sending in parallel, or letting a later photo overtake
 * one that failed, would reorder pages and could hand a correction to the
 * wrong page. So a failed photo stops the queue until it is retried or
 * discarded, and says so.
 *
 * A RETRY NEVER DUPLICATES A PAGE. The routes have no idempotency key, so any
 * attempt whose outcome is unknown (a thrown request, a 5xx, a tab that died
 * mid-upload) is marked `verifyFirst`, and before it is sent again the entry's
 * photos are re-read for the exact name the capture travels under
 * (`captureUploadName`). Found: it landed, and it is marked uploaded without a
 * second request. Could not read: it waits, rather than guessing. A refusal
 * the server CONSIDERED (a 4xx) is known not to have landed and is sent again
 * as it is.
 *
 * Plain TypeScript with an injected clock, transports and store, so every rule
 * above is asserted in node (tests/notebook-capture.test.ts). The component
 * copies `items` into its own state on each change.
 */

import type { AddPhotoResult, CreateEntryResult } from '$lib/notebook';
import {
	captureToken,
	captureUploadName,
	type CaptureFiling,
	type CaptureState
} from '$lib/notebook/capture';
import {
	captureStoreKey,
	storeWriteNotice,
	type CaptureStore,
	type StoredCapture
} from '$lib/notebook/capture-store';

export interface CaptureItem {
	token: string;
	uploadName: string;
	variant: 'original' | 'enhanced';
	/** The original this is a corrected version of, for a corrected one. */
	pairOf: string | null;
	state: CaptureState;
	/** The bytes are in this device's storage (survive a reload). */
	kept: boolean;
	error: string | null;
	/** Held until acknowledged; dropped once uploaded. */
	blob: Blob | null;
	type: string;
	takenAt: number;
	/** The last attempt's outcome is unknown: re-read before sending again. */
	verifyFirst: boolean;
}

/** What the queue sends through; the real ones are `createNotebookTransports`'s. */
export interface CaptureTransports {
	createEntry: (form: FormData) => Promise<CreateEntryResult>;
	addPhoto: (form: FormData) => Promise<AddPhotoResult>;
	/**
	 * Which entry already holds a photo stored under exactly this name. `null`
	 * is a read that found none; `'unknown'` is a read that failed.
	 */
	findUpload: (uploadName: string) => Promise<{ entryId: string } | null | 'unknown'>;
}

export interface CaptureQueueOptions {
	viewer: string;
	filing: CaptureFiling;
	/** The draft this capture continues, when the server already has one. */
	entryId: string | null;
	transports: CaptureTransports;
	store: CaptureStore | null;
	now?: () => number;
	random?: (n: number) => Uint8Array;
	onChange?: () => void;
	/** Shrinks a camera photo under the upload cap; the identity when absent. */
	prepare?: (file: File) => Promise<File>;
}

export const CAPTURE_WAITING_NOTE = 'Waiting for the photo before it.';
export const CAPTURE_UNCHECKED_NOTE =
	'Could not check whether this photo already uploaded. It is still kept here; try again.';

export class CaptureQueue {
	readonly viewer: string;
	readonly filing: CaptureFiling;
	items: CaptureItem[] = [];
	entryId: string | null;
	/** A storage refusal said out loud, or null. */
	notice: string | null = null;

	#t: CaptureTransports;
	#store: CaptureStore | null;
	#now: () => number;
	#random?: (n: number) => Uint8Array;
	#onChange: () => void;
	#prepare: (file: File) => Promise<File>;
	#running: Promise<void> | null = null;
	#closed = false;

	constructor(o: CaptureQueueOptions) {
		this.viewer = o.viewer;
		this.filing = o.filing;
		this.entryId = o.entryId;
		this.#t = o.transports;
		this.#store = o.store;
		this.#now = o.now ?? (() => Date.now());
		this.#random = o.random;
		this.#onChange = o.onChange ?? (() => {});
		this.#prepare = o.prepare ?? (async (f) => f);
	}

	/** Photos the server has not acknowledged yet. */
	get pending(): number {
		return this.items.filter((i) => i.state !== 'uploaded').length;
	}

	/** Nothing in flight and nothing waiting that could be sent. */
	get idle(): boolean {
		return !this.#running;
	}

	close(): void {
		this.#closed = true;
	}

	#changed(): void {
		if (!this.#closed) this.#onChange();
	}

	#key(token: string): string {
		return captureStoreKey(this.viewer, this.filing.key, token);
	}

	/**
	 * Pick up what a previous tab left on this device for this filing. Every
	 * one of them has an unknown outcome (the tab may have died after the
	 * server stored it and before it heard back), so each is re-read first.
	 */
	async resume(): Promise<void> {
		if (!this.#store) return;
		const stored = await this.#store.list(this.viewer, this.filing.key, this.#now());
		const known = new Set(this.items.map((i) => i.token));
		for (const r of stored) {
			if (known.has(r.token)) continue;
			this.items.push(fromStored(r));
			if (!this.entryId && r.entryId) this.entryId = r.entryId;
		}
		this.items.sort((a, b) => a.takenAt - b.takenAt);
		this.#changed();
		await this.drain();
	}

	/**
	 * Take a photo. It is written to this device BEFORE anything is sent, and
	 * the upload starts at once. Resolves when the queue has settled.
	 */
	async add(
		file: File,
		options: { variant?: 'original' | 'enhanced'; pairOf?: string | null } = {}
	): Promise<CaptureItem> {
		const variant = options.variant ?? 'original';
		const token = captureToken(this.#random);
		const prepared = await this.#prepare(file).catch(() => file);
		const item: CaptureItem = {
			token,
			uploadName: captureUploadName(prepared.name || file.name, token),
			variant,
			pairOf: variant === 'enhanced' ? (options.pairOf ?? null) : null,
			state: 'memory',
			kept: false,
			error: null,
			blob: prepared,
			type: prepared.type || 'image/jpeg',
			takenAt: this.#now(),
			verifyFirst: false
		};
		// KEPT FIRST, THEN QUEUED: the queue never sees a photo whose device
		// copy is still being written, so an upload cannot land and delete a
		// record that a slow write then puts back.
		await this.#keep(item);
		this.items.push(item);
		this.#changed();
		void this.drain();
		return item;
	}

	async #keep(item: CaptureItem): Promise<void> {
		if (!this.#store || !item.blob) {
			item.state = 'memory';
			return;
		}
		const record: StoredCapture = {
			key: this.#key(item.token),
			viewer: this.viewer,
			filing: this.filing.key,
			token: item.token,
			uploadName: item.uploadName,
			variant: item.variant,
			entryId: this.entryId,
			takenAt: item.takenAt,
			blob: item.blob,
			type: item.type
		};
		const result = await this.#store.put(record);
		item.kept = result === 'ok';
		if (item.state === 'memory' || item.state === 'device') item.state = item.kept ? 'device' : 'memory';
		const notice = storeWriteNotice(result);
		if (notice) this.notice = notice;
		this.#changed();
	}

	/** Send it again; a photo whose last outcome is unknown is re-read first. */
	retry(token: string): Promise<void> {
		const item = this.items.find((i) => i.token === token);
		if (item && item.state === 'failed') {
			item.state = item.kept ? 'device' : 'memory';
			item.error = null;
			this.#changed();
		}
		return this.drain();
	}

	/**
	 * Give up on a photo that has not landed, and its corrected version with
	 * it: a correction without its page would pair with the page before.
	 */
	async discard(token: string): Promise<void> {
		const drop = this.items.filter(
			(i) => (i.token === token || i.pairOf === token) && i.state !== 'uploaded' && i.state !== 'uploading'
		);
		if (!drop.length) return;
		this.items = this.items.filter((i) => !drop.includes(i));
		for (const i of drop) await this.#store?.remove(this.#key(i.token));
		this.#changed();
		await this.drain();
	}

	/** Start the next draft: after Turn in, nothing here continues that entry. */
	startNewDraft(): void {
		this.entryId = null;
		this.items = this.items.filter((i) => i.state !== 'uploaded');
		this.#changed();
	}

	/** Upload what is waiting, one at a time, in order. Idempotent. */
	drain(): Promise<void> {
		if (this.#running) return this.#running;
		this.#running = this.#run().finally(() => {
			this.#running = null;
		});
		return this.#running;
	}

	async #run(): Promise<void> {
		while (!this.#closed) {
			const next = this.items.find((i) => i.state !== 'uploaded');
			if (!next) return;
			// A FAILURE HOLDS THE LINE: everything after it waits, in order.
			if (next.state === 'failed') return;
			await this.#send(next);
		}
	}

	async #send(item: CaptureItem): Promise<void> {
		if (item.verifyFirst) {
			const found = await this.#t.findUpload(item.uploadName).catch(() => 'unknown' as const);
			if (found === 'unknown') {
				item.state = 'failed';
				item.error = CAPTURE_UNCHECKED_NOTE;
				this.#changed();
				return;
			}
			if (found) {
				if (!this.entryId) this.entryId = found.entryId;
				await this.#landed(item);
				return;
			}
			item.verifyFirst = false;
		}

		item.state = 'uploading';
		item.error = null;
		this.#changed();
		const photo = new File([item.blob as Blob], item.uploadName, { type: item.type });
		const form = new FormData();
		form.set('photo', photo);
		try {
			if (!this.entryId) {
				if (item.variant !== 'original') {
					// Nothing to correct yet: a corrected version cannot start an entry.
					this.#fail(item, 'This straightened copy has no page to join. Discard it and take the page again.', false);
					return;
				}
				form.set('section_id', this.filing.sectionId);
				if (this.filing.sessionId) form.set('session_id', this.filing.sessionId);
				if (this.filing.customLabel) form.set('custom_label', this.filing.customLabel);
				form.set('submitted', 'false');
				const res = await this.#t.createEntry(form);
				if (!res.ok) {
					this.#fail(item, res.error, res.retryable !== false);
					return;
				}
				this.entryId = res.entryId;
			} else {
				form.set('entry_id', this.entryId);
				form.set('variant', item.variant);
				const res = await this.#t.addPhoto(form);
				if (!res.ok) {
					// This route carries no status, so the outcome is unknown.
					this.#fail(item, res.error, true);
					return;
				}
			}
		} catch (err) {
			this.#fail(item, (err as Error)?.message || 'The upload did not reach the server.', true);
			return;
		}
		await this.#landed(item);
	}

	#fail(item: CaptureItem, message: string, unknownOutcome: boolean): void {
		item.state = 'failed';
		item.error = message;
		item.verifyFirst = unknownOutcome;
		this.#changed();
	}

	async #landed(item: CaptureItem): Promise<void> {
		item.state = 'uploaded';
		item.error = null;
		item.verifyFirst = false;
		// Acknowledged: the device copy goes now and not before.
		await this.#store?.remove(this.#key(item.token));
		item.kept = false;
		item.blob = null;
		this.#changed();
	}
}

function fromStored(r: StoredCapture): CaptureItem {
	return {
		token: r.token,
		uploadName: r.uploadName,
		variant: r.variant,
		pairOf: null,
		state: 'device',
		kept: true,
		error: null,
		blob: r.blob,
		type: r.type,
		takenAt: r.takenAt,
		verifyFirst: true
	};
}
