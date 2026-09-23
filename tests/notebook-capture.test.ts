// tests/notebook-capture.test.ts
//
// CAPTURE WHERE THE WORK IS (ledger 0297, package F4b).
//
// Every rule here fails SILENTLY when it breaks, which is why it is a test and
// not only a harness:
//
//   - FILING. A capture on an item with a check-in files against the
//     (check-in, class) pair; without one it files to the class with the item's
//     title. Filed wrong, the page is simply absent from the grid it was for.
//   - NOTHING HELD ONLY IN MEMORY. The photo is written to the device and sent
//     the moment it is taken, as a draft; a regression here looks exactly like a
//     working capture until a tab dies.
//   - THE RETRY THAT DOES NOT DUPLICATE A PAGE. A retried upload whose first
//     attempt actually landed would add the same page twice, and nothing on
//     screen would say why.
//   - PAIRING. `photoPages` pairs a corrected version with the page immediately
//     before it, so a correction offered on the wrong page, a page removal in
//     the wrong order or an unguarded restore attaches it to the wrong page.
//     Every order a student can produce is enumerated below against a simulated
//     table that appends the way `notebook_add_photo` does.

import { describe, expect, it } from 'vitest';
import {
	CAPTURE_LABEL_MAX,
	CAPTURE_STATES,
	captureFiling,
	captureLabel,
	captureLanded,
	captureTokenOf,
	captureUploadName,
	continuedDraft,
	entriesInFiling,
	pageRemovalOrder,
	pickCheckIn,
	restoreKeepsPairing,
	straightenTarget
} from '$lib/notebook/capture';
import { CaptureQueue, CAPTURE_UNCHECKED_NOTE, type CaptureTransports } from '$lib/notebook/capture-queue';
import { MemoryCaptureStore, CAPTURE_STORE_MAX_AGE_MS } from '$lib/notebook/capture-store';
import { photoPages, type NotebookPhoto } from '$lib/notebook';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';

const SECTION = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function checkIn(over: Partial<ClassCheckIn>): ClassCheckIn {
	return {
		session_id: 'sess-a',
		section_id: SECTION,
		unit_number: 3,
		session_date: '2026-09-23',
		session_label: 'Gearbox teardown',
		status: null,
		flag_reason: null,
		item_id: 'item-1',
		...over
	} as ClassCheckIn;
}

describe('filing: check-in first, otherwise the class and the item title', () => {
	it('files against the check-in pair when the item has one', () => {
		const f = captureFiling({
			sectionId: SECTION,
			itemId: 'item-1',
			itemTitle: 'Gearbox teardown',
			checkIns: [checkIn({})],
			today: '2026-09-23'
		});
		expect(f).toEqual({
			sectionId: SECTION,
			sessionId: 'sess-a',
			customLabel: null,
			key: `session:${SECTION}:sess-a`,
			label: 'Gearbox teardown'
		});
	});

	it('files to the class with the item title when the item has none', () => {
		const f = captureFiling({
			sectionId: SECTION,
			itemId: 'item-9',
			itemTitle: '  Bridge truss lab  ',
			checkIns: [],
			today: '2026-09-23'
		});
		expect(f).toEqual({
			sectionId: SECTION,
			sessionId: null,
			customLabel: 'Bridge truss lab',
			key: `item:${SECTION}:item-9`,
			label: 'Bridge truss lab'
		});
	});

	it('ignores a check-in posted to a different class', () => {
		const f = captureFiling({
			sectionId: SECTION,
			itemId: 'item-1',
			itemTitle: 'Gearbox',
			checkIns: [checkIn({ section_id: OTHER })],
			today: '2026-09-23'
		});
		expect(f.sessionId).toBeNull();
		expect(f.customLabel).toBe('Gearbox');
	});

	it('caps the label at 200 code points, never splitting a character', () => {
		const long = 'a'.repeat(199) + '😀' + 'tail';
		const label = captureLabel(long) as string;
		expect(Array.from(label).length).toBe(CAPTURE_LABEL_MAX);
		expect(label.endsWith('😀')).toBe(true);
		expect(captureLabel('   ')).toBeNull();
	});

	it("picks today's check-in, else the latest past one, else the soonest coming", () => {
		const past = checkIn({ session_id: 'p', session_date: '2026-09-20' });
		const today = checkIn({ session_id: 't', session_date: '2026-09-23' });
		const next = checkIn({ session_id: 'n', session_date: '2026-09-25' });
		const later = checkIn({ session_id: 'l', session_date: '2026-09-30' });
		expect(pickCheckIn([next, past, today], '2026-09-23')?.session_id).toBe('t');
		expect(pickCheckIn([next, past], '2026-09-23')?.session_id).toBe('p');
		expect(pickCheckIn([later, next], '2026-09-23')?.session_id).toBe('n');
		expect(pickCheckIn([], '2026-09-23')).toBeNull();
	});

	it('finds what was already filed, and the draft a capture continues', () => {
		const filing = captureFiling({
			sectionId: SECTION,
			itemId: 'item-9',
			itemTitle: 'Bridge truss lab',
			checkIns: [],
			today: '2026-09-23'
		});
		const e = (id: string, over: Record<string, unknown>) => ({
			id,
			section_id: SECTION,
			session_id: null,
			custom_label: 'Bridge truss lab',
			upload_timestamp: '2026-09-23T10:00:00Z',
			submitted_at: '2026-09-23T10:05:00Z',
			...over
		});
		const entries = [
			e('turned-in', {}),
			e('draft', { upload_timestamp: '2026-09-23T11:00:00Z', submitted_at: null }),
			e('other-title', { custom_label: 'Something else', submitted_at: null }),
			e('other-class', { section_id: OTHER, submitted_at: null }),
			e('check-in', { session_id: 'sess-a', submitted_at: null })
		];
		expect(entriesInFiling(entries, filing).map((x) => x.id)).toEqual(['draft', 'turned-in']);
		expect(continuedDraft(entries, filing)?.id).toBe('draft');
	});
});

describe('the name a photo travels under', () => {
	it('carries the token, keeps the extension, and reads back', () => {
		const name = captureUploadName('IMG_2041.HEIC', 'abc12345');
		expect(name).toBe('IMG_2041-cabc12345.heic');
		expect(captureTokenOf(name)).toBe('abc12345');
		expect(captureTokenOf('IMG_2041.jpg')).toBeNull();
		// Re-stamping replaces, never stacks.
		expect(captureUploadName(name, 'zzzzzzzz')).toBe('IMG_2041-czzzzzzzz.heic');
		expect(captureUploadName('', 'abc12345')).toBe('photo-cabc12345.jpg');
	});

	it('every state has a word and a glyph, and no two share either', () => {
		const words = Object.values(CAPTURE_STATES).map((s) => s.word);
		const glyphs = Object.values(CAPTURE_STATES).map((s) => s.glyph);
		expect(words.every((w) => w.length > 0)).toBe(true);
		expect(new Set(words).size).toBe(words.length);
		expect(new Set(glyphs).size).toBe(glyphs.length);
	});
});

// ---------------------------------------------------------------------------
// The upload sequence
// ---------------------------------------------------------------------------

interface Call {
	route: 'upload' | 'add-photo';
	fields: Record<string, string>;
	name: string;
	storedAtCall: number;
}

/** A server that stores photos the way the two routes do, with switchable faults. */
function fakeServer(store: MemoryCaptureStore) {
	const calls: Call[] = [];
	const photos: { entryId: string; name: string }[] = [];
	let nextEntry = 1;
	const faults: ('throw-after-store' | 'throw-before-store' | 'refuse')[] = [];
	const fieldsOf = (form: FormData) => {
		const out: Record<string, string> = {};
		for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
		return out;
	};
	const transports: CaptureTransports = {
		async createEntry(form) {
			const file = form.get('photo') as File;
			calls.push({ route: 'upload', fields: fieldsOf(form), name: file.name, storedAtCall: store.records.size });
			const fault = faults.shift();
			if (fault === 'refuse') return { ok: false, error: 'That photo is too large.', retryable: false };
			if (fault === 'throw-before-store') throw new Error('network');
			const entryId = `entry-${nextEntry++}`;
			photos.push({ entryId, name: file.name });
			if (fault === 'throw-after-store') throw new Error('network');
			return { ok: true, entryId };
		},
		async addPhoto(form) {
			const file = form.get('photo') as File;
			calls.push({ route: 'add-photo', fields: fieldsOf(form), name: file.name, storedAtCall: store.records.size });
			const fault = faults.shift();
			if (fault === 'refuse') return { ok: false, error: 'Refused.' };
			if (fault === 'throw-before-store') throw new Error('network');
			photos.push({ entryId: String(form.get('entry_id')), name: file.name });
			if (fault === 'throw-after-store') throw new Error('network');
			return { ok: true };
		},
		async findUpload(name) {
			const hit = photos.find((p) => p.name === name);
			return hit ? { entryId: hit.entryId } : null;
		}
	};
	return { transports, calls, photos, faults };
}

let seed = 0;
const random = (n: number) => {
	const b = new Uint8Array(n);
	for (let i = 0; i < n; i++) b[i] = (seed * 7 + i * 13 + 1) % 251;
	seed++;
	return b;
};

const photo = (name: string) => new File([new Uint8Array([1, 2, 3, name.length])], name, { type: 'image/jpeg' });

function queue(store: MemoryCaptureStore, t: CaptureTransports, entryId: string | null = null, sessionId: string | null = 'sess-a') {
	return new CaptureQueue({
		viewer: 'student-1',
		filing: {
			sectionId: SECTION,
			sessionId,
			customLabel: sessionId ? null : 'Bridge truss lab',
			key: sessionId ? `session:${SECTION}:${sessionId}` : `item:${SECTION}:item-9`,
			label: 'Bridge truss lab'
		},
		entryId,
		transports: t,
		store,
		random,
		now: () => 1_000_000
	});
}

describe('upload on take: the first photo creates a draft, every later one joins it', () => {
	it('POSTs the first photo as a draft filed to the check-in, the second onto the entry it got back', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		const q = queue(store, server.transports);
		await q.add(photo('page1.jpg'));
		await q.drain();
		await q.add(photo('page2.jpg'));
		await q.drain();

		expect(server.calls.map((c) => c.route)).toEqual(['upload', 'add-photo']);
		expect(server.calls[0].fields).toEqual({ section_id: SECTION, session_id: 'sess-a', submitted: 'false' });
		expect(server.calls[1].fields).toEqual({ entry_id: 'entry-1', variant: 'original' });
		expect(q.entryId).toBe('entry-1');
		expect(q.items.map((i) => i.state)).toEqual(['uploaded', 'uploaded']);
		// Acknowledged, so nothing is left on the device.
		expect(store.records.size).toBe(0);
	});

	it('files to the class with the title when there is no check-in', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		const q = queue(store, server.transports, null, null);
		await q.add(photo('truss.jpg'));
		await q.drain();
		expect(server.calls[0].fields).toEqual({
			section_id: SECTION,
			custom_label: 'Bridge truss lab',
			submitted: 'false'
		});
	});

	it('joins the draft the server already has instead of starting another', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		const q = queue(store, server.transports, 'entry-existing');
		await q.add(photo('page3.jpg'));
		await q.drain();
		expect(server.calls.map((c) => c.route)).toEqual(['add-photo']);
		expect(server.calls[0].fields.entry_id).toBe('entry-existing');
	});

	it('NEVER HELD ONLY IN MEMORY: the device copy exists before the request is made, and the request is made at once', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		const q = queue(store, server.transports);
		// `add` resolves once the photo is kept and the upload has been started.
		const taken = q.add(photo('page1.jpg'));
		await taken;
		// The upload started without anybody pressing anything else.
		expect(server.calls.length).toBe(1);
		// And when it was sent, the device already held the bytes.
		expect(server.calls[0].storedAtCall).toBe(1);
		await q.drain();
		expect(store.records.size).toBe(0);
	});

	it('shows the states in order: on this device, uploading, uploaded', async () => {
		const store = new MemoryCaptureStore();
		const seen: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const server = fakeServer(store);
		const slow: CaptureTransports = {
			...server.transports,
			createEntry: async (form) => {
				await gate;
				return server.transports.createEntry(form);
			}
		};
		const q = new CaptureQueue({
			viewer: 'student-1',
			filing: { sectionId: SECTION, sessionId: null, customLabel: 'X', key: 'item:x', label: 'X' },
			entryId: null,
			transports: slow,
			store,
			random,
			onChange: () => {
				const s = q.items[0]?.state;
				if (s && seen[seen.length - 1] !== s) seen.push(s);
			}
		});
		await q.add(photo('a.jpg'));
		expect(q.items[0].state).toBe('uploading');
		release();
		await q.drain();
		expect(seen).toEqual(['device', 'uploading', 'uploaded']);
	});

	it('says so out loud when the device refuses to keep the photo, and still uploads it', async () => {
		const store = new MemoryCaptureStore();
		store.refuse = 'full';
		const server = fakeServer(store);
		const q = queue(store, server.transports);
		const item = await q.add(photo('big.jpg'));
		expect(item.kept).toBe(false);
		expect(q.notice).toMatch(/out of space/);
		await q.drain();
		expect(q.items[0].state).toBe('uploaded');
	});
});

describe('THE RETRY THAT DOES NOT DUPLICATE A PAGE', () => {
	it('a first photo that landed before the connection dropped is found, not sent again', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		server.faults.push('throw-after-store');
		const q = queue(store, server.transports);
		await q.add(photo('page1.jpg'));
		await q.drain();
		expect(q.items[0].state).toBe('failed');
		expect(q.items[0].verifyFirst).toBe(true);
		// The device still holds it while the outcome is unknown.
		expect(store.records.size).toBe(1);

		await q.retry(q.items[0].token);
		expect(server.calls.filter((c) => c.route === 'upload').length).toBe(1);
		expect(server.photos.length).toBe(1);
		expect(q.items[0].state).toBe('uploaded');
		// The entry it created is adopted, so the next photo joins it.
		expect(q.entryId).toBe('entry-1');
		await q.add(photo('page2.jpg'));
		await q.drain();
		expect(server.calls.map((c) => c.route)).toEqual(['upload', 'add-photo']);
		expect(server.photos.map((p) => p.entryId)).toEqual(['entry-1', 'entry-1']);
	});

	it('a photo that did NOT land is sent again, exactly once', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		const q = queue(store, server.transports, 'entry-9');
		server.faults.push('throw-before-store');
		await q.add(photo('page2.jpg'));
		await q.drain();
		expect(q.items[0].state).toBe('failed');
		await q.retry(q.items[0].token);
		expect(server.photos.length).toBe(1);
		expect(server.calls.filter((c) => c.route === 'add-photo').length).toBe(2);
	});

	it('a read that fails waits rather than guessing', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		server.faults.push('throw-after-store');
		const q = queue(store, {
			...server.transports,
			findUpload: async () => 'unknown'
		});
		await q.add(photo('page1.jpg'));
		await q.drain();
		await q.retry(q.items[0].token);
		expect(q.items[0].state).toBe('failed');
		expect(q.items[0].error).toBe(CAPTURE_UNCHECKED_NOTE);
		expect(server.photos.length).toBe(1);
	});

	it('a failure holds the line: a later photo waits rather than overtaking it', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		const q = queue(store, server.transports, 'entry-9');
		server.faults.push('throw-before-store');
		await q.add(photo('page1.jpg'));
		await q.drain();
		await q.add(photo('page2.jpg'));
		await q.drain();
		expect(q.items.map((i) => i.state)).toEqual(['failed', 'device']);
		expect(server.photos.length).toBe(0);
		await q.retry(q.items[0].token);
		expect(server.photos.map((p) => p.name)).toEqual([q.items[0].uploadName, q.items[1].uploadName]);
	});

	it('a tab that comes back resumes what the last one left, checking first', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		// Tab one: the first photo lands but the answer never arrives; the
		// second never reaches the server. Then the tab dies.
		server.faults.push('throw-after-store');
		const one = queue(store, server.transports);
		await one.add(photo('page1.jpg'));
		await one.drain();
		one.close();
		expect(store.records.size).toBe(1);

		// Tab two, same viewer and filing, finds it on the device.
		const two = queue(store, server.transports);
		await two.resume();
		expect(two.items.length).toBe(1);
		expect(two.items[0].state).toBe('uploaded');
		expect(server.photos.length).toBe(1);
		expect(store.records.size).toBe(0);
	});

	it('another viewer on the same machine never sees the stored photo', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		server.faults.push('throw-before-store');
		await queue(store, server.transports).add(photo('mine.jpg'));
		const other = new CaptureQueue({
			viewer: 'student-2',
			filing: { sectionId: SECTION, sessionId: 'sess-a', customLabel: null, key: `session:${SECTION}:sess-a`, label: 'Gearbox teardown' },
			entryId: null,
			transports: server.transports,
			store,
			random
		});
		await other.resume();
		expect(other.items.length).toBe(0);
		// Positive control: the owner does see it.
		expect((await store.list('student-1', `session:${SECTION}:sess-a`, 1_000_000)).length).toBe(1);
	});

	it('a stored photo past the age cap is swept, not resumed', async () => {
		const store = new MemoryCaptureStore();
		const server = fakeServer(store);
		server.faults.push('throw-before-store');
		await queue(store, server.transports).add(photo('old.jpg'));
		const later = await store.list('student-1', `session:${SECTION}:sess-a`, 1_000_000 + CAPTURE_STORE_MAX_AGE_MS + 1);
		expect(later.length).toBe(0);
		expect(store.records.size).toBe(0);
	});

	it('captureLanded counts a photo removed after it landed', () => {
		expect(captureLanded([{ original_filename: 'a-cx.jpg' }], 'a-cx.jpg')).toBe(true);
		expect(captureLanded([{ original_filename: 'b.jpg' }], 'a-cx.jpg')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Pairing, enumerated
// ---------------------------------------------------------------------------

interface SimPhoto extends NotebookPhoto {
	/** The original a corrected row was really made from (the test's truth). */
	madeFrom: string | null;
}

type Op = { kind: 'take' } | { kind: 'straighten' } | { kind: 'remove'; page: number } | { kind: 'restore'; index: number };

/** notebook_add_photo: append at max(sequence_order)+1 over every row, removed included. */
function append(rows: SimPhoto[], variant: 'original' | 'enhanced', madeFrom: string | null, clock: number): SimPhoto[] {
	const seq = rows.reduce((m, r) => Math.max(m, r.sequence_order), 0) + 1;
	return [
		...rows,
		{
			id: `p${seq}`,
			drive_file_id: `d${seq}`,
			variant,
			sequence_order: seq,
			original_filename: `p${seq}.jpg`,
			removed_at: null,
			created_at: iso(clock),
			madeFrom
		}
	];
}

const iso = (n: number) => new Date(Date.UTC(2026, 8, 23, 10, 0, n)).toISOString();

/** Apply one op the way the capture surface allows it; null when the surface would not offer it. */
type Guards = { straighten: boolean; restore: boolean };
const GUARDED: Guards = { straighten: true, restore: true };

function apply(rows: SimPhoto[], op: Op, clock: number, guards: Guards = GUARDED): SimPhoto[] | null {
	if (op.kind === 'take') return append(rows, 'original', null, clock);
	if (op.kind === 'straighten') {
		const target = guards.straighten ? straightenTarget(rows) : unguardedFirstPage(rows);
		if (!target) return null;
		return append(rows, 'enhanced', target.id, clock);
	}
	if (op.kind === 'remove') {
		const page = photoPages(rows)[op.page];
		if (!page) return null;
		const ids = pageRemovalOrder(page);
		return rows.map((r) => (ids.includes(r.id) ? { ...r, removed_at: iso(clock) } : r));
	}
	const removed = rows.filter((r) => r.removed_at);
	const target = removed[op.index];
	if (!target) return null;
	if (guards.restore && !restoreKeepsPairing(rows, target.id)) return null;
	return rows.map((r) => (r.id === target.id ? { ...r, removed_at: null } : r));
}

/** The shape the guard exists to refuse: straighten page 1 whatever came after it. */
function unguardedFirstPage(rows: SimPhoto[]): NotebookPhoto | null {
	const first = photoPages(rows)[0];
	return first && first.original && !first.enhanced ? first.original : null;
}

/** Every rendered page's corrected version really was made from that page's original. */
function paired(rows: SimPhoto[]): boolean {
	for (const page of photoPages(rows)) {
		if (!page.enhanced) continue;
		const truth = rows.find((r) => r.id === page.enhanced!.id)!.madeFrom;
		if (page.original && truth !== page.original.id) return false;
	}
	return true;
}

const OPS: Op[] = [
	{ kind: 'take' },
	{ kind: 'straighten' },
	{ kind: 'remove', page: 0 },
	{ kind: 'remove', page: 1 },
	{ kind: 'remove', page: 2 },
	{ kind: 'restore', index: 0 },
	{ kind: 'restore', index: 1 }
];

function enumerate(depth: number, guards: Guards): { states: number; broken: number } {
	let states = 0;
	let broken = 0;
	const walk = (rows: SimPhoto[], d: number) => {
		states++;
		if (!paired(rows)) broken++;
		if (d === depth) return;
		for (const op of OPS) {
			const next = apply(rows, op, d + 1, guards);
			if (next) walk(next, d + 1);
		}
	};
	walk([], 0);
	return { states, broken };
}

describe('PAIRING: every order a student can produce keeps each correction on its own page', () => {
	it('holds over every sequence of take, straighten, remove and restore up to eight steps', () => {
		const { states, broken } = enumerate(8, GUARDED);
		expect(states).toBeGreaterThan(5000);
		expect(broken).toBe(0);
	});

	it('POSITIVE CONTROL: straightening page 1 after page 2 landed does mispair, so the check can fail', () => {
		const { broken } = enumerate(4, { straighten: false, restore: true });
		expect(broken).toBeGreaterThan(0);
		let rows: SimPhoto[] = [];
		rows = apply(rows, { kind: 'take' }, 1)!;
		rows = apply(rows, { kind: 'take' }, 2)!;
		rows = apply(rows, { kind: 'straighten' }, 3, { straighten: false, restore: true })!;
		expect(paired(rows)).toBe(false);
	});

	it('POSITIVE CONTROL: an unguarded restore mispairs, so the restore guard is load-bearing', () => {
		const { broken } = enumerate(6, { straighten: true, restore: false });
		expect(broken).toBeGreaterThan(0);
	});

	it('straighten is offered on the last page only, and only once', () => {
		let rows: SimPhoto[] = [];
		expect(straightenTarget(rows)).toBeNull();
		rows = apply(rows, { kind: 'take' }, 1)!;
		expect(straightenTarget(rows)?.id).toBe('p1');
		rows = apply(rows, { kind: 'take' }, 2)!;
		expect(straightenTarget(rows)?.id).toBe('p2');
		rows = apply(rows, { kind: 'straighten' }, 3)!;
		expect(straightenTarget(rows)).toBeNull();
	});

	it('removing a page removes the corrected version first', () => {
		const pages = photoPages([
			{ id: 'o', drive_file_id: 'd', variant: 'original', sequence_order: 1, original_filename: null },
			{ id: 'e', drive_file_id: 'd', variant: 'enhanced', sequence_order: 2, original_filename: null }
		]);
		expect(pageRemovalOrder(pages[0])).toEqual(['e', 'o']);
	});

	it('refuses a restore that would put an original between another page and its correction', () => {
		let rows: SimPhoto[] = [];
		rows = apply(rows, { kind: 'take' }, 1)!; // p1
		rows = apply(rows, { kind: 'take' }, 2)!; // p2
		rows = apply(rows, { kind: 'remove', page: 1 }, 3)!; // p2 removed
		rows = apply(rows, { kind: 'straighten' }, 4)!; // p3 corrects p1
		expect(paired(rows)).toBe(true);
		expect(restoreKeepsPairing(rows, 'p2')).toBe(false);
	});
});
