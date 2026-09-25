// tests/notebook-quick-note.test.ts
//
// THE QUICK NOTE AND THE INBOX (ledger 0298, R33). What is here is what would
// regress SILENTLY; the control itself is verified in a real browser through
// /dev/quick-note (tools/browser-verify/routes/quick-note-*.mjs).
//
//   - WHERE THE CONTROL IS OFFERED, in both directions. A private notebook
//     control on a projected deck is a student's notebook on the wall, and a
//     missing one on a classroom page is a feature nobody can reach; neither
//     throws or looks wrong in a type check.
//   - THE COMPOSER NEVER ADOPTS THE QUICK NOTE'S MIRROR. `latestMirror` answers
//     "the newest slot for this viewer"; without the exclusion the notebook
//     composer would put the quick note's writing in its own box and write into
//     the quick note's draft, two editors on one note chain.
//   - FILING WRITES FIRST AND DELETES SECOND, and a failed delete is reported as
//     "filed, old copy left", never as a failure to be pressed again. The wrong
//     order loses the note into Recently deleted; the wrong report files it twice.
//   - THE PAYLOAD IS A PRIVATE DRAFT (0118), filed by the route and nothing else.
// Every exclusion is paired with the positive control from the same fixture.

import { beforeEach, describe, expect, it } from 'vitest';
import {
	QUICK_NOTE_RECORD,
	draftMirrorKey,
	latestMirror,
	type DraftMirror
} from '$lib/notebook/draft-mirror';
import {
	fileDraft,
	inboxDrafts,
	inboxFileBlock,
	inboxTargets,
	quickNoteFiling,
	quickNoteHiddenIn,
	quickNoteOffered,
	quickNotePayload,
	quickNotePrefValue,
	removeInboxCopy
} from '$lib/notebook/quick-note';
import type { NotebookEntry, NotebookSession, NotePayload } from '$lib/notebook';
import type { NotebookNoteRow } from '$lib/notebook-notes';

// ---------------------------------------------------------------------------
// Where the control is offered
// ---------------------------------------------------------------------------

describe('quickNoteOffered', () => {
	const PRESENT = [
		'/',
		'/classroom',
		'/classroom/[sectionId]',
		'/classroom/[sectionId]/item/[itemId]',
		'/classroom/[sectionId]/people',
		'/classroom/[sectionId]/live',
		'/classroom/[sectionId]/notebook',
		'/classroom/notebook',
		'/classroom/todo',
		'/dev/quick-note/[...rest]',
		'/dev/theme-switch'
	];
	const ABSENT = [
		// Projected, inside the classroom: in PROJECTOR_ROUTES.
		'/classroom/[sectionId]/item/[itemId]/deck',
		'/classroom/[sectionId]/live/projector',
		// Games, CAD and the wall.
		'/gauntlet',
		'/gauntlet/speedrun/[id]',
		'/greenline',
		'/ideacad',
		'/ideacad/preview',
		'/tournaments/[id]/tv',
		'/fsp/live',
		// Documents served for a frame or a direct visit.
		'/a/[appId]/[...path]',
		'/b/[appId]/[versionId]/[...path]',
		'/hx/[docId]',
		// Rooms the quick note was never asked into.
		'/foundry',
		'/frc',
		'/tournaments',
		'/coin-desk',
		'/classroomx'
	];

	it('is offered on the home page, every classroom page and the notebook', () => {
		const offered = PRESENT.filter(quickNoteOffered);
		expect(offered).toEqual(PRESENT);
		expect(offered.length).toBe(11);
	});

	it('is not offered on a projected, game, CAD or document route, nor on a missing route id', () => {
		const offered = ABSENT.filter(quickNoteOffered);
		expect(offered).toEqual([]);
		expect(ABSENT.length).toBe(17);
		expect(quickNoteOffered(null)).toBe(false);
		expect(quickNoteOffered(undefined)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The mirror slot belongs to the quick note alone
// ---------------------------------------------------------------------------

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

function mirror(at: number, title: string): DraftMirror {
	const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] };
	return {
		v: 1,
		at,
		entryId: null,
		noteId: null,
		doc,
		baseline: JSON.stringify({ type: 'doc', content: [] }),
		title,
		sessionId: null,
		sectionId: null,
		folderId: null
	};
}

describe('the quick note mirror slot', () => {
	const VIEWER = 'viewer-1';
	let store: MemoryStorage;
	beforeEach(() => {
		store = new MemoryStorage();
		(globalThis as { localStorage?: Storage }).localStorage = store;
	});

	it('is keyed per viewer under the reserved record', () => {
		expect(draftMirrorKey(VIEWER, QUICK_NOTE_RECORD)).toBe('notebook_draft_mirror:viewer-1:quick');
	});

	it('is never what the composer restores, even when it is the newest slot', () => {
		const now = Date.now();
		store.setItem(draftMirrorKey(VIEWER, null), JSON.stringify(mirror(now - 5000, 'composer')));
		store.setItem(draftMirrorKey(VIEWER, QUICK_NOTE_RECORD), JSON.stringify(mirror(now - 1000, 'quick')));
		const found = latestMirror(VIEWER, now);
		// Positive control: the composer's own slot IS found from the same store.
		expect(found?.mirror.title).toBe('composer');
		expect(found?.key).toBe(draftMirrorKey(VIEWER, null));
	});

	it('leaves the composer nothing to restore when the quick note holds the only slot', () => {
		const now = Date.now();
		store.setItem(draftMirrorKey(VIEWER, QUICK_NOTE_RECORD), JSON.stringify(mirror(now, 'quick')));
		expect(latestMirror(VIEWER, now)).toBeNull();
		// Positive control: the same slot under an ordinary record id is found.
		store.setItem(draftMirrorKey(VIEWER, 'entry-9'), JSON.stringify(mirror(now, 'ordinary')));
		expect(latestMirror(VIEWER, now)?.mirror.title).toBe('ordinary');
	});
});

// ---------------------------------------------------------------------------
// Filing a quick note from the route
// ---------------------------------------------------------------------------

describe('quickNoteFiling and the payload', () => {
	it('files an assignment page note to the class, titled by the assignment', () => {
		const f = quickNoteFiling({ sectionId: 's-1', sectionLabel: 'ENG1H Period 2', itemTitle: '  Truss bridge  ' });
		expect(f).toEqual({ sectionId: 's-1', customLabel: 'Truss bridge', where: 'ENG1H Period 2, Truss bridge' });
	});

	it('files a class page note to the class with no title, and a home page note to nothing', () => {
		expect(quickNoteFiling({ sectionId: 's-1', sectionLabel: 'ENG1H Period 2' })).toEqual({
			sectionId: 's-1',
			customLabel: null,
			where: 'ENG1H Period 2'
		});
		expect(quickNoteFiling({ sectionId: null, itemTitle: 'ignored without a class' })).toEqual({
			sectionId: null,
			customLabel: null,
			where: 'your notebook Inbox'
		});
	});

	it('caps the title at the column limit in code points', () => {
		const long = 'x'.repeat(250);
		expect(quickNoteFiling({ sectionId: 's-1', itemTitle: long }).customLabel).toHaveLength(200);
	});

	it('is a private draft the autosave may replace, with no check-in and no folder', () => {
		const content = { type: 'doc', content: [] };
		const payload = quickNotePayload(quickNoteFiling({ sectionId: 's-1', itemTitle: 'T' }), content);
		expect(payload).toEqual({
			content,
			custom_label: 'T',
			folder_id: null,
			section_id: 's-1',
			submitted: false,
			autosave: true
		});
		expect('session_id' in payload).toBe(false);
	});
});

describe('the hide preference', () => {
	it('is hidden only for the exact stored value, and stores nothing for the default', () => {
		expect(quickNoteHiddenIn({ quickNote: { hidden: true } })).toBe(true);
		for (const v of [null, undefined, {}, { quickNote: null }, { quickNote: { hidden: 'yes' } }, { quickNote: [] }, []]) {
			expect(quickNoteHiddenIn(v)).toBe(false);
		}
		expect(quickNotePrefValue(true)).toEqual({ hidden: true });
		expect(quickNotePrefValue(false)).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// The Inbox
// ---------------------------------------------------------------------------

function noteRow(id: string, entryId: string, text: string, at: string, over: Partial<NotebookNoteRow> = {}): NotebookNoteRow {
	return {
		id,
		entry_id: entryId,
		note_id: id,
		revision: 1,
		content: [{ type: 'p', runs: [{ text }] }],
		created_at: at,
		updated_at: null,
		...over
	};
}

function entry(id: string, over: Partial<NotebookEntry> = {}): NotebookEntry {
	return {
		id,
		session_id: null,
		section_id: null,
		folder_id: null,
		pinned_at: null,
		custom_label: null,
		upload_timestamp: '2026-09-20T10:00:00Z',
		submitted_at: null,
		status: 'compliant',
		flag_reason: null,
		instructor_comment: null,
		session: null,
		photos: [],
		notes: [noteRow(`${id}-n`, id, `note ${id}`, '2026-09-20T10:00:00Z')],
		...over
	};
}

describe('inboxDrafts', () => {
	it('lists drafts that answer no check-in, newest written first, and nothing else', () => {
		const list = [
			entry('old', { upload_timestamp: '2026-09-18T10:00:00Z', notes: [noteRow('o', 'old', 'o', '2026-09-18T10:00:00Z')] }),
			entry('edited', {
				upload_timestamp: '2026-09-17T10:00:00Z',
				notes: [noteRow('e', 'edited', 'e', '2026-09-17T10:00:00Z', { updated_at: '2026-09-24T09:00:00Z' })]
			}),
			entry('classed', { section_id: 's-1', upload_timestamp: '2026-09-21T10:00:00Z' }),
			entry('turned-in', { submitted_at: '2026-09-22T10:00:00Z' }),
			entry('check-in-draft', { session_id: 'ses-1', section_id: 's-1' })
		];
		expect(inboxDrafts(list).map((e) => e.id)).toEqual(['edited', 'classed', 'old']);
	});
});

describe('inboxTargets', () => {
	const today = '2026-09-25';
	const sessions: NotebookSession[] = [
		{ id: 'ses-1', section_id: 's-1', unit_number: 2, session_date: '2026-09-25', session_label: 'Bridge check-in' },
		{ id: 'ses-0', section_id: 's-1', unit_number: 1, session_date: '2026-09-10', session_label: 'Old check-in' }
	];
	const classes = [
		{ id: 's-1', label: 'ENG1H' },
		{ id: 's-2', label: 'IDEA209H' }
	];

	it("offers a class draft its class's nearest open check-in, and nothing when the class has none", () => {
		const context = { sessions, entries: [], classes, today };
		expect(inboxTargets({ section_id: 's-1' }, context)).toEqual([
			{ kind: 'check-in', sectionId: 's-1', sessionId: 'ses-1', label: 'Bridge check-in', classLabel: null }
		]);
		expect(inboxTargets({ section_id: 's-2' }, context)).toEqual([]);
	});

	it('offers a draft with no class one destination per class, the check-in where there is one', () => {
		expect(inboxTargets({ section_id: null }, { sessions, entries: [], classes, today })).toEqual([
			{ kind: 'check-in', sectionId: 's-1', sessionId: 'ses-1', label: 'Bridge check-in', classLabel: 'ENG1H' },
			{ kind: 'class', sectionId: 's-2', label: 'IDEA209H' }
		]);
	});

	it('does not offer a check-in already turned in for', () => {
		const entries = [{ session_id: 'ses-1', submitted_at: '2026-09-25T08:00:00Z' }];
		expect(inboxTargets({ section_id: 's-1' }, { sessions, entries, classes, today })).toEqual([
			{ kind: 'check-in', sectionId: 's-1', sessionId: 'ses-0', label: 'Old check-in', classLabel: null }
		]);
	});
});

describe('fileDraft', () => {
	const target = { kind: 'check-in' as const, sectionId: 's-1', sessionId: 'ses-1', label: 'Bridge', classLabel: null };

	function fakes(opts: { create?: boolean; remove?: boolean } = {}) {
		const calls: string[] = [];
		const payloads: NotePayload[] = [];
		return {
			calls,
			payloads,
			transports: {
				async createNote(p: NotePayload) {
					calls.push('create');
					payloads.push(p);
					return opts.create === false ? { ok: false as const, error: 'refused' } : { ok: true as const, entryId: 'new-1', noteId: 'new-1-n' };
				},
				async deleteEntry(id: string) {
					calls.push(`delete:${id}`);
					return opts.remove === false ? { ok: false as const, error: 'offline' } : { ok: true as const };
				}
			}
		};
	}

	it('writes the note again where it belongs, as a draft, THEN deletes the inbox copy', async () => {
		const f = fakes();
		const e = entry('d-1', { custom_label: 'Gusset', folder_id: 'fold-1' });
		expect(await fileDraft(f.transports, e, target)).toEqual({ ok: true, entryId: 'new-1' });
		expect(f.calls).toEqual(['create', 'delete:d-1']);
		const p = f.payloads[0];
		expect(p.submitted).toBe(false);
		expect(p.session_id).toBe('ses-1');
		expect(p.section_id).toBe('s-1');
		expect(p.custom_label).toBe('Gusset');
		expect(p.folder_id).toBe('fold-1');
		expect('autosave' in p).toBe(false);
		expect(p.content.type).toBe('doc');
		expect(JSON.stringify(p.content)).toContain('note d-1');
	});

	it('deletes nothing when the write is refused', async () => {
		const f = fakes({ create: false });
		expect(await fileDraft(f.transports, entry('d-1'), target)).toEqual({ ok: false, stage: 'create', error: 'refused' });
		expect(f.calls).toEqual(['create']);
	});

	it('reports a failed delete as FILED with the old copy left, and the retry deletes without writing again', async () => {
		const f = fakes({ remove: false });
		expect(await fileDraft(f.transports, entry('d-1'), target)).toEqual({
			ok: false,
			stage: 'delete',
			entryId: 'new-1',
			error: 'offline'
		});
		const g = fakes();
		expect(await removeInboxCopy(g.transports, 'd-1', 'new-1')).toEqual({ ok: true, entryId: 'new-1' });
		expect(g.calls).toEqual(['delete:d-1']);
	});

	it('refuses to copy a draft with photos, with several notes, or with none, and writes nothing', async () => {
		const withPhoto = entry('p', {
			photos: [{ id: 'ph', drive_file_id: 'd', variant: 'original', sequence_order: 1, original_filename: 'a.jpg' }]
		});
		const twoNotes = entry('t', {
			notes: [noteRow('a', 't', 'a', '2026-09-20T10:00:00Z'), noteRow('b', 't', 'b', '2026-09-20T11:00:00Z')]
		});
		const empty = entry('z', { notes: [] });
		expect([withPhoto, twoNotes, empty].map(inboxFileBlock)).toEqual(['photos', 'notes', 'empty']);
		// Positive control: an ordinary quick note is fileable, and a REMOVED photo does not block it.
		const removed = entry('r', {
			photos: [{ id: 'ph', drive_file_id: 'd', variant: 'original', sequence_order: 1, original_filename: 'a.jpg', removed_at: '2026-09-21T00:00:00Z' }]
		});
		expect([entry('ok'), removed].map(inboxFileBlock)).toEqual([null, null]);
		const f = fakes();
		for (const e of [withPhoto, twoNotes, empty]) {
			const out = await fileDraft(f.transports, e, target);
			expect(out.ok).toBe(false);
		}
		expect(f.calls).toEqual([]);
	});
});
