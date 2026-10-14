// tests/classroom-feedback-notes.test.ts
//
// PROGRESSIVE FEEDBACK'S PURE RULES (0238, decision 60), on the real module.
//
// Why these are tests and not only a harness: every one of them fails
// silently. A resolved note counted under "Needs you" is a number nobody can
// check by eye; an old drawing laid over a replaced photograph looks like a
// drawing; a pin that opens the wrong note opens a note. The database half
// (who may do what, the marks gate) is tests/db/progressive-feedback-0238.test.ts,
// and the client's mirror of that gate is put to the same corpus there.

import { describe, expect, it } from 'vitest';
import {
	MARK_MAX_PEN_NUMBERS,
	attentionCount,
	feedbackPlace,
	feedbackPlaces,
	fieldNotes,
	inboxCounts,
	inboxThreads,
	marksByField,
	marksOk,
	parseThread,
	parseThreads,
	refusalOf,
	threadStatus,
	threadStatusWords,
	threadUnseen,
	thinStroke,
	wantsAttention,
	type FeedbackThread
} from '../src/lib/classroom/feedback/notes';
import { createMemoryFeedback } from '../src/lib/classroom/feedback/transports';

const MANIFEST = {
	header: [{ id: 'h-name', field: 'studentName', prompt: 'Your name' }],
	modules: [
		{
			id: 'm1',
			title: 'Sketch',
			blocks: [
				{ id: 'b-why', field: 'why', prompt: 'Why this shape?' },
				{ id: 'b-photo', field: 'photo' }
			]
		}
	]
};

const at = (min: number) => new Date(Date.parse('2026-10-14T17:00:00Z') + min * 60_000).toISOString();

function thread(over: Partial<FeedbackThread> = {}): FeedbackThread {
	return {
		id: 't1',
		itemId: 'i1',
		itemTitle: 'Bracket',
		studentEmail: 'ana@boscotech.net',
		studentName: 'Ana Reyes',
		blockId: 'b-why',
		fileId: null,
		marks: null,
		authorName: 'Mr. Pina',
		createdAt: at(0),
		updatedAt: at(0),
		editedAt: null,
		fixedAt: null,
		resolvedAt: null,
		studentSeenAt: at(0),
		teacherSeenAt: at(0),
		viewer: 'teacher',
		sections: ['s1'],
		messages: [{ id: 'm1', role: 'teacher', name: 'Mr. Pina', body: 'Say why.', createdAt: at(0), editedAt: null, mine: true }],
		...over
	};
}

describe('the drawing gate mirror', () => {
	it('admits null and every well-formed shape', () => {
		expect(marksOk(null)).toBe(true);
		expect(
			marksOk({
				v: 1,
				shapes: [
					{ t: 'pen', c: 'red', w: 1, p: [0, 0, 10, 10] },
					{ t: 'arrow', c: 'yellow', w: 3, p: [0, 0, 10000, 10000] },
					{ t: 'box', c: 'green', w: 2, p: [1, 2, 3, 4] },
					{ t: 'ellipse', c: 'blue', w: 2, p: [1, 2, 3, 4] },
					{ t: 'text', c: 'white', w: 2, p: [5, 5], s: 'Here' }
				]
			})
		).toBe(true);
	});

	it('refuses each malformed shape, one fault at a time', () => {
		const bad: unknown[] = [
			{ v: 2, shapes: [] },
			{ v: 1, shapes: [], extra: 1 },
			{ v: 1, shapes: [{ t: 'spray', c: 'red', w: 1, p: [0, 0, 1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'pink', w: 1, p: [0, 0, 1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 4, p: [0, 0, 1, 1] }] },
			{ v: 1, shapes: [{ t: 'pen', c: 'red', w: 1, p: [0, 0] }] },
			{ v: 1, shapes: [{ t: 'box', c: 'red', w: 1, p: [0, 0, 1] }] },
			{ v: 1, shapes: [{ t: 'box', c: 'red', w: 1, p: [0, 0, 1, 10001] }] },
			{ v: 1, shapes: [{ t: 'box', c: 'red', w: 1, p: [0, 0, 1, 1.5] }] },
			{ v: 1, shapes: [{ t: 'text', c: 'red', w: 1, p: [0, 0] }] },
			{ v: 1, shapes: [{ t: 'text', c: 'red', w: 1, p: [0, 0], s: '   ' }] },
			{ v: 1, shapes: [{ t: 'text', c: 'red', w: 1, p: [0, 0], s: 'x'.repeat(81) }] },
			{ v: 1, shapes: [{ t: 'box', c: 'red', w: 1, p: [0, 0, 1, 1], s: 'no words on a box' }] },
			{ v: 1, shapes: Array.from({ length: 201 }, () => ({ t: 'box', c: 'red', w: 1, p: [0, 0, 1, 1] })) }
		];
		for (const b of bad) expect(marksOk(b), JSON.stringify(b).slice(0, 80)).toBe(false);
		expect(bad.length).toBe(14);
	});

	it('thins a long stroke under the cap and keeps both ends', () => {
		const raw: number[] = [];
		for (let i = 0; i < 6000; i++) raw.push(i % 10000, (i * 3) % 10000);
		const thin = thinStroke(raw, 0);
		expect(thin.length).toBeLessThanOrEqual(MARK_MAX_PEN_NUMBERS);
		expect(thin.slice(0, 2)).toEqual(raw.slice(0, 2));
		expect(thin.slice(-2)).toEqual(raw.slice(-2));
	});
});

describe('where a thread stands', () => {
	it('reads whose turn it is from each side', () => {
		const t = thread();
		expect(threadStatus(t, 'teacher')).toBe('waiting');
		expect(threadStatus(t, 'student')).toBe('needs-you');
		const replied = thread({
			messages: [...t.messages, { id: 'm2', role: 'student', name: 'Ana', body: 'Done', createdAt: at(1), editedAt: null, mine: false }]
		});
		expect(threadStatus(replied, 'teacher')).toBe('needs-you');
		expect(threadStatusWords(replied, 'teacher')).toBe('Student replied');
		expect(threadStatusWords(replied, 'student')).toBe('Waiting on your teacher');
	});

	it('Fixed it is the teacher\'s to act on and the student\'s to wait on; resolved ends both', () => {
		const fixed = thread({ fixedAt: at(2) });
		expect(threadStatusWords(fixed, 'teacher')).toBe('Student says fixed');
		expect(threadStatusWords(fixed, 'student')).toBe('You said fixed');
		const done = thread({ fixedAt: at(2), resolvedAt: at(3) });
		expect(threadStatus(done, 'teacher')).toBe('resolved');
		expect(threadStatus(done, 'student')).toBe('resolved');
	});

	it('is unread until this side has seen the latest move', () => {
		expect(threadUnseen(thread({ studentSeenAt: null }), 'student')).toBe(true);
		expect(threadUnseen(thread({ updatedAt: at(5), studentSeenAt: at(4) }), 'student')).toBe(true);
		expect(threadUnseen(thread({ updatedAt: at(5), studentSeenAt: at(5) }), 'student')).toBe(false);
	});

	it('never asks for attention on a resolved thread, read or not', () => {
		const resolvedUnread = thread({ resolvedAt: at(3), updatedAt: at(3), studentSeenAt: at(1), teacherSeenAt: at(1) });
		expect(threadUnseen(resolvedUnread, 'student')).toBe(true);
		expect(wantsAttention(resolvedUnread, 'student')).toBe(false);
		expect(wantsAttention(resolvedUnread, 'teacher')).toBe(false);
		// Positive control: the same thread open does.
		expect(wantsAttention({ ...resolvedUnread, resolvedAt: null }, 'student')).toBe(true);
		expect(attentionCount([resolvedUnread, { ...resolvedUnread, id: 't2', resolvedAt: null }], 'student')).toBe(1);
	});
});

describe('pins and drawings over the worksheet', () => {
	it('pins the most urgent open note on each field and none on an all-resolved field', () => {
		const threads = [
			thread({ id: 'old', updatedAt: at(1), studentSeenAt: at(1) }),
			thread({ id: 'new', updatedAt: at(2), studentSeenAt: null }),
			thread({ id: 'done', blockId: 'h-name', resolvedAt: at(1), updatedAt: at(1), studentSeenAt: at(1) }),
			thread({ id: 'gone', blockId: 'b-removed' })
		];
		const notes = fieldNotes(MANIFEST, threads, 'student');
		expect(Object.keys(notes).sort()).toEqual(['why']);
		expect(notes.why.threadId).toBe('new');
		expect(notes.why.label).toBe('New note');
		expect(notes.why.aria).toContain('from your teacher');
	});

	it('lays a drawing on the picture the field is SHOWING, never on a replacement', () => {
		const marks = { v: 1 as const, shapes: [{ t: 'box' as const, c: 'red' as const, w: 1 as const, p: [0, 0, 5, 5] }] };
		const src = (id: string) => `/api/classroom/submission-file/${id}`;
		const threads = [
			thread({ id: 'a', blockId: 'b-photo', fileId: 'f-old', marks }),
			thread({ id: 'b', blockId: 'b-photo', fileId: 'f-new', marks, resolvedAt: at(1) })
		];
		// The field now shows f-new; the open drawing was on f-old.
		expect(marksByField({ photo: { url: src('f-new') } }, threads, src)).toEqual({});
		// Positive control: showing f-old, its drawing lands; the resolved one never does.
		expect(marksByField({ photo: { url: src('f-old') } }, threads, src)).toEqual({ photo: marks });
	});
});

describe('naming the place', () => {
	it('names a block by module and prompt, the header as Identity, and a vanished block by its id', () => {
		expect(feedbackPlace(MANIFEST, null)).toBe('The whole worksheet');
		expect(feedbackPlace(MANIFEST, 'b-why')).toBe('Sketch: Why this shape?');
		expect(feedbackPlace(MANIFEST, 'b-photo')).toBe('Sketch: photo');
		expect(feedbackPlace(MANIFEST, 'h-name')).toBe('Identity: Your name');
		expect(feedbackPlace(MANIFEST, 'b-removed')).toBe('b-removed');
		expect(feedbackPlaces(MANIFEST).map((p) => p.blockId)).toEqual([null, 'h-name', 'b-why', 'b-photo']);
	});
});

describe('the inbox views', () => {
	const threads = [
		thread({ id: 'reply', updatedAt: at(5), teacherSeenAt: at(5), messages: [...thread().messages, { id: 'x', role: 'student', name: 'Ana', body: 'ok', createdAt: at(5), editedAt: null, mine: false }] }),
		thread({ id: 'fixed', fixedAt: at(4), updatedAt: at(4), teacherSeenAt: at(4) }),
		thread({ id: 'wait', updatedAt: at(3), teacherSeenAt: at(3) }),
		thread({ id: 'done', resolvedAt: at(2), updatedAt: at(2), teacherSeenAt: at(1), sections: ['s2'] })
	];
	const f = { itemId: null, sectionId: null, query: '' };

	it('puts each thread in the views it belongs to, and resolved never in Needs you', () => {
		expect(inboxThreads(threads, { ...f, view: 'attention' }).map((t) => t.id)).toEqual(['reply', 'fixed']);
		expect(inboxThreads(threads, { ...f, view: 'fixed' }).map((t) => t.id)).toEqual(['fixed']);
		expect(inboxThreads(threads, { ...f, view: 'waiting' }).map((t) => t.id)).toEqual(['wait']);
		expect(inboxThreads(threads, { ...f, view: 'resolved' }).map((t) => t.id)).toEqual(['done']);
		expect(inboxCounts(threads, f)).toEqual({ attention: 2, fixed: 1, waiting: 1, resolved: 1, all: 4 });
	});

	it('narrows by class and by search', () => {
		expect(inboxThreads(threads, { ...f, view: 'all', sectionId: 's2' }).map((t) => t.id)).toEqual(['done']);
		expect(inboxThreads(threads, { ...f, view: 'all', query: 'OK' }).map((t) => t.id)).toEqual(['reply']);
	});
});

describe('reading what the database answers', () => {
	it('drops shapes that are not threads and messages that are not messages', () => {
		expect(parseThread(null)).toBeNull();
		expect(parseThread({ id: 'x' })).toBeNull();
		const t = parseThread({
			id: 't',
			item_id: 'i',
			student_email: 'a@b',
			viewer: 'student',
			marks: { v: 1, shapes: [{ t: 'spray' }] },
			messages: [{ id: 'm', role: 'teacher', body: 'hi', created_at: at(0) }, { id: 'bad', role: 'parent', body: 'x' }]
		});
		expect(t?.marks).toBeNull();
		expect(t?.messages.map((m) => m.id)).toEqual(['m']);
		expect(parseThreads([{ id: 'a' }, 'junk'])).toEqual([]);
	});

	it('reads an unknown refusal as a failure, never as a sentence that does not exist', () => {
		expect(refusalOf({ reason: 'rate' })).toBe('rate');
		expect(refusalOf({ reason: 'constructor' })).toBe('failed');
		expect(refusalOf(null)).toBe('failed');
	});
});

describe('the in-memory twin keeps the rules a surface can see', () => {
	it('gives a student no way to post or edit, and only their own threads', async () => {
		const memory = createMemoryFeedback();
		expect(await memory.teacher.post!({ itemId: 'i', studentEmail: 'a@x', blockId: null, fileId: null, body: 'one', marks: null })).toMatchObject({ ok: true });
		await memory.teacher.post!({ itemId: 'i', studentEmail: 'b@x', blockId: null, fileId: null, body: 'two', marks: null });
		const ana = memory.student('a@x');
		expect(ana.post).toBeUndefined();
		expect(ana.update).toBeUndefined();
		expect((await ana.list({}))?.map((t) => t.messages[0].body)).toEqual(['one']);
		expect((await memory.teacher.list({}))?.length).toBe(2);
	});

	it('refuses a drawing with no picture and an empty note', async () => {
		const memory = createMemoryFeedback();
		const marks = { v: 1 as const, shapes: [{ t: 'box' as const, c: 'red' as const, w: 1 as const, p: [0, 0, 1, 1] }] };
		expect(await memory.teacher.post!({ itemId: 'i', studentEmail: 'a@x', blockId: null, fileId: null, body: '', marks })).toEqual({ ok: false, reason: 'file' });
		expect(await memory.teacher.post!({ itemId: 'i', studentEmail: 'a@x', blockId: null, fileId: null, body: '  ', marks: null })).toEqual({ ok: false, reason: 'empty' });
	});
});
