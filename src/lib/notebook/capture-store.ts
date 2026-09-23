/**
 * THE PHOTOS A CAPTURE HAS TAKEN AND THE SERVER HAS NOT YET ACKNOWLEDGED,
 * KEPT IN THIS BROWSER (ledger 0297, package F4b).
 *
 * A photo is uploaded the moment it is taken, but between the shutter and the
 * server's answer the picture exists nowhere else: a closed tab, a dead
 * battery, a deploy or dead school wifi used to take it. So the bytes are
 * written here FIRST and deleted only when the upload is acknowledged. A tab
 * that comes back finds them and sends them again (through the retry that
 * checks whether the first attempt landed; see `captureLanded`).
 *
 * The draft mirror's rules, for bytes instead of text (CLAUDE.md, the mirror
 * pattern; this is a new module rather than a caller of `draft-mirror.ts`
 * because the payload is a Blob and localStorage cannot hold one):
 *
 *   - ONE NAMESPACED DATABASE, `idea-notebook-capture`, so a sweep of this
 *     feature's storage is one name.
 *   - KEYED PER VIEWER AND PER RECORD: `<viewer>|<filing key>|<token>`. The
 *     viewer segment is what stops a shared school desktop handing one
 *     student another's photographs; the filing segment is what lets a
 *     capture find only its own.
 *   - IT EXPIRES after `CAPTURE_STORE_MAX_AGE_MS` (24 hours), and the cap is
 *     about exposure: a photograph of a student's notebook sitting in plain
 *     browser storage on a lab machine.
 *   - A QUOTA REFUSAL IS SAID OUT LOUD AND NEVER THROWN. Every method answers
 *     a value; storage that is full, blocked, or absent (a private window, a
 *     browser with site data off) is an answer the capture shows the student
 *     ("Only in this tab"), not an exception that kills the page.
 *   - WHAT IT CANNOT HOLD: nothing survives clearing site data, and a browser
 *     with storage off keeps the photo only in the tab until it uploads. The
 *     capture says so while that is the case.
 */

export const CAPTURE_DB_NAME = 'idea-notebook-capture';
export const CAPTURE_STORE_NAME = 'captures';
export const CAPTURE_STORE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One photo taken and not yet acknowledged. */
export interface StoredCapture {
	/** `<viewer>|<filing key>|<token>` */
	key: string;
	viewer: string;
	filing: string;
	token: string;
	/** The name it travels under (`captureUploadName`), which carries the token. */
	uploadName: string;
	variant: 'original' | 'enhanced';
	/** The draft it is joining, when one existed when it was taken. */
	entryId: string | null;
	takenAt: number;
	blob: Blob;
	type: string;
}

export type StoreWrite = 'ok' | 'full' | 'blocked';

/** What the capture needs from storage; every method resolves, never rejects. */
export interface CaptureStore {
	put(record: StoredCapture): Promise<StoreWrite>;
	remove(key: string): Promise<void>;
	/** Unexpired records for this viewer and filing, oldest first; expired ones are swept. */
	list(viewer: string, filing: string, now: number): Promise<StoredCapture[]>;
}

export function captureStoreKey(viewer: string, filing: string, token: string): string {
	return `${viewer || 'anon'}|${filing}|${token}`;
}

/** A refusal named in the student's terms, or null when the write landed. */
export function storeWriteNotice(result: StoreWrite): string | null {
	if (result === 'full') return 'This device is out of space, so this photo is only in this tab until it uploads.';
	if (result === 'blocked') return 'This browser does not keep photos, so this one is only in this tab until it uploads.';
	return null;
}

function expired(record: Pick<StoredCapture, 'takenAt'>, now: number): boolean {
	return !(record.takenAt > now - CAPTURE_STORE_MAX_AGE_MS) || record.takenAt > now + 60_000;
}

function sortOldest(records: StoredCapture[]): StoredCapture[] {
	return records.sort((a, b) => a.takenAt - b.takenAt || a.key.localeCompare(b.key));
}

/** In memory: tests, and the fallback where IndexedDB is missing. Never throws. */
export class MemoryCaptureStore implements CaptureStore {
	readonly records = new Map<string, StoredCapture>();
	/** What the next put answers, for tests of a full or blocked store. */
	refuse: StoreWrite | null = null;

	async put(record: StoredCapture): Promise<StoreWrite> {
		if (this.refuse) return this.refuse;
		this.records.set(record.key, record);
		return 'ok';
	}
	async remove(key: string): Promise<void> {
		this.records.delete(key);
	}
	async list(viewer: string, filing: string, now: number): Promise<StoredCapture[]> {
		const out: StoredCapture[] = [];
		for (const r of [...this.records.values()]) {
			if (r.viewer !== viewer || r.filing !== filing) continue;
			if (expired(r, now)) {
				this.records.delete(r.key);
				continue;
			}
			out.push(r);
		}
		return sortOldest(out);
	}
}

/** Treats every failure as "not kept", which is the answer the UI reports. */
function quota(err: unknown): StoreWrite {
	const name = (err as { name?: string } | null)?.name ?? '';
	return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' ? 'full' : 'blocked';
}

/** IndexedDB, one database, one object store keyed on `key`. */
export class IdbCaptureStore implements CaptureStore {
	#db: Promise<IDBDatabase | null> | null = null;

	#open(): Promise<IDBDatabase | null> {
		if (this.#db) return this.#db;
		this.#db = new Promise<IDBDatabase | null>((resolve) => {
			try {
				if (typeof indexedDB === 'undefined') return resolve(null);
				const req = indexedDB.open(CAPTURE_DB_NAME, 1);
				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains(CAPTURE_STORE_NAME)) {
						db.createObjectStore(CAPTURE_STORE_NAME, { keyPath: 'key' });
					}
				};
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => resolve(null);
				req.onblocked = () => resolve(null);
			} catch {
				resolve(null);
			}
		});
		return this.#db;
	}

	async put(record: StoredCapture): Promise<StoreWrite> {
		const db = await this.#open();
		if (!db) return 'blocked';
		return new Promise<StoreWrite>((resolve) => {
			try {
				const tx = db.transaction(CAPTURE_STORE_NAME, 'readwrite');
				tx.objectStore(CAPTURE_STORE_NAME).put(record);
				tx.oncomplete = () => resolve('ok');
				tx.onerror = () => resolve(quota(tx.error));
				tx.onabort = () => resolve(quota(tx.error));
			} catch (err) {
				resolve(quota(err));
			}
		});
	}

	async remove(key: string): Promise<void> {
		const db = await this.#open();
		if (!db) return;
		await new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(CAPTURE_STORE_NAME, 'readwrite');
				tx.objectStore(CAPTURE_STORE_NAME).delete(key);
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
				tx.onabort = () => resolve();
			} catch {
				resolve();
			}
		});
	}

	async list(viewer: string, filing: string, now: number): Promise<StoredCapture[]> {
		const db = await this.#open();
		if (!db) return [];
		const all = await new Promise<StoredCapture[]>((resolve) => {
			try {
				const tx = db.transaction(CAPTURE_STORE_NAME, 'readonly');
				const req = tx.objectStore(CAPTURE_STORE_NAME).getAll();
				req.onsuccess = () => resolve((req.result as StoredCapture[]) ?? []);
				req.onerror = () => resolve([]);
			} catch {
				resolve([]);
			}
		});
		const mine: StoredCapture[] = [];
		for (const r of all) {
			if (!r || typeof r.key !== 'string') continue;
			// EXPIRY IS SWEPT FOR EVERY VIEWER, not only this one: an expired
			// photo of somebody else's notebook is exactly what the cap exists to
			// remove from a shared machine.
			if (expired(r, now)) {
				void this.remove(r.key);
				continue;
			}
			if (r.viewer === viewer && r.filing === filing && r.blob instanceof Blob) mine.push(r);
		}
		return sortOldest(mine);
	}
}

/** The store a browser capture uses; null on the server. */
export function browserCaptureStore(): CaptureStore | null {
	if (typeof window === 'undefined') return null;
	return new IdbCaptureStore();
}
