import { describe, expect, it, beforeEach } from 'vitest';
import {
	DRAFT_MIRROR_MAX_AGE_MS,
	readMirror,
	type DraftMirror
} from '$lib/notebook/draft-mirror';

/**
 * A shared school lab machine holding a student's unsaved writing is the
 * exposure this cap bounds. It moved from seven days to 24 hours because the
 * slot is unencrypted `localStorage` and is never swept on sign-out -- this
 * pins the boundary against the shipped module rather than trusting the
 * constant's own arithmetic, and controls the clock through the STORED
 * timestamp (never by editing the module) exactly as `readMirror` is called
 * in production.
 */

class MemoryStorage implements Storage {
	private map = new Map<string, string>();
	get length() {
		return this.map.size;
	}
	clear(): void {
		this.map.clear();
	}
	getItem(key: string): string | null {
		return this.map.has(key) ? this.map.get(key)! : null;
	}
	key(index: number): string | null {
		return Array.from(this.map.keys())[index] ?? null;
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
}

function mirrorAt(at: number): DraftMirror {
	return {
		v: 1,
		at,
		entryId: null,
		noteId: null,
		doc: { type: 'doc', content: [] },
		baseline: JSON.stringify({ type: 'doc', content: [] }),
		title: 'a title',
		sessionId: null,
		sectionId: null,
		folderId: null
	};
}

describe('draft mirror expiry', () => {
	let store: MemoryStorage;

	beforeEach(() => {
		store = new MemoryStorage();
		(globalThis as { localStorage?: Storage }).localStorage = store;
	});

	it('pins the cap at 24 hours', () => {
		expect(DRAFT_MIRROR_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
	});

	it('treats a slot older than 24 hours as expired', () => {
		const key = 'notebook_draft_mirror:u1:new';
		const writtenAt = 0;
		store.setItem(key, JSON.stringify(mirrorAt(writtenAt)));
		const now = writtenAt + DRAFT_MIRROR_MAX_AGE_MS + 1;
		expect(readMirror(key, now)).toBeNull();
		// Expiry also drops the stale slot rather than leaving it behind.
		expect(store.getItem(key)).toBeNull();
	});

	it('keeps a slot 23 hours old', () => {
		const key = 'notebook_draft_mirror:u1:new';
		const writtenAt = 0;
		store.setItem(key, JSON.stringify(mirrorAt(writtenAt)));
		const now = writtenAt + 23 * 60 * 60 * 1000;
		const mirror = readMirror(key, now);
		expect(mirror).not.toBeNull();
		expect(mirror?.at).toBe(writtenAt);
		expect(store.getItem(key)).not.toBeNull();
	});
});
