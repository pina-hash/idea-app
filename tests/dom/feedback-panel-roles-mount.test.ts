// tests/dom/feedback-panel-roles-mount.test.ts
//
// PROGRESSIVE FEEDBACK'S TWO SIDES, ON THE REAL `FeedbackPanel` (0238,
// decision 60). Asserted in both directions, with counts:
//
//   - a STUDENT's side carries no composer, no Resolve, no Edit note, no
//     Remove note and no Draw again, and does carry Fixed it and a reply box;
//   - an INSTRUCTOR's side carries the composer and every one of those, and no
//     Fixed it;
//   - a student with no notes sees no panel at all, and a site without 0238
//     shows nobody a panel;
//   - the list stamps "seen" once it has been on screen, and never moves a
//     thread's own activity time.
//
// Why it is a test and not only a harness: a student's panel that grew a
// Resolve key would render perfectly and resolve nothing (the database refuses
// it), which is exactly the control-whose-only-outcome-is-a-refusal this repo
// does not ship, and nobody looking at a teacher's screen would ever see it.
// Structure and events only; geometry is the browser pass's.

import { afterEach, describe, expect, it } from 'vitest';
import FeedbackPanel from '../../src/lib/classroom/feedback/FeedbackPanel.svelte';
import { FeedbackSession } from '../../src/lib/classroom/feedback/session.svelte';
import { createMemoryFeedback, type FeedbackTransports } from '../../src/lib/classroom/feedback/transports';
import type { FeedbackThread } from '../../src/lib/classroom/feedback/notes';
import { mountInto, type Mounted } from './mount';

const at = (min: number) => new Date(Date.parse('2026-10-14T17:00:00Z') + min * 60_000).toISOString();
const STUDENT = 'ana@boscotech.net';
const MANIFEST = { modules: [{ id: 'm1', title: 'Sketch', blocks: [{ id: 'b-why', field: 'why', prompt: 'Why?' }] }] };

function seed(): FeedbackThread[] {
	return [
		{
			id: 't-open',
			itemId: 'i1',
			itemTitle: 'Bracket',
			studentEmail: STUDENT,
			studentName: 'Ana Reyes',
			blockId: 'b-why',
			fileId: null,
			marks: null,
			authorName: 'Mr. Pina',
			createdAt: at(0),
			updatedAt: at(1),
			editedAt: null,
			fixedAt: null,
			resolvedAt: null,
			studentSeenAt: null,
			teacherSeenAt: at(1),
			viewer: 'teacher',
			sections: ['s1'],
			messages: [{ id: 'm1', role: 'teacher', name: 'Mr. Pina', body: 'Say why.', createdAt: at(1), editedAt: null, mine: true }]
		}
	];
}

const SELECTORS = {
	composer: '[data-testid="feedback-compose"]',
	resolve: '[data-testid="feedback-resolve"]',
	edit: '[data-testid="feedback-edit"]',
	removeNote: '[data-testid="feedback-remove"]',
	redraw: '[data-testid="feedback-redraw"]',
	fixed: '[data-testid="feedback-fixed"]',
	reply: '[data-testid="feedback-reply-box"]'
};

function count(m: Mounted) {
	return Object.fromEntries(Object.entries(SELECTORS).map(([k, sel]) => [k, m.all(sel).length]));
}

let mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
});

async function panel(transports: FeedbackTransports, side: 'student' | 'teacher', props: Record<string, unknown> = {}) {
	const session = new FeedbackSession({ transports, side, itemId: 'i1', studentEmail: side === 'teacher' ? STUDENT : null });
	await session.refresh();
	const m = mountInto(FeedbackPanel as never, {
		session,
		manifest: MANIFEST,
		annotateThread: () => {},
		...props
	});
	mounted.push(m);
	await m.settle();
	return { m, session };
}

describe('the two sides of one note', () => {
	it("a student's side has no instructor control, and has Fixed it and a reply", async () => {
		const memory = createMemoryFeedback({ seed: seed() });
		const { m } = await panel(memory.student(STUDENT), 'student');
		expect(m.all('[data-testid="feedback-panel"]').length).toBe(1);
		expect(count(m)).toEqual({ composer: 0, resolve: 0, edit: 0, removeNote: 0, redraw: 0, fixed: 1, reply: 1 });
	});

	it("an instructor's side has the composer and every instructor control, and no Fixed it", async () => {
		const memory = createMemoryFeedback({ seed: [{ ...seed()[0], fileId: 'f1', marks: { v: 1, shapes: [{ t: 'box', c: 'red', w: 1, p: [0, 0, 1, 1] }] } }] });
		const { m } = await panel(memory.teacher, 'teacher');
		expect(count(m)).toEqual({ composer: 1, resolve: 1, edit: 1, removeNote: 1, redraw: 1, fixed: 0, reply: 1 });
	});

	it('a student with no notes sees no panel, and a site without 0238 shows nobody one', async () => {
		const empty = createMemoryFeedback();
		const { m: none } = await panel(empty.student(STUDENT), 'student');
		expect(none.all('[data-testid="feedback-panel"]').length).toBe(0);
		const off: FeedbackTransports = { ...empty.teacher, list: async () => null };
		const { m: offStudent } = await panel({ ...off, post: undefined, update: undefined }, 'student');
		const { m: offTeacher } = await panel(off, 'teacher');
		expect(offStudent.all('[data-testid="feedback-panel"]').length).toBe(0);
		expect(offTeacher.all('[data-testid="feedback-panel"]').length).toBe(0);
		// Positive control: the same teacher transports with the function present do render.
		const { m: on } = await panel(empty.teacher, 'teacher');
		expect(on.all('[data-testid="feedback-panel"]').length).toBe(1);
	});
});

describe('the conversation, on the real buttons', () => {
	it('a reply and Fixed it reach the transports and change the words on screen', async () => {
		const memory = createMemoryFeedback({ seed: seed() });
		const { m } = await panel(memory.student(STUDENT), 'student');
		const box = m.one<HTMLTextAreaElement>(SELECTORS.reply);
		box.value = 'Because the hole tore out.';
		box.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		m.one<HTMLButtonElement>('[data-testid="feedback-send"]').click();
		await m.settle();
		expect(memory.calls).toContain('student:reply');
		expect(m.one('[data-testid="feedback-status"]').textContent).toBe('Waiting on your teacher');
		m.one<HTMLButtonElement>(SELECTORS.fixed).click();
		await m.settle();
		expect(m.one('[data-testid="feedback-status"]').textContent).toBe('You said fixed');
		expect(m.all('[data-testid="feedback-not-fixed"]').length).toBe(1);
		// The instructor now reads it as theirs to act on.
		const teacherView = (await memory.teacher.list({ itemId: 'i1' }))?.[0];
		expect(teacherView?.fixedAt).not.toBeNull();
	});

	it('stamps seen once the list has been on screen, and never moves the activity time', async () => {
		const memory = createMemoryFeedback({ seed: seed() });
		const { m, session } = await panel(memory.student(STUDENT), 'student');
		const before = session.threads[0].updatedAt;
		expect(session.unseenCount).toBe(1);
		await new Promise((r) => setTimeout(r, 1400));
		m.flush();
		expect(memory.calls.filter((c) => c === 'student:seen').length).toBe(1);
		expect(session.unseenCount).toBe(0);
		const stored = (await memory.student(STUDENT).list({ itemId: 'i1' }))?.[0];
		expect(stored?.updatedAt).toBe(before);
		expect(stored?.studentSeenAt).not.toBeNull();
	});
});

describe('the session folds a burst of reads into two', () => {
	it('three refreshes while one is in flight cost two reads', async () => {
		const memory = createMemoryFeedback({ seed: seed() });
		let reads = 0;
		const slow: FeedbackTransports = {
			...memory.teacher,
			list: async (a) => {
				reads++;
				await new Promise((r) => setTimeout(r, 20));
				return memory.teacher.list(a);
			}
		};
		const session = new FeedbackSession({ transports: slow, side: 'teacher', itemId: 'i1', studentEmail: STUDENT });
		await Promise.all([session.refresh(), session.refresh(), session.refresh()]);
		expect(reads).toBe(2);
		expect(session.state).toBe('ready');
		// A heartbeat stamp equal to what was read asks nothing; a newer one asks once.
		session.noteStamp(session.threads[0].updatedAt);
		await new Promise((r) => setTimeout(r, 40));
		expect(reads).toBe(2);
		session.noteStamp(at(30));
		await new Promise((r) => setTimeout(r, 40));
		expect(reads).toBe(3);
	});
});
